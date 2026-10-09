"""Metrics shared with the Android bench (BenchMetrics.kt). Both implementations are checked
against metric_vectors.json so a number means the same thing on the PC and on the Pixel."""
import json
import math
import os
import unicodedata

VECTORS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "metric_vectors.json")


def normalize(text):
    """NFC, lowercase, every non letter/digit becomes a space (apostrophes included), single spaces."""
    text = unicodedata.normalize("NFC", text).lower()
    return " ".join("".join(c if c.isalnum() else " " for c in text).split())


def edit_distance(ref, hyp):
    """Levenshtein distance plus (substitutions, deletions, insertions) of one optimal alignment."""
    rows, cols = len(ref) + 1, len(hyp) + 1
    cost = [[0] * cols for _ in range(rows)]
    for i in range(rows):
        cost[i][0] = i
    for j in range(cols):
        cost[0][j] = j
    for i in range(1, rows):
        for j in range(1, cols):
            same = ref[i - 1] == hyp[j - 1]
            cost[i][j] = min(cost[i - 1][j - 1] + (0 if same else 1), cost[i - 1][j] + 1, cost[i][j - 1] + 1)
    i, j, subs, dels, ins = len(ref), len(hyp), 0, 0, 0
    while i > 0 or j > 0:  # backtrack, preferring match/substitution, then deletion, then insertion
        if i > 0 and j > 0 and cost[i][j] == cost[i - 1][j - 1] + (0 if ref[i - 1] == hyp[j - 1] else 1):
            subs += 0 if ref[i - 1] == hyp[j - 1] else 1
            i, j = i - 1, j - 1
        elif i > 0 and cost[i][j] == cost[i - 1][j] + 1:
            dels, i = dels + 1, i - 1
        else:
            ins, j = ins + 1, j - 1
    return cost[-1][-1], subs, dels, ins


def error_counts(reference, hypothesis):
    """Word and character errors after normalize(). Reference length 0 => insertions only."""
    ref, hyp = normalize(reference), normalize(hypothesis)
    words, ws, wd, wi = edit_distance(ref.split(), hyp.split())
    chars, _, _, _ = edit_distance(list(ref), list(hyp))
    return dict(refWords=len(ref.split()), wordErrors=words, substitutions=ws, deletions=wd, insertions=wi,
                refChars=len(ref), charErrors=chars, hypWords=len(hyp.split()))


def percentile(values, fraction):
    """Nearest-rank percentile (p50 = median of odd counts; p95 of <20 values is the maximum)."""
    if not values:
        return None
    ordered = sorted(values)
    rank = max(1, math.ceil(fraction * len(ordered)))
    return ordered[rank - 1]


def self_check():
    with open(VECTORS, encoding="utf-8") as handle:
        vectors = json.load(handle)
    for case in vectors["normalize"]:
        assert normalize(case["in"]) == case["out"], case
    for case in vectors["errors"]:
        got = error_counts(case["ref"], case["hyp"])
        for key, value in case["expect"].items():
            assert got[key] == value, (case, key, got[key])
    for case in vectors["percentile"]:
        assert percentile(case["values"], case["fraction"]) == case["expect"], case
    return len(vectors["normalize"]) + len(vectors["errors"]) + len(vectors["percentile"])


if __name__ == "__main__":
    print("metric vectors ok:", self_check())
