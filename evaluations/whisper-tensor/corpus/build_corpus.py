#!/usr/bin/env python3
"""Build the reproducible Whisper benchmark corpus (no private audio, nothing recorded from a phone).

Sources
- FLEURS dev split (google/fleurs, CC-BY-4.0): human read speech with reference transcripts,
  es_419 (Latin-American Spanish) and ca_es (Catalan). FLEURS has no Valencian-specific split and
  no es-ES split: the report states this limitation. The dev.tar.gz archives are streamed and the
  download stops as soon as the selected clips have been extracted.
- Deterministic synthetic signals (seeded): digital silence, white/pink noise, mains hum.
- Derived streams: concatenations for real-time replay (speech crossing 3 s/6 s window boundaries)
  and a LEVEL test (loud clip followed by the same-language clip 30 dB lower over a noise floor).
  Attenuation is only a level test; it is NOT equivalent to a person two metres away (no room
  reverberation, no distance-dependent spectrum, no competing near voice).

Output: <out>/<id>.pcm (PCM16LE mono 16 kHz) and <out>/manifest.json with origin, licence, language,
reference, sample rate, duration and SHA-256 per file. Audio is not committed to Git; the committed
manifest (evaluations/whisper-tensor/corpus/manifest.json) lets anyone check a rebuild byte for byte.

Usage: python -I build_corpus.py --out <dir> [--per-language 8]
Only the Python standard library is used.
"""
import argparse
import csv
import hashlib
import io
import json
import math
import os
import random
import struct
import sys
import tarfile
import urllib.request

RATE = 16000
FLEURS = "https://huggingface.co/datasets/google/fleurs/resolve/main/data/{lang}/{path}"
FLEURS_LICENSE = "CC-BY-4.0 (google/fleurs; Conneau et al. 2022, https://huggingface.co/datasets/google/fleurs)"
LANGS = {"es_419": "es", "ca_es": "ca"}


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "faceclaw-whisper-bench/1"})
    return urllib.request.urlopen(request, timeout=120)


def pcm_bytes(samples):
    return struct.pack("<%dh" % len(samples), *[max(-32768, min(32767, int(round(s)))) for s in samples])


