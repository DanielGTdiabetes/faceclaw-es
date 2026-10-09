#!/usr/bin/env python3
"""Convert the benchmark corpus (PCM16 mono 16 kHz) into WAV files for whisper-cli, both whole and in
consecutive 6 s pieces (same split as the sherpa corpus mode), plus an index with references.
Usage: python -I prepare_corpus_wav.py --corpus ../corpus/out --out <dir> [--kinds speech,silence,noise]"""
import argparse
import hashlib
import json
import os
import struct


def wav(path, data):
    with open(path, "wb") as handle:
        handle.write(b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " +
                     struct.pack("<IHHIIHH", 16, 1, 1, 16000, 32000, 2, 16) + b"data" + struct.pack("<I", len(data)) + data)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--kinds", default="speech,silence,noise")
    parser.add_argument("--segment-ms", type=int, default=6000)
    args = parser.parse_args()
    manifest = json.load(open(os.path.join(args.corpus, "manifest.json"), encoding="utf-8"))
    os.makedirs(args.out, exist_ok=True)
    index = []
    for fixture in manifest["fixtures"]:
        if fixture["kind"] not in args.kinds.split(","):
            continue
        data = open(os.path.join(args.corpus, fixture["file"]), "rb").read()
        if hashlib.sha256(data).hexdigest() != fixture["sha256"]:
            raise SystemExit("corpus hash mismatch " + fixture["id"])
        wav(os.path.join(args.out, "whole-%s.wav" % fixture["id"]), data)
        size = args.segment_ms * 32
        pieces = [data[i:i + size] for i in range(0, len(data), size)]
        pieces = [p for i, p in enumerate(pieces) if len(p) >= 32000 or i == 0]
        for number, piece in enumerate(pieces):
            wav(os.path.join(args.out, "seg%d-%s-%02d.wav" % (args.segment_ms // 1000, fixture["id"], number)), piece)
        index.append(dict(id=fixture["id"], kind=fixture["kind"], language=fixture["language"], reference=fixture["reference"],
                          pieces=len(pieces), durationMs=fixture["durationMs"]))
    json.dump(dict(segmentMs=args.segment_ms, fixtures=index), open(os.path.join(args.out, "index.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(len(index), "fixtures ->", args.out)


if __name__ == "__main__":
    main()
