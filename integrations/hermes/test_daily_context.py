"""Daily continuity: synthetic summaries, fake clocks/providers; no device or real data."""
import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from daily_context import DailyContext, CAPABILITY, MAX_TOPICS, TTL_SECONDS, valid_update
from conversation import ConversationService, valid_request
from test_conversation import Agent, Phone, request


def update(summary="La máquina X está descartada. Falta comparar Y.", topic="Máquina", topic_id=None):
    return {"topicId": topic_id, "topic": topic, "summary": summary, "evidenceSeqs": [1]}


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent)
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "daily.sqlite"
        self.clock = 100000.0
        self.store = DailyContext(self.path, now=lambda: self.clock)

    def tearDown(self):
        self.store.close()
        self.directory.cleanup()

    def put(self, value=None, generation=None, allowed=()):
        if generation is None:
            generation = self.store.snapshot("")[0]
        return self.store.remember(value or update(), generation=generation, evidence_seqs={1, 2},
                                   allowed_ids=allowed)

    def test_retrieves_accented_topic_and_caps_context(self):
        for n in range(6):
            self.put(update(topic="Máquina " + str(n), summary="Comparar máquina " + str(n)))
            self.clock += 1
        rows = self.store.snapshot('MAQUINA OR " ; DROP TABLE topics --')[1]
        self.assertEqual(len(rows), 3)
        self.assertTrue(all(row["topic"].startswith("Máquina") for row in rows))
        self.assertEqual(self.store.db.execute("SELECT count(*) FROM topics").fetchone()[0], 6)
        self.assertEqual(self.store.snapshot("receta tortilla")[1], [])

    def test_reads_and_repeated_summary_do_not_extend_ttl(self):
        self.put()
        original = self.store.snapshot("máquina")[1][0]
        self.clock += 1000
        self.assertFalse(self.put(update()))
        row = self.store.snapshot("máquina")[1][0]
        self.assertEqual(row["updatedAt"], original["updatedAt"])
        self.assertEqual(row["expiresAt"], original["expiresAt"])
        self.clock = original["expiresAt"]
        self.assertEqual(self.store.snapshot("máquina")[1], [])
        self.assertEqual(self.store.db.execute("SELECT count(*) FROM topics").fetchone()[0], 0)

    def test_restart_keeps_only_unexpired_topics_and_not_transcripts(self):
        self.put()
        self.store.close()
        self.clock += TTL_SECONDS - 1
        self.store = DailyContext(self.path, now=lambda: self.clock)
        self.assertEqual(len(self.store.snapshot("maquina")[1]), 1)
        self.store.close()
        self.clock += 1
        self.store = DailyContext(self.path, now=lambda: self.clock)
        self.assertEqual(self.store.snapshot("maquina")[1], [])
        columns = {row[1] for row in self.store.db.execute("PRAGMA table_info(topics)")}
        self.assertEqual(columns, {"id", "topic", "topic_key", "summary", "updated", "expires"})

    def test_correction_replaces_prior_claim_and_only_real_update_renews(self):
        self.put(update("Se propone comprar X."))
        generation, rows = self.store.snapshot("máquina")
        self.clock += 3600
        self.assertTrue(self.put(update("X descartada; sigue pendiente comparar Y.", topic_id=rows[0]["topicId"]),
                                 generation, [rows[0]["topicId"]]))
        current = self.store.snapshot("máquina")[1]
        self.assertEqual(len(current), 1)
        self.assertNotIn("comprar", current[0]["summary"])
        self.assertEqual(current[0]["expiresAt"], self.clock + TTL_SECONDS)
        self.assertFalse(self.put(update(topic_id="f" * 32), generation, ["f" * 32]))

    def test_forget_fences_late_writes_and_removes_content_from_file(self):
        marker = "SYNTHETIC_PRIVATE_MARKER_79531"
        self.put(update(marker))
        generation, rows = self.store.snapshot("máquina")
        self.store.forget()
        self.assertFalse(self.put(update(), generation))
        self.assertFalse(self.put(update(topic_id=rows[0]["topicId"]), generation, [rows[0]["topicId"]]))
        self.assertEqual(self.store.snapshot("máquina")[1], [])
        self.assertNotIn(marker.encode(), self.path.read_bytes())
        self.assertEqual(self.store.db.execute("SELECT count(*) FROM topic_search").fetchone()[0], 0)

    def test_bound_evicts_oldest_and_anaphor_fallback_is_short_lived(self):
        for n in range(MAX_TOPICS + 4):
            self.put(update(topic="Tema " + str(n), summary="Decisión sintética " + str(n)))
            self.clock += 1
        self.assertEqual(self.store.db.execute("SELECT count(*) FROM topics").fetchone()[0], MAX_TOPICS)
        self.assertEqual(self.store.db.execute("SELECT count(*) FROM topics WHERE topic='Tema 0'").fetchone()[0], 0)
        self.assertEqual(len(self.store.snapshot("¿Y eso?")[1]), 1)
        self.clock += 7201
        self.assertEqual(self.store.snapshot("¿Y eso?")[1], [])

    def test_schema_bounds_attribution_and_invalid_reference_are_rejected(self):
        self.assertTrue(valid_update(update(), {1}))
        for field, value in (("topicId", "../private"), ("topic", ""), ("summary", "x" * 601),
                             ("evidenceSeqs", [True]), ("evidenceSeqs", [99]),
                             ("evidenceSeqs", [1, 1]), ("summary", "bad\0value")):
            candidate = update(); candidate[field] = value
            self.assertFalse(self.put(candidate), field)
        self.assertFalse(self.put({**update(), "turns": [{"text": "do not persist"}]}))
        self.assertEqual(self.store.snapshot("máquina")[1], [])


class ServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.clock = 100000.0
        self.memory = DailyContext(":memory:", now=lambda: self.clock)
        self.agent, self.phone = Agent(), Phone()
        self.service = ConversationService(lambda: self.agent, daily_context_factory=lambda: self.memory,
                                           purge_interval=.02)
        await self.service.warmup()
        self.number = 0

    async def asyncTearDown(self):
        self.agent.gate.set()
        await self.service.close()
        self.assertIsNone(self.service.daily_purge_task)
        self.assertTrue(self.memory.closed)

    def frame(self, consent=True, mode="assist"):
        self.number += 1
        frame = request(str(self.number), mode)
        frame["turns"][0]["text"] = "La máquina X está descartada. Falta comparar Y."
        if consent:
            frame["dailyContext"] = True
        return frame

    async def complete(self, response, *, consent=True, mode="assist"):
        self.agent.response = response
        self.assertTrue(self.service.submit(self.phone, self.frame(consent, mode)))
        await asyncio.wait_for(self.service.task, 3)
        return self.phone.frames[-1]

    async def test_capability_is_conditional_and_each_request_needs_opt_in(self):
        self.assertIn(CAPABILITY, self.service.capabilities())
        frame = await self.complete({"kind": "nada", "memoryUpdate": update()}, consent=False)
        self.assertEqual(frame["kind"], "nada")
        self.assertIs(frame["memoryUpdated"], False)
        self.assertNotIn("dailyContextPolicy", self.agent.calls[-1][0])
        self.assertNotIn("dailyContext", self.agent.calls[-1][0])
        self.assertEqual(self.memory.snapshot("máquina")[1], [])
        for value in (1, "true", None, [], {}):
            self.assertFalse(valid_request({**self.frame(False), "dailyContext": value}))

    async def test_summary_and_recall_share_existing_calls_and_keep_wire_json(self):
        first = await self.complete({"kind": "nada", "memoryUpdate": update()})
        self.assertEqual(first["kind"], "nada")
        self.assertIs(first["memoryUpdated"], True)
        self.assertNotIn("_memoryUpdate", first)
        self.assertNotIn("memoryUpdate", first)
        self.assertEqual(len(self.agent.calls), 1)
        second = await self.complete({"kind": "mensaje", "text": "Comparad Y; X ya se descartó."})
        payload, history = self.agent.calls[-1]
        self.assertEqual(history, [])
        self.assertEqual(payload["dailyContextPolicy"], "summary-24h")
        self.assertEqual(len(payload["dailyContext"]), 1)
        self.assertEqual(payload["dailyContext"][0]["summary"], update()["summary"])
        self.assertEqual(second["kind"], "mensaje")
        self.assertIs(second["memoryUpdated"], False)
        self.assertEqual(len(self.agent.calls), 2)

    async def test_courtesy_uncertainty_and_invalid_memory_never_store_or_retry(self):
        for verdict in ("cortesia", "incierto"):
            await self.complete({"verdict": verdict, "memoryUpdate": update()}, mode="assess")
        malformed = update(); malformed["evidenceSeqs"] = [999]
        frame = await self.complete({"kind": "mensaje", "text": "Idea válida.", "memoryUpdate": malformed})
        self.assertEqual(frame["kind"], "mensaje")
        self.assertIs(frame["memoryUpdated"], False)
        self.assertEqual(self.memory.snapshot("máquina")[1], [])
        self.assertEqual(len(self.agent.calls), 3)

    async def test_cancelled_evaluation_cannot_store_a_late_summary(self):
        self.agent.gate.clear()
        self.agent.response = {"kind": "nada", "memoryUpdate": update()}
        self.service.submit(self.phone, self.frame())
        await asyncio.wait_for(asyncio.to_thread(self.agent.started.wait, 1), 2)
        self.service.cancel(self.phone)
        self.agent.gate.set()
        await asyncio.wait_for(self.service.task, 3)
        self.assertEqual(self.memory.snapshot("máquina")[1], [])
        self.assertEqual(self.phone.frames, [])

    async def test_read_and_write_failures_do_not_disable_valid_cue(self):
        with patch.object(self.memory, "snapshot", side_effect=RuntimeError("private text must not be logged")):
            with self.assertLogs("faceclaw-hermes", level="WARNING") as logs:
                result = await self.complete({"kind": "mensaje", "text": "Idea."})
            self.assertEqual(result["kind"], "mensaje")
            self.assertNotIn("private text", " ".join(logs.output))
        with patch.object(self.memory, "remember", side_effect=RuntimeError("private")):
            with self.assertLogs("faceclaw-hermes", level="WARNING"):
                result = await self.complete({"kind": "nada", "memoryUpdate": update()})
            self.assertEqual(result["kind"], "nada")

    async def test_periodic_purge_runs_without_another_conversation_and_close_joins_it(self):
        await self.complete({"kind": "nada", "memoryUpdate": update()})
        self.clock += TTL_SECONDS
        await asyncio.sleep(.08)
        self.assertEqual(self.memory.db.execute("SELECT count(*) FROM topics").fetchone()[0], 0)

    async def test_explicit_forget_cancels_work_and_fences_old_generation(self):
        await self.complete({"kind": "nada", "memoryUpdate": update()})
        generation, _ = self.memory.snapshot("máquina")
        self.assertTrue(await self.service.forget_daily(self.phone))
        self.assertFalse(self.memory.remember(update(), generation=generation, evidence_seqs={1}))
        self.assertEqual(self.memory.snapshot("máquina")[1], [])

    async def test_unavailable_store_keeps_legacy_conversation_working(self):
        def broken():
            raise RuntimeError("unavailable")
        other = ConversationService(lambda: Agent(), daily_context_factory=broken)
        try:
            with self.assertLogs("faceclaw-hermes", level="WARNING"):
                await other.warmup()
            self.assertNotIn(CAPABILITY, other.capabilities())
            self.assertTrue(other.submit(self.phone, self.frame(mode="assess")))
            await asyncio.wait_for(other.task, 3)
            self.assertEqual(self.phone.frames[-1]["verdict"], "tema")
        finally:
            await other.close()


