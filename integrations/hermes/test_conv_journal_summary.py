"""Journal summary over synthetic log lines; also checks it reads what ConversationService really logs."""
import asyncio
import io
import json
import logging
import unittest
from contextlib import redirect_stdout

import conv_journal_summary as summary
from conversation import ConversationService
from test_conversation import Agent, Phone, request


def line(at, **timing):
    base = {"queueMs": 0, "primaryMs": 900, "fallbackMs": None, "attempts": 1, "apiCalls": 1, "fallbackReason": None}
    base.update(timing)
    return f"{at}+0200 jarvis python[123]: conv timing {json.dumps(base)}"


NEW = [
    line("2026-10-11T10:00:00", mode="assist", outcome="nada", totalMs=1000, inputTokens=3000, cacheReadTokens=1800,
         outputTokens=40, reasoningTokens=30, promptChars=2400, effort="low", primaryOutcome="ok"),
    line("2026-10-11T10:00:10", mode="assist", outcome="nada", totalMs=1200, inputTokens=3000, cacheReadTokens=1800,
         outputTokens=40, reasoningTokens=30, promptChars=2600, effort="low", primaryOutcome="ok"),
    line("2026-10-11T10:00:20", mode="assist", outcome="mensaje", totalMs=2000, inputTokens=3200, cacheReadTokens=1800,
         outputTokens=80, reasoningTokens=40, promptChars=3000, effort="low", primaryOutcome="ok"),
    line("2026-10-11T10:00:40", mode="assist", outcome="error:ValueError", totalMs=7000, inputTokens=6000,
         cacheReadTokens=0, outputTokens=400, reasoningTokens=200, promptChars=3000, effort="low",
         primaryOutcome="invalid", fallbackOutcome="invalid", fallbackReason="invalid", fallbackMs=900, attempts=2),
    "2026-10-11T10:00:41+0200 jarvis python[123]: conv assist -> nada in 1.0s (memory 0)",
]