def read_wav(data):
    """PCM16 or IEEE-float RIFF/WAVE at 16 kHz (FLEURS ships float32); returns PCM16-scaled floats."""
    if data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise ValueError("not a WAVE file")
    position, fmt, payload = 12, None, None
    while position + 8 <= len(data):
        chunk, size = data[position:position + 4], struct.unpack("<I", data[position + 4:position + 8])[0]
        body = data[position + 8:position + 8 + size]
        if chunk == b"fmt ":
            fmt = struct.unpack("<HHIIHH", body[:16])
        elif chunk == b"data":
            payload = body
        position += 8 + size + (size & 1)
    tag, channels, rate, _, _, bits = fmt
    if rate != RATE:
        raise ValueError("unexpected sample rate %d" % rate)
    if tag == 1 and bits == 16:
        values = [v for v in struct.unpack("<%dh" % (len(payload) // 2), payload)]
    elif tag == 3 and bits == 32:
        values = [v * 32767.0 for v in struct.unpack("<%df" % (len(payload) // 4), payload)]
    else:
        raise ValueError("unsupported WAVE format %d/%d bits" % (tag, bits))
    if channels > 1:
        values = [sum(values[i:i + channels]) / channels for i in range(0, len(values), channels)]
    return values


def select_fleurs(lang, per_language):
    """Distinct sentences, 5..20 s, in TSV order; deterministic for a given dataset revision."""
    with fetch(FLEURS.format(lang=lang, path="dev.tsv")) as response:
        rows = list(csv.reader(io.TextIOWrapper(response, encoding="utf-8"), delimiter="\t", quoting=csv.QUOTE_NONE))
    chosen, seen = {}, set()
    for row in rows:
        sentence_id, file_name, raw, num_samples = row[0], row[1], row[2], int(row[5])
        if sentence_id in seen or not (5 * RATE <= num_samples <= 20 * RATE):
            continue
        seen.add(sentence_id)
        chosen[file_name] = raw
        if len(chosen) == per_language * 3:  # candidates; the stream order decides which arrive first
            break
    return chosen


def stream_fleurs(lang, candidates, per_language):
    found = {}
    with fetch(FLEURS.format(lang=lang, path="audio/dev.tar.gz")) as response:
        with tarfile.open(fileobj=response, mode="r|gz") as archive:
            for member in archive:
                name = os.path.basename(member.name)
                if member.isfile() and name in candidates:
                    found[name] = read_wav(archive.extractfile(member).read())
                    if len(found) == per_language:
                        break
    return found


def noise(kind, seconds, dbfs, seed):
    rng = random.Random(seed)
    amplitude = 32768 * 10 ** (dbfs / 20)
    out = []
    if kind == "white":
        out = [rng.gauss(0, 1) for _ in range(seconds * RATE)]
    elif kind == "pink":  # Paul Kellet's economy filter
        b0 = b1 = b2 = 0.0
        for _ in range(seconds * RATE):
            w = rng.gauss(0, 1)
            b0 = 0.99765 * b0 + w * 0.0990460
            b1 = 0.96300 * b1 + w * 0.2965164
            b2 = 0.57000 * b2 + w * 1.0526913
            out.append(b0 + b1 + b2 + w * 0.1848)
    elif kind == "hum":
        out = [math.sin(2 * math.pi * 50 * i / RATE) + 0.3 * math.sin(2 * math.pi * 150 * i / RATE) + 0.05 * rng.gauss(0, 1)
               for i in range(seconds * RATE)]
    rms = math.sqrt(sum(v * v for v in out) / len(out))
    return [v / rms * amplitude for v in out]


def scaled(samples, db):
    factor = 10 ** (db / 20)
    return [v * factor for v in samples]


def build(out_dir, per_language):
    os.makedirs(out_dir, exist_ok=True)
    entries, speech = [], {}
    for lang, code in LANGS.items():
        candidates = select_fleurs(lang, per_language)
        clips = stream_fleurs(lang, candidates, per_language)
        if len(clips) < per_language:
            sys.exit("FLEURS %s: only %d clips found" % (lang, len(clips)))
        speech[code] = []
        for index, (file_name, samples) in enumerate(sorted(clips.items())):
            fixture = "%s-fleurs-%02d" % (code, index)
            speech[code].append((fixture, samples, candidates[file_name]))
            entries.append(dict(id=fixture, kind="speech", language=code, reference=candidates[file_name],
                                origin="FLEURS dev %s/%s" % (lang, file_name), license=FLEURS_LICENSE, samples=samples))
    entries.append(dict(id="silence-digital-10s", kind="silence", language="", reference="",
                        origin="synthetic zeros", license="CC0 (generated)", samples=[0.0] * 10 * RATE))
    for kind, db, seed in (("white", -60, 1), ("pink", -45, 2), ("hum", -40, 3)):
        entries.append(dict(id="noise-%s-%ddbfs-10s" % (kind, -db), kind="noise", language="", reference="",
                            origin="synthetic %s noise, seed %d" % (kind, seed), license="CC0 (generated)",
                            samples=noise(kind, 10, db, seed)))

    rng = random.Random(42)

    def stream(stream_id, parts, note, language):
        samples, segments, references = [], [], []
        # Start 4.5 s in so the first sentence straddles the 3 s hop and 6 s window boundaries.
        samples.extend([0.0] * int(4.5 * RATE))
        for fixture, clip, reference in parts:
            start = len(samples)
            samples.extend(clip)
            segments.append(dict(fixture=fixture, startMs=start * 1000 // RATE, endMs=len(samples) * 1000 // RATE))
            references.append(reference)
            samples.extend([0.0] * int(rng.uniform(0.4, 1.2) * RATE))
        floor = noise("white", math.ceil(len(samples) / RATE), -65, 7)
        samples = [s + floor[i] for i, s in enumerate(samples)]
        entries.append(dict(id=stream_id, kind="stream", language=language, reference=" ".join(references),
                            origin=note, license=FLEURS_LICENSE + " + CC0 noise floor", samples=samples, segments=segments))

    for code in ("es", "ca"):
        stream("stream-%s" % code, speech[code][:6], "concatenated FLEURS %s clips, 0.4-1.2 s gaps, -65 dBFS floor" % code, code)
    loud, quiet = speech["es"][6], speech["es"][7]
    stream("stream-level-es", [loud, (quiet[0], scaled(quiet[1], -30), quiet[2])],
           "LEVEL TEST ONLY: second clip attenuated 30 dB; not equivalent to a speaker at two metres", "es")
    stream("stream-mixed-es-ca", [speech["es"][6], speech["ca"][6], speech["es"][7], speech["ca"][7]],
           "alternating es/ca FLEURS clips", "es+ca")

    manifest = dict(sampleRate=RATE, format="pcm_s16le mono", generator="build_corpus.py", fixtures=[])
    for entry in entries:
        data = pcm_bytes(entry.pop("samples"))
        with open(os.path.join(out_dir, entry["id"] + ".pcm"), "wb") as handle:
            handle.write(data)
        entry.update(file=entry["id"] + ".pcm", sha256=hashlib.sha256(data).hexdigest(),
                     durationMs=len(data) // 2 * 1000 // RATE)
        manifest["fixtures"].append(entry)
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8", newline="\n") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=1)
    total = sum(f["durationMs"] for f in manifest["fixtures"]) / 1000
    print("%d fixtures, %.1f s of audio -> %s" % (len(manifest["fixtures"]), total, out_dir))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--per-language", type=int, default=8)
    args = parser.parse_args()
    build(args.out, args.per_language)
