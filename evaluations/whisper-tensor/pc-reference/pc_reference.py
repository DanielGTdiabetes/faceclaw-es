#!/usr/bin/env python3
"""PC reference inference with the same sherpa-onnx release (1.13.0) and the same pinned int8 Whisper
files as Faceclaw. PURPOSE: recognition accuracy of knobs that do not depend on the CPU (tail padding,
level conditioning, language mode, model) and a sanity check of the corpus/metrics. Timings here are
x86 PC timings and MUST NOT be presented as Pixel performance.

The level conditioner and the structural/hallucination filter are ports of LocalAsrConditioner.kt and
localTextRejection() in LocalTranscriptSession.kt (kept in sync by tests/test_pc_reference.py).

Usage:
  python pc_reference.py --corpus ../corpus/out --models <dir with sherpa-onnx-whisper-*-es-int8>
      --model base,small --threads 4 --tail 0,300 --conditioning on,off --segment-ms 6000 --out <dir>
"""
import argparse
import csv
import hashlib
import json
import os
import platform
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bench_metrics import error_counts, percentile  # noqa: E402

MODELS = {
    "base": ("sherpa-onnx-whisper-base-es-int8", "base", {
        "base-encoder.int8.onnx": "0b8fb1304b6109976038efff5ace81720e00386f3ff6b54ee8c75291ca0a1e11",
        "base-decoder.int8.onnx": "9759d217388a01b3a4c7c15533201067b48ae819c4daafc8624e64b9409dc02d",
        "base-tokens.txt": "b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126"}),
    "small": ("sherpa-onnx-whisper-small-es-int8", "small", {
        "small-encoder.int8.onnx": "4cbe7b22fa9026b843b60a68640c747de05bafb1a11b57edc0e66c232d9f33a9",
        "small-decoder.int8.onnx": "acad50b5c782696e91b55914cc5ab4f756f1532f76e22aa6fc615f39fb69a8ee",
        "small-tokens.txt": "b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126"}),
    "medium": ("sherpa-onnx-whisper-medium-es-int8", "medium", {
        "medium-encoder.int8.onnx": "1c54582b4d829de0089f6cb63bbbdb3bf7555398bacaf855fbecf1a84dfd193e",
        "medium-decoder.int8.onnx": "595d00a338a365a7bfa0ca7f296cabc639583bef770ab6130df90f49a6412747",
        "medium-tokens.txt": "b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126"}),
}

# ---- Port of LocalAsrConditioner.condition (float32, same constants) ----
FRAME, TARGET_RMS, MAX_GAIN, PEAK_LIMIT, NOISE_MARGIN, EXPANDER, ATTACK, RELEASE = 320, 0.1, 31.62, 0.944, 2.5, 0.25, 0.5, 0.15


def _pct(sorted_values, fraction):
    if len(sorted_values) == 0:
        return 0.0
    index = int(round((len(sorted_values) - 1) * fraction))
    return float(sorted_values[min(max(index, 0), len(sorted_values) - 1)])


def condition(samples):
    x = samples.astype(np.float32).copy()
    frames = len(x) // FRAME
    if frames == 0:
        return x
    x -= np.float32(x.astype(np.float64).mean())
    rms = np.sqrt((x[:frames * FRAME].astype(np.float64).reshape(frames, FRAME) ** 2).mean(axis=1)).astype(np.float32)
    ordered = np.sort(rms)
    noise = max(_pct(ordered, 0.2), 1e-5)
    threshold = noise * NOISE_MARGIN
    threshold_gain = min(max(TARGET_RMS / threshold, 1.0), MAX_GAIN)
    previous = -1.0
    ramp = (np.arange(1, FRAME + 1, dtype=np.float32) / FRAME)
    for f in range(frames):
        desired = min(max(TARGET_RMS / rms[f], 1.0), MAX_GAIN) if rms[f] >= threshold else max(1.0, threshold_gain * EXPANDER)
        start = desired if previous < 0 else previous
        gain = desired if previous < 0 else previous + (desired - previous) * (ATTACK if desired < previous else RELEASE)
        x[f * FRAME:(f + 1) * FRAME] *= (start + (gain - start) * ramp).astype(np.float32)
        previous = gain
    x[frames * FRAME:] *= max(previous, 1.0)
    peak = float(np.abs(x).max())
    if peak > PEAK_LIMIT:
        x *= np.float32(PEAK_LIMIT / peak)
    return x


