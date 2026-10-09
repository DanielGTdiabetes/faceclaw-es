#!/usr/bin/env python3
"""Analyze a run_whispercpp.sh output directory: effective backend (from whisper.cpp's own log), timings,
language, WER/CER against the corpus references (same metrics as the sherpa bench).

A run requested as "vulkan" is valid only if every log proves a Vulkan device was used; a CPU fallback is
reported as such and the run is marked invalid, never labelled GPU.
Usage: python -I analyze.py --run <dir> --index <wav dir>/index.json --label <name> --out <json>"""
import argparse
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "pc-reference"))
from bench_metrics import error_counts, percentile  # noqa: E402

TIMING = re.compile(r"whisper_print_timings:\s+(\w[\w ]*?) time =\s+([\d.]+) ms")
LANG = re.compile(r"auto-detected language: (\w+)")
BACKEND_GPU = re.compile(r"(using (Vulkan\d*) backend|ggml_vulkan: \d+ = ([^|\n]+))")


def backend_of(log, requested):
    vulkan_used = re.search(r"using Vulkan\d* backend", log) is not None
    device = re.search(r"ggml_vulkan: \d+ = ([^\n]+)", log)
    if requested == "cpu":
        return ("cpu", None) if not vulkan_used else ("UNEXPECTED vulkan", device.group(1).strip() if device else None)
    if vulkan_used:
        return "vulkan", device.group(1).strip() if device else "unknown device"
    if "no GPU found" in log or "ggml_vulkan: No devices found" in log or device is None:
        return "cpu (FALLBACK: no Vulkan device)", None
    return "cpu (FALLBACK: Vulkan not selected)", device.group(1).strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", required=True)
    parser.add_argument("--index", required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    meta = dict(line.strip().split("=", 1) for line in open(os.path.join(args.run, "run.txt")) if "=" in line)
    index = json.load(open(args.index, encoding="utf-8"))
    prefix = meta.get("prefix", "seg6")
    totals, encode, total_ms, decode_ms, backends, devices, failures = {}, [], [], [], set(), set(), 0
    fixtures = []
    for fixture in index["fixtures"]:
        texts, languages = [], []
        names = sorted(glob.glob(os.path.join(args.run, "%s-%s*.1.txt" % (prefix, fixture["id"]))))
        for text_file in names:
            stem = text_file[:-len(".1.txt")]
            for log_file in sorted(glob.glob(stem + ".*.log")):
                log = open(log_file, encoding="utf-8", errors="replace").read()
                backend, device = backend_of(log, meta["backend"])
                backends.add(backend); devices.add(device)
                timings = {k.strip(): float(v) for k, v in TIMING.findall(log)}
                if "total" in timings:
                    total_ms.append(timings["total"] - timings.get("load", 0.0))
                    encode.append(timings.get("encode", 0.0))
                    decode_ms.append(timings.get("decode", 0.0) + timings.get("batchd", 0.0) + timings.get("prompt", 0.0))
                else:
                    failures += 1
            log = open(stem + ".1.log", encoding="utf-8", errors="replace").read()
            detected = LANG.search(log)
            languages.append(detected.group(1) if detected else meta.get("language"))
            texts.append(" ".join(open(text_file, encoding="utf-8", errors="replace").read().split()))
        # Same language filter as Faceclaw (es/ca only); structural/hallucination rules are not re-applied here.
        delivered = " ".join(t for t, l in zip(texts, languages) if l in ("es", "ca"))
        counts = error_counts(fixture["reference"], delivered)
        fixtures.append(dict(id=fixture["id"], kind=fixture["kind"], languages=languages, **counts))
        if fixture["kind"] == "speech":
            t = totals.setdefault(fixture["language"], [0, 0, 0, 0])
            t[0] += counts["refWords"]; t[1] += counts["wordErrors"]; t[2] += counts["refChars"]; t[3] += counts["charErrors"]
    valid = all(not b.startswith(("cpu (FALLBACK", "UNEXPECTED")) for b in backends)
    summary = dict(label=args.label, requestedBackend=meta["backend"], effectiveBackends=sorted(backends),
                   devices=sorted(d for d in devices if d), valid=valid, threads=int(meta["threads"]), language=meta["language"],
                   model=os.path.basename(meta["model"]), runs=len(total_ms), failedRuns=failures,
                   processingP50Ms=percentile(total_ms, 0.5), processingP95Ms=percentile(total_ms, 0.95),
                   encodeP50Ms=percentile(encode, 0.5), encodeP95Ms=percentile(encode, 0.95),
                   decodeP50Ms=percentile(decode_ms, 0.5),
                   wer={k: round(v[1] / max(1, v[0]), 4) for k, v in totals.items()},
                   cer={k: round(v[3] / max(1, v[2]), 4) for k, v in totals.items()},
                   nonSpeechWords=sum(f["hypWords"] for f in fixtures if f["kind"] != "speech"),
                   note="processing = whisper.cpp total minus model load; excludes process start")
    json.dump(dict(summary=summary, fixtures=fixtures), open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
