#!/usr/bin/env python3
"""Summarize pulled bench results (results/pixel/<runId>/run.json) into Markdown tables.
Usage: python -I summarize_pixel.py results/pixel > results/pixel/SUMMARY.md"""
import glob
import json
import os
import sys


def fmt(value, digits=0):
    if value is None:
        return "–"
    return ("%%.%df" % digits) % value if isinstance(value, float) else str(value)


def main(root):
    for path in sorted(glob.glob(os.path.join(root, "*", "run.json"))):
        run = json.load(open(path, encoding="utf-8"))
        mode = run["options"]["mode"]
        device = run["device"]
        print("## %s (%s)\n" % (os.path.basename(os.path.dirname(path)), mode))
        print("%s %s, Android %s (SDK %s), bench %s, sherpa-onnx %s. %s\n" % (
            device["model"], device["socModel"], device["android"], device["sdk"], device["benchCommit"],
            device["sherpaOnnx"], "Error: " + run["error"] if "error" in run else ""))
        if mode == "corpus":
            print("| Modelo | Runtime | Acond. | Verif. ms | Carga ms | Calent. ms | Decodes | p50 ms | p95 ms | máx ms | RTF | WER es | WER ca | CER es | CER ca | Palabras no-voz | Rechazos | Térmico antes→después |")
            print("|---|---|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|")
            for case in run.get("cases", []):
                for key in sorted(k for k in case if k.startswith("conditioning_")):
                    c = case[key]
                    print("| %s | %s | %s | %s | %s | %s | %d | %s | %s | %s | %s | %s | %s | %s | %s | %d | %s | %s→%s |" % (
                        case["model"], case["runtime"] + (" (%s)" % case["effectiveProvider"] if case.get("effectiveProvider", "cpu") != "cpu" else ""),
                        key.split("_")[1], case["verifyMs"], case["loadMs"], "/".join(str(x) for x in case["warmupMs"]),
                        c["decodes"], c["decodeP50Ms"], c["decodeP95Ms"], c["decodeMaxMs"], fmt(c["rtf"], 3),
                        fmt(c["wer"].get("es"), 3), fmt(c["wer"].get("ca"), 3), fmt(c["cer"].get("es"), 3), fmt(c["cer"].get("ca"), 3),
                        c["nonSpeechWordsDelivered"], ",".join("%s:%d" % kv for kv in c["rejections"].items()),
                        case["thermalBefore"]["thermalStatus"], case["thermalAfter"]["thermalStatus"]))
        else:
            print("| Ronda | Modelo | Runtime | Política | Secuencia | Audio s | Ventanas | Descartes | % desc. | Cobertura % | Voz cubierta % | p50 ms | p95 ms | máx ms | Lat. media/máx ms | Entregas | WER | Rechazo idioma | Drenaje OFF ms | Fragm. tarde |")
            print("|---:|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|")
            for c in run.get("cases", []):
                if "error" in c:
                    print("| %s | %s | %s | %s | %s | error: %s |" % (c["round"], c["model"], c["runtime"], c["policy"], c["stream"], c["error"]))
                    continue
                print("| %d | %s | %s | %s | %s | %.1f | %d | %d | %s | %s | %s | %s | %s | %s | %s/%s | %d | %s | %d | %d | %d |" % (
                    c["round"], c["model"], c["runtime"], c["policy"], c["stream"], c["audioMs"] / 1000, c["closures"], c["dropped"],
                    fmt(c["dropPct"], 1), fmt(c["coveragePct"], 1), fmt(c["speechCoveragePct"], 1), c["decodeP50Ms"], c["decodeP95Ms"],
                    c["decodeMaxMs"], c["latencyAvgMs"], c["latencyMaxMs"], c["delivered"], fmt(c["wer"], 3), c["rejectedLanguage"],
                    c["stopDrainMs"], c["lateChunks"]))
        print()


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "results/pixel")