# ---- Port of localTextRejection / isKnownWhisperHallucination ----
def is_hallucination(text):
    import re
    t = re.sub(r"\s+", " ", re.sub(r"[^\w .]|_", " ", text.lower())).strip()
    if not t:
        return False
    if "amara.org" in t or "amara org" in t or "subtítulos realizados por" in t or "subtítulos por la comunidad" in t:
        return True
    if "suscríbete" in t or "suscribete" in t:
        return True
    return t.removesuffix(".").strip() in {"gracias por ver", "gracias por ver el video", "gracias por ver el vídeo",
                                          "música", "musica", "aplausos", "risas"}


def rejection(text, language, forced):
    text = text.strip()
    if forced:
        if (language.strip() or "es") != "es":
            return "LANGUAGE"
    elif language not in ("es", "ca"):
        return "LANGUAGE"
    if not text:
        return "EMPTY"
    if len(text) > 600 or not any(c.isalpha() for c in text):
        return "STRUCTURE"
    if "<|" in text or text.startswith("[") or text.startswith("("):
        return "STRUCTURE"
    if any(ord(c) < 32 and c not in "\n\t" for c in text):
        return "STRUCTURE"
    if is_hallucination(text):
        return "HALLUCINATION"
    return "NONE"


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def pieces(samples, segment_ms):
    if segment_ms <= 0:
        return [samples]
    size = segment_ms * 16
    out = [samples[i:i + size] for i in range(0, len(samples), size)]
    return [p for p in out if len(p) >= 16000] or [samples]