class DailyBridgeTests(unittest.IsolatedAsyncioTestCase):
    async def test_authenticated_transport_opt_in_forget_and_explicit_chat_are_separate(self):
        import json
        from websockets.asyncio.client import connect
        from websockets.asyncio.server import serve
        from bridge import Bridge
        from test_bridge import FakeAgent, fake_phone, send_turn, wait_done
        memory, agent = DailyContext(":memory:"), Agent()
        agent.response = {"kind": "nada", "memoryUpdate": update()}
        bridge = Bridge("synthetic-only", conversation_factory=lambda: agent,
                        daily_context_factory=lambda: memory)
        bridge.agent_factory = lambda: FakeAgent(bridge)
        await bridge.warmup()
        try:
            async with serve(bridge.handle, "127.0.0.1", 0) as server:
                uri = "ws://127.0.0.1:" + str(server.sockets[0].getsockname()[1])
                async with connect(uri) as socket:
                    queue = asyncio.Queue()
                    reader = asyncio.create_task(fake_phone(socket, queue))
                    try:
                        await socket.send(json.dumps({"v": 1, "chan": "ctl", "type": "hello", "token": "synthetic-only"}))
                        hello = await asyncio.wait_for(queue.get(), 3)
                        self.assertIn(CAPABILITY, hello["capabilities"])
                        frame = request("daily", "assist"); frame["dailyContext"] = True
                        await socket.send(json.dumps(frame))
                        result = await asyncio.wait_for(queue.get(), 3)
                        self.assertEqual(result["kind"], "nada")
                        self.assertNotIn("memoryUpdate", result)
                        self.assertEqual(len(memory.snapshot("máquina")[1]), 1)
                        await socket.send(json.dumps({"v": 1, "chan": "conv", "type": "forget-daily-context",
                                                      "requestId": "forget-1"}))
                        result = await asyncio.wait_for(queue.get(), 3)
                        self.assertEqual((result["type"], result["requestId"], result["ok"]),
                                         ("daily-context-cleared", "forget-1", True))
                        self.assertEqual(memory.snapshot("máquina")[1], [])
                        await send_turn(socket, "explicit", "hello")
                        frames = await wait_done(queue, "explicit")
                        self.assertTrue(all(f["chan"] == "chat" for f in frames))
                        self.assertEqual(frames[-1]["text"], "prueba lista.")
                    finally:
                        await socket.close()
                        await reader
        finally:
            await bridge.close()


if __name__ == "__main__":
    unittest.main()
