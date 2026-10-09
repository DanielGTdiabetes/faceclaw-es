#!/usr/bin/env python3
"""Summarize pulled bench results (results/pixel/<runId>/run.json) into Markdown tables.
Usage: python -I summarize_pixel.py results/pixel > results/pixel/SUMMARY.md

The run.json files are evidence and are never rewritten. This presentation layer withholds values
that are not valid as stored:
- WER/CER of a sustained (looped) stream: the loop cuts fixtures at arbitrary points, so the joined
  reference is not comparable. Older runs stored a number (e.g. 1.309); it is shown as n/v.
- Percentiles and speech coverage of a run whose timing ring was not collected whole
  (timingsComplete false): they would describe only the tail of the run.
- Coverage from runs without coverageSemantics "decoded-ok-v2" counted windows handed to the
  decoder, including attempts that failed; it is labelled as such.
"""
import glob
import json
import os
import sys

NOT_VALID = "n/v"
NOTES = {
    "loop": "WER no válido: la secuencia en bucle corta frases en puntos arbitrarios y la referencia unida no es comparable. "
            "El JSON conserva el valor original, que no debe usarse como precisión.",
    "attempted": "Cobertura con la semántica anterior: ventanas entregadas al decoder, incluidos intentos fallidos. "
                 "No significa palabras reconocidas ni texto entregado.",
    "decoded": "Cobertura = tiempo de audio en ventanas que el decoder procesó sin error en la generación vigente. "
               "No significa palabras reconocidas ni texto entregado.",
    "incomplete": "Percentiles y voz cubierta retenidos: el registro de tiempos no cubre toda la ejecución",
}


def fmt(value, digits=0):
    if value is None:
        return "–"
    return ("%%.%df" % digits) % value if isinstance(value, float) else str(value)


def is_loop(case):
    return str(case.get("stream", "")).startswith("sustained")


def realtime_row(c, notes):
    """One Markdown row; records in `notes` which footnotes apply."""
    loop = is_loop(c)
    complete = c.get("timingsComplete", True) is not False
    new_semantics = c.get("coverageSemantics") == "decoded-ok-v2"
    notes.add("decoded" if new_semantics else "attempted")
    mark = "" if new_semantics else "²"
    if loop:
        notes.add("loop")
    if not complete:
        notes.add("incomplete:" + (c.get("timingsInvalidReason") or "timingsComplete=false"))
    withheld = NOT_VALID + "³"
    return "| %d | %s | %s | %s | %s | %.1f | %d | %d | %s | %s | %s | %s | %s | %s | %s | %s/%s | %d | %s | %d | %d | %d |" % (
        c["round"], c["model"], c["runtime"], c["policy"], c["stream"], c["audioMs"] / 1000, c["closures"], c["dropped"],
        fmt(c.get("dropPct"), 1), fmt(c.get("coveragePct"), 1) + mark,
        (fmt(c.get("speechCoveragePct"), 1) + mark) if complete else withheld,
        fmt(c.get("decodeErrors")),
        fmt(c.get("decodeP50Ms")) if complete else withheld, fmt(c.get("decodeP95Ms")) if complete else withheld,
        fmt(c.get("decodeMaxMs")), fmt(c.get("latencyAvgMs")), fmt(c.get("latencyMaxMs")), c["delivered"],
        NOT_VALID + "¹" if loop else fmt(c.get("wer"), 3), c["rejectedLanguage"], c["stopDrainMs"], c["lateChunks"])


def print_notes(notes):
    if "loop" in notes:
        print("¹ " + NOTES["loop"] + "\n")
    if "attempted" in notes:
        print("² " + NOTES["attempted"] + "\n")
    if "decoded" in notes:
        print("Cobertura sin marca: " + NOTES["decoded"] + "\n")
    for note in sorted(n for n in notes if n.startswith("incomplete:")):
        print("³ %s (%s).\n" % (NOTES["incomplete"], note.split(":", 1)[1]))


def main(root):
    for path in sorted(glob.glob(os.path.join(root, "*", "run.json"))):
        with open(path, encoding="utf-8") as handle:
            run = json.load(handle)
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
            notes = set()
            print("| Ronda | Modelo | Runtime | Política | Secuencia | Audio s | Ventanas | Descartes | % desc. | Cobertura % | Voz cubierta % | Errores decod. | p50 ms | p95 ms | máx ms | Lat. media/máx ms | Entregas | WER | Rechazo idioma | Drenaje OFF ms | Fragm. tarde |")
            print("|---:|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|")
            for c in run.get("cases", []):
                if "error" in c:
                    print("| %s | %s | %s | %s | %s | error: %s |" % (c["round"], c["model"], c["runtime"], c["policy"], c["stream"], c["error"]))
                    continue
                print(realtime_row(c, notes))
            print()
            print_notes(notes)
        print()


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main(sys.argv[1] if len(sys.argv) > 1 else "results/pixel")
