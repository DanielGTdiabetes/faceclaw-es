"""Synthetic replay of the server Gatekeeper against a llama-server, before touching the bridge.

Writes one prediction per candidate in the format scripts/gatekeeper-replay.cjs evaluates:
    python gatekeeper_replay.py --url http://HOST:8080 --out preds.jsonl \
        ../../tests/fixtures/gatekeeper/pilot.jsonl ../../tests/fixtures/gatekeeper/speakers.jsonl
    node ../../scripts/gatekeeper-replay.cjs --dataset merged.jsonl --predictions preds.jsonl
Cases are converted exactly as gatekeeper-benchmark.ts does on the phone. Synthetic data only.
"""
from __future__ import annotations

import argparse
import json
import sys

from gatekeeper import LlamaClassifier


def case_input(row):
    """recent + fragment -> (mode, turns, sentThroughSeq), as the phone benchmark builds them."""
    raw = [(t["text"], t.get("speaker"), t.get("relation", "desconocido")) for t in row["recent"]]
    raw.append((row["fragment"], row.get("fragmentSpeaker"), row.get("fragmentRelation", "desconocido")))
    turns = [{"seq": i + 1, "speaker": speaker, "relation": relation, "text": text}
             for i, (text, speaker, relation) in enumerate(raw)]
    return row["mode"], turns, len(turns) - 1 if row["mode"] == "assist" else 0


def run(rows, classifier, warmup=1):
    for row in rows[:warmup]:  # Load weights/kernels; latency below is the warm path the bridge sees.
        mode, turns, sent = case_input(row)
        classifier.classify(mode, turns, sent_through_seq=sent)
    for row in rows:
        mode, turns, sent = case_input(row)
        decision, elapsed = classifier.classify(mode, turns, sent_through_seq=sent)
        prediction = {"id": row["id"], "action": decision["action"] if decision else "assist", "latencyMs": elapsed}
        if decision is None:
            prediction["bypass"] = True
        else:
            prediction["reason"] = decision["reason"]
        yield prediction


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("datasets", nargs="+")
    parser.add_argument("--url", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--merged", help="also write the concatenated dataset for the evaluator")
    parser.add_argument("--template", default="qwen3", choices=("qwen3", "chatml", "lfm2"))
    parser.add_argument("--timeout", type=float, default=30.0, help="measurement budget, not the live deadline")
    args = parser.parse_args(argv)
    rows = []
    for path in args.datasets:
        with open(path, encoding="utf-8-sig") as handle:
            rows += [json.loads(line) for line in handle if line.strip()]
    if args.merged:
        with open(args.merged, "w", encoding="utf-8", newline="\n") as handle:
            handle.writelines(json.dumps(row, ensure_ascii=False) + "\n" for row in rows)
    classifier = LlamaClassifier(args.url, template=args.template, timeout=args.timeout)
    with open(args.out, "w", encoding="utf-8", newline="\n") as handle:
        for prediction in run(rows, classifier):
            # The evaluator rejects unknown fields only for its own keys; reason is informative.
            handle.write(json.dumps(prediction) + "\n")
            print(prediction["id"], prediction["action"], prediction["latencyMs"], file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
