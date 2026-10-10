#!/usr/bin/env python3
"""Summarise the bridge's `conv timing` journal lines: calls, outcomes, tokens, latency and the
cost of each useful contribution ("mensaje"). Numbers only: the log never carries speech or replies.

Usage (on Jarvis or any PC with a copy of the journal):

    journalctl -u faceclaw-hermes.service -o short-iso --since "2026-10-11 10:00" --until "2026-10-11 10:15" \\
        | python3 conv_journal_summary.py --since 2026-10-11T10:00 --until 2026-10-11T10:15 --label "A conversación"

--since/--until filter by the journal timestamp and set the duration used for calls/hour; without
them the span between the first and last request is used (it underestimates quiet edges).
--price-input/--price-cached/--price-output (per million tokens) add an estimated cost.
Lines from bridges before the usage counters still count calls, outcomes and latency.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from datetime import datetime

MARKER = "conv timing "
TIMESTAMP = re.compile(r"^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)")
USAGE_KEYS = ("inputTokens", "cacheReadTokens", "outputTokens", "reasoningTokens")


def parse_time(text):
    """ISO-8601 from journalctl short-iso (+0200) or the command line (+02:00, Z, or naive)."""
    if not text:
        return None
    value = text.strip().replace(",", ".").replace(" ", "T", 1)
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    value = re.sub(r"([+-]\d{2})(\d{2})$", r"\1:\2", value)
    return datetime.fromisoformat(value)


def comparable(moment, reference):
    """Naive and aware times compare by wall clock: the user types local times."""
    if moment is None or reference is None:
        return moment
    if (moment.tzinfo is None) != (reference.tzinfo is None):
        return moment.replace(tzinfo=None)
    return moment


def read_records(lines):
    records = []
    for line in lines:
        index = line.find(MARKER)
        if index < 0:
            continue
        try:
            record = json.loads(line[index + len(MARKER):])
        except ValueError:
            continue
        if not isinstance(record, dict):
            continue
        match = TIMESTAMP.match(line)
        try:
            record["_at"] = parse_time(match.group(1)) if match else None
        except ValueError:
            record["_at"] = None
        records.append(record)
    return records


def percentile(values, fraction):
    """Nearest-rank percentile; None without data."""
    values = sorted(v for v in values if isinstance(v, (int, float)))
    if not values:
        return None
    return values[max(0, math.ceil(fraction * len(values)) - 1)]


def number(record, key):
    value = record.get(key)
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else 0


def outcome_class(outcome):
    outcome = str(outcome or "desconocido")
    if outcome.startswith("error:"):
        return "error"
    if outcome.startswith("late:"):
        return "tardío"
    return {"duplicate": "nada (repetida)"}.get(outcome, outcome)


def summarise(records, *, since=None, until=None, duration_min=None, prices=None, reasoning_separate=False):
    if since or until:
        reference = next((r["_at"] for r in records if r.get("_at")), None)
        since, until = comparable(since, reference), comparable(until, reference)
        records = [r for r in records if r.get("_at") is not None
                   and (since is None or comparable(r["_at"], since) >= since)
                   and (until is None or comparable(r["_at"], until) <= until)]
    times = [r["_at"] for r in records if r.get("_at") is not None]
    if duration_min is not None:
        minutes = float(duration_min)
    elif since and until:
        minutes = (until - since).total_seconds() / 60
    elif len(times) >= 2:
        minutes = (max(times) - min(times)).total_seconds() / 60
    else:
        minutes = None

    calls = len(records)
    outcomes = {}
    for record in records:
        key = outcome_class(record.get("outcome"))
        outcomes[key] = outcomes.get(key, 0) + 1
    messages = outcomes.get("mensaje", 0)

    measured = [r for r in records if "inputTokens" in r]
    usage = {key: sum(number(r, key) for r in measured) for key in USAGE_KEYS}
    # OpenAI counts cached tokens inside input_tokens. If a record shows more cached than input,
    # this Hermes reports them apart: then the base is input + cached.
    cache_apart = any(number(r, "cacheReadTokens") > number(r, "inputTokens") for r in measured)
    # Same for reasoning: OpenAI counts it inside output_tokens; more reasoning than output means apart.
    reasoning_separate = reasoning_separate or any(number(r, "reasoningTokens") > number(r, "outputTokens")
                                                   for r in measured)
    input_base = usage["inputTokens"] + (usage["cacheReadTokens"] if cache_apart else 0)
    output_base = usage["outputTokens"] + (usage["reasoningTokens"] if reasoning_separate else 0)
    total_tokens = input_base + output_base
    nothing = [r for r in measured if outcome_class(r.get("outcome")) in ("nada", "nada (repetida)")]
    nothing_tokens = sum(number(r, "inputTokens") + number(r, "outputTokens")
                         + (number(r, "cacheReadTokens") if cache_apart else 0)
                         + (number(r, "reasoningTokens") if reasoning_separate else 0) for r in nothing)

    attempts = [r.get(key) for r in records for key in ("primaryOutcome", "fallbackOutcome") if r.get(key)]
    legacy_invalid = sum(1 for r in records if "primaryOutcome" not in r and r.get("fallbackReason") == "invalid")
    fallback_reasons = {}
    for record in records:
        if record.get("fallbackReason"):
            fallback_reasons[record["fallbackReason"]] = fallback_reasons.get(record["fallbackReason"], 0) + 1
    efforts = {}
    for record in records:
        effort = record.get("effort") or "no registrado"
        efforts[effort] = efforts.get(effort, 0) + 1

    def per_message(value, digits=0):
        return (round(value / messages, digits) if digits else round(value / messages)) if messages else None

    cost = None
    if prices and measured:
        uncached = usage["inputTokens"] - (0 if cache_apart else usage["cacheReadTokens"])
        cost_total = (max(0, uncached) * prices["input"] + usage["cacheReadTokens"] * prices["cached"]
                      + output_base * prices["output"]) / 1_000_000
        cost = {"total": round(cost_total, 4),
                "perHour": round(cost_total * 60 / minutes, 4) if minutes else None,
                "perMessage": round(cost_total / messages, 4) if messages else None,
                "spentOnNada": round(cost_total * nothing_tokens / total_tokens, 4) if total_tokens else None}

    return {
        "calls": calls, "minutes": round(minutes, 1) if minutes is not None else None,
        "callsPerHour": round(calls * 60 / minutes, 1) if minutes else None,
        "modes": {mode: sum(1 for r in records if r.get("mode") == mode) for mode in ("assess", "assist")},
        "outcomes": dict(sorted(outcomes.items(), key=lambda item: -item[1])),
        "messages": messages,
        "apiCalls": sum(number(r, "apiCalls") for r in records),
        "efforts": efforts,
        "usage": {"requestsWithUsage": len(measured), **usage, "cacheReportedApart": cache_apart,
                  "cachedInputPercent": round(usage["cacheReadTokens"] * 100 / input_base, 1) if input_base else None,
                  "reasoningIncludedInOutput": not reasoning_separate,
                  "totalTokens": total_tokens,
                  "tokensOnNadaPercent": round(nothing_tokens * 100 / total_tokens, 1) if total_tokens else None},
        "promptChars": {"mean": round(sum(number(r, "promptChars") for r in measured) / len(measured))
                        if measured else None,
                        "p50": percentile([r.get("promptChars") for r in measured], .5),
                        "p95": percentile([r.get("promptChars") for r in measured], .95)},
        "perMessage": {"calls": per_message(calls, 1), "inputTokens": per_message(input_base),
                       "outputTokens": per_message(output_base), "totalTokens": per_message(total_tokens)},
        "failures": {"invalidAttempts": attempts.count("invalid") + legacy_invalid,
                     "timeoutAttempts": attempts.count("timeout"), "errorAttempts": attempts.count("error"),
                     "fallbacks": sum(fallback_reasons.values()), "fallbackReasons": fallback_reasons,
                     "fallbackOk": sum(1 for r in records if r.get("fallbackOutcome") == "ok")},
        "latencyMs": {"totalP50": percentile([r.get("totalMs") for r in records], .5),
                      "totalP95": percentile([r.get("totalMs") for r in records], .95),
                      "primaryP50": percentile([r.get("primaryMs") for r in records], .5),
                      "primaryP95": percentile([r.get("primaryMs") for r in records], .95)},
        "cost": cost,
    }


def fmt(value, suffix=""):
    if value is None:
        return "—"
    if isinstance(value, float):
        value = f"{value:,.1f}".replace(",", " ").replace(".", ",")
    elif isinstance(value, int):
        value = f"{value:,}".replace(",", " ")
    return f"{value}{suffix}"


def render(summary, label=""):
    s, u, f, l, m = summary, summary["usage"], summary["failures"], summary["latencyMs"], summary["perMessage"]
    lines = [f"Resumen conv{' · ' + label if label else ''}",
             f"  Duración             {fmt(s['minutes'], ' min')}",
             f"  Llamadas             {fmt(s['calls'])} (assess {s['modes']['assess']}, assist {s['modes']['assist']}),"
             f" {fmt(s['callsPerHour'], '/h')}, llamadas al proveedor {fmt(s['apiCalls'])}",
             "  Resultados           " + ", ".join(f"{k} {v}" for k, v in s["outcomes"].items()),
             "  Razonamiento         " + ", ".join(f"{k} {v}" for k, v in s["efforts"].items())]
    if u["requestsWithUsage"]:
        lines += [f"  Tokens entrada       {fmt(u['inputTokens'])} (cacheados {fmt(u['cacheReadTokens'])},"
                  f" {fmt(u['cachedInputPercent'], ' %')}{', informados aparte' if u['cacheReportedApart'] else ''})",
                  f"  Tokens salida        {fmt(u['outputTokens'])} (razonamiento {fmt(u['reasoningTokens'])},"
                  f" {'incluido en salida' if u['reasoningIncludedInOutput'] else 'informado aparte, sumado a salida'})",
                  f"  Tokens en «nada»     {fmt(u['tokensOnNadaPercent'], ' %')} del total",
                  f"  promptChars          media {fmt(s['promptChars']['mean'])}, p50 {fmt(s['promptChars']['p50'])},"
                  f" p95 {fmt(s['promptChars']['p95'])}"]
        if u["requestsWithUsage"] < s["calls"]:
            lines.append(f"  (tokens de {u['requestsWithUsage']} de {s['calls']} llamadas: el resto es de un puente sin contadores)")
    else:
        lines.append("  Tokens               no registrados (puente anterior al registro de uso)")
    lines += [f"  Por cada «mensaje»   {fmt(m['calls'])} llamadas, {fmt(m['totalTokens'])} tokens"
              f" (entrada {fmt(m['inputTokens'])}, salida {fmt(m['outputTokens'])})",
              f"  Fallos               inválidos {f['invalidAttempts']}, timeouts {f['timeoutAttempts']},"
              f" errores {f['errorAttempts']}",
              f"  Respaldo             {f['fallbacks']}"
              + (" (" + ", ".join(f"{k} {v}" for k, v in f["fallbackReasons"].items()) + f"; correctos {f['fallbackOk']})"
                 if f["fallbacks"] else ""),
              f"  Latencia total       p50 {fmt(l['totalP50'], ' ms')}, p95 {fmt(l['totalP95'], ' ms')}"
              f" (principal p50 {fmt(l['primaryP50'], ' ms')}, p95 {fmt(l['primaryP95'], ' ms')})"]
    if s["cost"]:
        c = s["cost"]
        money = lambda value: "—" if value is None else f"{value:.4f}".replace(".", ",")
        lines.append(f"  Coste estimado       {money(c['total'])} total, {money(c['perHour'])}/h,"
                     f" {money(c['perMessage'])} por «mensaje», {money(c['spentOnNada'])} en «nada»"
                     " (unidades del precio indicado)")
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("files", nargs="*", help="journal text files; standard input when omitted")
    parser.add_argument("--since")
    parser.add_argument("--until")
    parser.add_argument("--duration-min", type=float)
    parser.add_argument("--label", default="")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--reasoning-separate", action="store_true",
                        help="add reasoningTokens to output (only if Hermes reports them outside output)")
    for name in ("input", "cached", "output"):
        parser.add_argument(f"--price-{name}", type=float, help="price per million tokens")
    args = parser.parse_args(argv)
    lines = [] if args.files else sys.stdin.read().splitlines()
    for name in args.files:
        with open(name, encoding="utf-8", errors="replace") as source:
            lines.extend(source)
    prices = None
    if any(v is not None for v in (args.price_input, args.price_cached, args.price_output)):
        prices = {"input": args.price_input or 0, "cached": args.price_cached if args.price_cached is not None
                  else args.price_input or 0, "output": args.price_output or 0}
    summary = summarise(read_records(lines), since=parse_time(args.since), until=parse_time(args.until),
                        duration_min=args.duration_min, prices=prices, reasoning_separate=args.reasoning_separate)
    print(json.dumps(summary, ensure_ascii=False, indent=2) if args.json else render(summary, args.label))
    return summary


if __name__ == "__main__":
    main()