class SummaryTests(unittest.TestCase):
    def test_cost_per_message_cache_share_failures_and_latency(self):
        result = summary.summarise(summary.read_records(NEW),
            since=summary.parse_time("2026-10-11T10:00"), until=summary.parse_time("2026-10-11T10:15"),
            prices={"input": 1.0, "cached": 0.1, "output": 8.0})
        self.assertEqual((result["calls"], result["minutes"], result["callsPerHour"]), (4, 15.0, 16.0))
        self.assertEqual(result["outcomes"], {"nada": 2, "mensaje": 1, "error": 1})
        self.assertEqual(result["usage"]["inputTokens"], 15200)
        self.assertEqual(result["usage"]["cacheReadTokens"], 5400)
        self.assertEqual(result["usage"]["cachedInputPercent"], 35.5)
        self.assertEqual(result["perMessage"], {"calls": 4.0, "inputTokens": 15200, "outputTokens": 560,
                                                "totalTokens": 15760})
        self.assertTrue(result["usage"]["reasoningIncludedInOutput"])
        self.assertEqual(result["failures"]["invalidAttempts"], 2)
        self.assertEqual(result["failures"]["fallbackReasons"], {"invalid": 1})
        self.assertEqual((result["latencyMs"]["totalP50"], result["latencyMs"]["totalP95"]), (1200, 7000))
        self.assertEqual(result["promptChars"]["p50"], 2600)
        self.assertEqual(result["efforts"], {"low": 4})
        # (15200-5400)*1 + 5400*0.1 + 560*8 per million.
        self.assertAlmostEqual(result["cost"]["total"], 0.0148, places=4)
        self.assertAlmostEqual(result["cost"]["perMessage"], 0.0148, places=4)
        self.assertIn("Por cada «mensaje»   4,0 llamadas", summary.render(result, "A"))

    def test_window_filters_lines_and_old_bridge_lines_still_count_calls(self):
        old = [line("2026-10-11T09:59:00", mode="assist", outcome="nada", totalMs=800),
               line("2026-10-11T10:05:00", mode="assess", outcome="tema", totalMs=900)]
        result = summary.summarise(summary.read_records(old + NEW[:1]), since=summary.parse_time("2026-10-11T10:00"),
                                   until=summary.parse_time("2026-10-11T10:10"))
        self.assertEqual(result["calls"], 2)
        self.assertEqual(result["modes"], {"assess": 1, "assist": 1})
        self.assertEqual(result["usage"]["requestsWithUsage"], 1)
        self.assertIn("de un puente sin contadores", summary.render(result))
        legacy = summary.summarise(summary.read_records(old))
        self.assertIn("no registrados", summary.render(legacy))
        self.assertIsNone(legacy["perMessage"]["calls"])

    def test_cache_reported_apart_from_input_is_detected(self):
        apart = [line("2026-10-11T10:00:00", mode="assist", outcome="mensaje", totalMs=900, inputTokens=1200,
                      cacheReadTokens=1800, outputTokens=50, reasoningTokens=0, promptChars=2000)]
        result = summary.summarise(summary.read_records(apart))
        self.assertTrue(result["usage"]["cacheReportedApart"])
        self.assertEqual(result["usage"]["cachedInputPercent"], 60.0)

    def test_reasoning_reported_apart_from_output_is_added_to_output(self):
        apart = [line("2026-10-11T10:00:00", mode="assist", outcome="mensaje", totalMs=900, inputTokens=3000,
                      cacheReadTokens=0, outputTokens=40, reasoningTokens=90, promptChars=2000)]
        result = summary.summarise(summary.read_records(apart))
        self.assertFalse(result["usage"]["reasoningIncludedInOutput"])
        self.assertEqual(result["perMessage"]["outputTokens"], 130)

    def test_command_line_reads_files(self):
        import tempfile, os
        with tempfile.NamedTemporaryFile("w", suffix=".log", delete=False, encoding="utf-8") as handle:
            handle.write("\n".join(NEW))
        try:
            with redirect_stdout(io.StringIO()) as out:
                summary.main([handle.name, "--label", "B TV"])
            self.assertIn("Resumen conv · B TV", out.getvalue())
            with redirect_stdout(io.StringIO()) as out:
                summary.main([handle.name, "--json"])
            self.assertEqual(json.loads(out.getvalue())["calls"], 4)
        finally:
            os.unlink(handle.name)


class RealLogFormatTests(unittest.IsolatedAsyncioTestCase):
    async def test_summary_reads_the_lines_the_service_writes(self):
        agent, phone = Agent(), Phone()
        agent.response = {"kind": "nada"}
        original = agent.run_conversation
        def billed(prompt, conversation_history):
            agent.session_input_tokens = getattr(agent, "session_input_tokens", 0) + 2500
            agent.session_cache_read_tokens = getattr(agent, "session_cache_read_tokens", 0) + 1800
            agent.session_output_tokens = getattr(agent, "session_output_tokens", 0) + 30
            return original(prompt, conversation_history)
        agent.run_conversation = billed
        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        log = logging.getLogger("faceclaw-hermes")
        log.addHandler(handler); previous = log.level; log.setLevel(logging.INFO)
        service = ConversationService(lambda: agent)
        await service.warmup()
        try:
            for _ in range(3):
                self.assertTrue(service.submit(phone, request(mode="assist")))
                await asyncio.wait_for(service.task, 3)
        finally:
            await service.close()
            log.removeHandler(handler); log.setLevel(previous)
        self.assertNotIn("sintético", stream.getvalue())
        result = summary.summarise(summary.read_records(stream.getvalue().splitlines()), duration_min=1)
        self.assertEqual(result["calls"], 3)
        self.assertEqual(result["outcomes"], {"nada": 3})
        self.assertEqual(result["usage"]["inputTokens"], 7500)
        self.assertEqual(result["usage"]["cachedInputPercent"], 72.0)
        self.assertEqual(result["efforts"], {"low": 3})
        self.assertIsNone(result["perMessage"]["calls"])


if __name__ == "__main__":
    unittest.main()