def main():
    import sherpa_onnx
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus", required=True)
    parser.add_argument("--models", required=True)
    parser.add_argument("--model", default="base,small")
    parser.add_argument("--threads", default="4")
    parser.add_argument("--tail", default="0")
    parser.add_argument("--conditioning", default="on")
    parser.add_argument("--language", default="auto", choices=["auto", "es"])
    parser.add_argument("--segment-ms", type=int, default=6000)
    parser.add_argument("--kinds", default="speech,silence,noise")
    parser.add_argument("--repeat", type=int, default=1)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    manifest = json.load(open(os.path.join(args.corpus, "manifest.json"), encoding="utf-8"))
    fixtures = [f for f in manifest["fixtures"] if f["kind"] in args.kinds.split(",")]
    for fixture in fixtures:
        if sha256(os.path.join(args.corpus, fixture["file"])) != fixture["sha256"]:
            sys.exit("corpus hash mismatch: " + fixture["id"])
    os.makedirs(args.out, exist_ok=True)
    run = dict(kind="pc-reference (x86 PC, NOT Pixel)", host=dict(platform=platform.platform(), processor=platform.processor(),
               cpus=os.cpu_count(), python=sys.version.split()[0]), sherpaOnnx=sherpa_onnx.__version__,
               corpusManifestSha256=sha256(os.path.join(args.corpus, "manifest.json")), segmentMs=args.segment_ms,
               language=args.language, cases=[])
    rows = []
    for model_key in args.model.split(","):
        directory, prefix, files = MODELS[model_key]
        base = os.path.join(args.models, directory)
        t0 = time.perf_counter()
        for name, expected in files.items():
            if sha256(os.path.join(base, name)) != expected:
                sys.exit("model hash mismatch: " + name)
        verify_ms = (time.perf_counter() - t0) * 1000
        for threads in [int(v) for v in args.threads.split(",")]:
            for tail in [int(v) for v in args.tail.split(",")]:
                t0 = time.perf_counter()
                options = dict(encoder=os.path.join(base, prefix + "-encoder.int8.onnx"),
                               decoder=os.path.join(base, prefix + "-decoder.int8.onnx"),
                               tokens=os.path.join(base, prefix + "-tokens.txt"),
                               language="es" if args.language == "es" else "", task="transcribe", num_threads=threads)
                if tail > 0:
                    options["tail_paddings"] = tail
                recognizer = sherpa_onnx.OfflineRecognizer.from_whisper(**options)
                load_ms = (time.perf_counter() - t0) * 1000
                for conditioning in args.conditioning.split(","):
                    case = dict(model="whisper-" + model_key, threads=threads, tailPaddingFrames=tail,
                                conditioning=conditioning, verifyMs=round(verify_ms), loadMs=round(load_ms), fixtures=[])
                    decode_ms, audio_ms = [], 0

                    def decode(samples):
                        stream = recognizer.create_stream()
                        stream.accept_waveform(16000, samples)
                        recognizer.decode_stream(stream)
                        return stream.result.text, stream.result.lang

                    warm = np.zeros(16000 * 6, dtype=np.float32)
                    decode(warm)  # warm-up, excluded
                    for fixture in fixtures:
                        raw = np.fromfile(os.path.join(args.corpus, fixture["file"]), dtype="<i2").astype(np.float32) / 32768
                        texts, raw_texts, rejections, languages = [], [], [], []
                        for piece in pieces(raw, args.segment_ms):
                            audio = condition(piece) if conditioning == "on" else piece.astype(np.float32)
                            for repetition in range(args.repeat):
                                t0 = time.perf_counter()
                                text, lang = decode(audio)
                                decode_ms.append((time.perf_counter() - t0) * 1000)
                            audio_ms += len(piece) / 16 * args.repeat
                            reason = rejection(text, lang, args.language == "es")
                            raw_texts.append(text.strip()); languages.append(lang); rejections.append(reason)
                            if reason == "NONE":
                                texts.append(text.strip())
                        delivered = " ".join(texts)
                        counts = error_counts(fixture["reference"], delivered)
                        raw_counts = error_counts(fixture["reference"], " ".join(raw_texts))
                        item = dict(id=fixture["id"], kind=fixture["kind"], language=fixture["language"],
                                    durationMs=fixture["durationMs"], languages=languages, rejections=rejections,
                                    delivered=counts, unfiltered=raw_counts, hypothesis=delivered)
                        case["fixtures"].append(item)
                        rows.append([case["model"], threads, tail, conditioning, fixture["id"], fixture["kind"], fixture["language"],
                                     counts["refWords"], counts["wordErrors"], counts["insertions"], counts["deletions"],
                                     counts["refChars"], counts["charErrors"], raw_counts["hypWords"], counts["hypWords"],
                                     "|".join(rejections), "|".join(languages)])
                    speech = [f for f in case["fixtures"] if f["kind"] == "speech"]
                    case["summary"] = dict(
                        decodes=len(decode_ms), decodeP50Ms=round(percentile(decode_ms, 0.5)),
                        decodeP95Ms=round(percentile(decode_ms, 0.95)), rtf=round(sum(decode_ms) / audio_ms, 3),
                        **{"wer_" + lang: round(sum(f["delivered"]["wordErrors"] for f in speech if f["language"] == lang) /
                                                max(1, sum(f["delivered"]["refWords"] for f in speech if f["language"] == lang)), 4)
                           for lang in ("es", "ca")},
                        **{"cer_" + lang: round(sum(f["delivered"]["charErrors"] for f in speech if f["language"] == lang) /
                                                max(1, sum(f["delivered"]["refChars"] for f in speech if f["language"] == lang)), 4)
                           for lang in ("es", "ca")},
                        nonSpeechWordsUnfiltered=sum(f["unfiltered"]["hypWords"] for f in case["fixtures"] if f["kind"] != "speech"),
                        nonSpeechWordsDelivered=sum(f["delivered"]["hypWords"] for f in case["fixtures"] if f["kind"] != "speech"),
                        rejections={r: sum(f["rejections"].count(r) for f in case["fixtures"]) for r in
                                    ("NONE", "LANGUAGE", "EMPTY", "STRUCTURE", "HALLUCINATION")})
                    run["cases"].append(case)
                    print(json.dumps(dict(model=case["model"], threads=threads, tail=tail, conditioning=conditioning, **case["summary"]),
                                     ensure_ascii=False), flush=True)
                del recognizer
    stamp = time.strftime("%Y%m%d-%H%M%S")
    with open(os.path.join(args.out, "pc-reference-%s.json" % stamp), "w", encoding="utf-8", newline="\n") as handle:
        json.dump(run, handle, ensure_ascii=False, indent=1)
    with open(os.path.join(args.out, "pc-reference-%s.csv" % stamp), "w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["model", "threads", "tailPaddingFrames", "conditioning", "fixture", "kind", "language", "refWords",
                         "wordErrors", "insertions", "deletions", "refChars", "charErrors", "hypWordsUnfiltered",
                         "hypWordsDelivered", "rejections", "languages"])
        writer.writerows(rows)


if __name__ == "__main__":
    main()
