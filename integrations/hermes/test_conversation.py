"""Synthetic protocol/lifecycle tests: no provider, model, credentials or production port."""
import asyncio
import copy
import json
import threading
import time
import unittest

from conversation import (CAPABILITIES, STYLE, ConversationService, restricted_agent_class, valid_ref,
                          valid_request)


def request(request_id="c1", mode="assess"):
    return {"v": 1, "chan": "conv", "type": mode, "requestId": request_id, "timeoutMs": 5000,
            "ref": {"sessionId": "s", "streamId": 1, "associationVersion": 1, "episodeId": 1, "revision": 1},
            "turns": [{"seq": 1, "speaker": "1", "relation": "portador", "text": "Tema sintético",
                       "startMs": 1000, "endMs": 1500},
                      {"seq": 2, "speaker": "2", "relation": "otro", "text": "Respuesta sintética",
                       "startMs": 2000, "endMs": 2500}]}


def anonymous(request_id="a1", mode="assess", voices=("1",), version=0):
    """Manual ON with optional identity: unknown relations, possibly before any association."""
    return {"v": 1, "chan": "conv", "type": mode, "requestId": request_id, "timeoutMs": 5000,
            "modality": "identidad-opcional",
            "ref": {"sessionId": "s", "streamId": 1, "associationVersion": version, "episodeId": 1, "revision": 1},
            "turns": [{"seq": i + 1, "speaker": speaker, "relation": "desconocido", "text": "Tema sintético",
                       "startMs": 1000 * (i + 1), "endMs": 1000 * (i + 1) + 500} for i, speaker in enumerate(voices)]}


class Phone:
    def __init__(self):
        self.closed = False
        self.frames = []

    async def send(self, channel, **fields):
        self.frames.append({"chan": channel, **fields})


class Agent:
    def __init__(self):
        self.interrupted = threading.Event()
        self.started = threading.Event()
        self.gate = threading.Event()
        self.gate.set()
        self.calls = []
        self.response = {"verdict": "tema"}
        self.running = 0
        self.overlap = False
        self.closed = False

    def clear_interrupt(self):
        self.interrupted.clear()

    def interrupt(self, **kwargs):
        self.interrupted.set()

    def run_conversation(self, prompt, conversation_history):
        self.running += 1
        self.overlap |= self.running > 1
        try:
            self.calls.append((json.loads(prompt), conversation_history))
            self.started.set()
            while not self.gate.is_set() and not self.interrupted.is_set():
                time.sleep(.005)
            return {"final_response": json.dumps(self.response), "messages": [{"private": "not retained"}]}
        finally:
            self.running -= 1

    def close(self):
        self.closed = True


class ValidationTests(unittest.TestCase):
    def test_request_limits_and_attribution(self):
        self.assertTrue(valid_request(request()))
        for key, value in [("timeoutMs", 0), ("timeoutMs", float("nan")), ("timeoutMs", float("inf")),
                           ("timeoutMs", True), ("timeoutMs", 30001), ("requestId", ""), ("v", 2)]:
            frame = request(); frame[key] = value
            self.assertFalse(valid_request(frame))
        for key, value in [("seq", 1), ("speaker", "1"), ("relation", "desconocido"),
                           ("endMs", float("nan")), ("text", "x" * 6001)]:
            frame = request(); frame["turns"][1][key] = value
            self.assertFalse(valid_request(frame))

    def test_capabilities_announce_conv1_and_conv2(self):
        self.assertEqual(CAPABILITIES, ("conv/1", "conv/2"))

    def test_optional_identity_accepts_anonymous_one_or_two_voices_without_inventing_relations(self):
        for voices in (("1",), ("1", "2"), (None,), (None, "3")):
            self.assertTrue(valid_request(anonymous(voices=voices)), voices)
        mixed = anonymous(voices=("1", "2"), version=1)
        mixed["turns"][0]["relation"] = "portador"
        self.assertTrue(valid_request(mixed))
        known = anonymous(voices=("2",), version=1)
        known["turns"][0]["relation"] = "otro"
        self.assertTrue(valid_request(known))

    def test_modality_is_explicit_and_validated_with_conv1_default(self):
        legacy = request()
        self.assertNotIn("modality", legacy)
        self.assertTrue(valid_request(legacy))
        self.assertTrue(valid_request({**request(), "modality": "identidad-requerida"}))
        for value in ("", "opcional", "IDENTIDAD-OPCIONAL", None, 1, True, ["identidad-opcional"]):
            self.assertFalse(valid_request({**anonymous(), "modality": value}), value)
        # Without the explicit field an anonymous context keeps the strict contract and is rejected.
        frame = anonymous(version=1); del frame["modality"]
        self.assertFalse(valid_request(frame))
        self.assertFalse(valid_request({**anonymous(version=1), "modality": "identidad-requerida"}))

    def test_association_version_zero_only_for_optional_identity(self):
        self.assertTrue(valid_request(anonymous(version=0)))
        strict = request(); strict["ref"]["associationVersion"] = 0
        self.assertFalse(valid_request(strict))
        for value in (-1, 1.5, True, "0", 2 ** 53):
            frame = anonymous(); frame["ref"]["associationVersion"] = value
            self.assertFalse(valid_request(frame), value)
        self.assertTrue(valid_ref(anonymous()["ref"]))
        self.assertFalse(valid_ref(anonymous()["ref"], 1))

    def test_contradictory_attribution_is_rejected_in_both_modalities(self):
        cases = []
        frame = anonymous(voices=("1", "1"), version=1); frame["turns"][0]["relation"] = "portador"
        cases.append(frame)  # same label as wearer and unknown
        frame = anonymous(voices=("1", "1"), version=1)
        frame["turns"][0]["relation"] = "portador"; frame["turns"][1]["relation"] = "otro"
        cases.append(frame)  # wearer label also another voice
        frame = anonymous(voices=("1", "2"), version=1)
        frame["turns"][0]["relation"] = "portador"; frame["turns"][1]["relation"] = "portador"
        cases.append(frame)  # two wearers
        frame = anonymous(voices=(None,), version=1); frame["turns"][0]["relation"] = "portador"
        cases.append(frame)  # wearer without label
        legacy = request(); legacy["turns"][1]["speaker"] = "1"
        cases.append(legacy)
        for frame in cases:
            self.assertFalse(valid_request(frame))

    def test_optional_identity_keeps_structure_size_and_time_limits(self):
        for key, value in [("seq", 0), ("text", " "), ("text", "x" * 6001), ("endMs", 500), ("startMs", -1),
                           ("relation", "yo"), ("speaker", "x" * 33), ("startMs", True)]:
            frame = anonymous(); frame["turns"][0][key] = value
            self.assertFalse(valid_request(frame), key)
        many = anonymous(voices=tuple(str(i % 2) for i in range(41)))
        self.assertFalse(valid_request(many))
        self.assertFalse(valid_request({**anonymous(), "turns": []}))
        self.assertFalse(valid_request({**anonymous(), "timeoutMs": 30001}))
        self.assertFalse(valid_request({**anonymous(), "requestId": ""}))

    def test_style_never_assumes_the_wearer_and_keeps_balanced_tone(self):
        for phrase in ("identity is opcional", "Never assume who said a desconocido turn",
                       "neither two voices, alternation nor a greeting is required",
                       "never obliges you to contribute", "Humor, irony and mild sarcasm are optional", "Do not force jokes",
                       "Most contributions should be", "Prefer silence", "drop humor",
                       "Do not repeat any of them", "keep participating as usual"):
            self.assertIn(phrase, STYLE)

    def test_dispatch_is_denied_and_persistence_entry_points_are_disabled(self):
        class Base:
            def __init__(self, **kwargs):
                self.tools = ["memory", "terminal", "glasses_call"]
        agent = restricted_agent_class(Base)()
        self.assertEqual(agent.tools, [])
        self.assertTrue(agent._persist_disabled)
        self.assertFalse(agent._session_json_enabled)
        for name in ("_execute_tool_calls", "_execute_tool_calls_concurrent", "_execute_tool_calls_sequential", "_invoke_tool"):
            with self.assertRaises(RuntimeError):
                getattr(agent, name)("memory", {"text": "must not be stored"})
        self.assertEqual(agent.blocked_tools, 4)
        for name in ("_persist_session", "_save_session_log", "_ensure_db_session", "_get_session_db_for_recall"):
            self.assertIsNone(getattr(agent, name)())


class LifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.agent = Agent()
        self.service = ConversationService(lambda: self.agent)
        self.phone = Phone()
        await self.service.warmup()

    async def asyncTearDown(self):
        self.agent.gate.set()
        await self.service.close()
        self.assertFalse(self.agent.overlap)

    async def wait(self, condition):
        for _ in range(100):
            if condition():
                return
            await asyncio.sleep(.01)
        self.fail("Timed out waiting for synthetic operation")

    async def test_current_verdict_and_fresh_history(self):
        frame = request()
        self.assertTrue(self.service.submit(self.phone, frame))
        frame["turns"][0]["text"] = "changed after submit"
        await self.wait(lambda: len(self.phone.frames) == 1)
        self.assertEqual(self.phone.frames[0]["verdict"], "tema")
        self.assertEqual(self.agent.calls[0][1], [])
        self.assertEqual(self.agent.calls[0][0]["turns"][0]["text"], "Tema sintético")
        self.assertIsNone(self.service.active)

    async def test_optional_identity_reaches_the_model_without_attribution_and_is_correlated(self):
        frame = anonymous(voices=("1", None))
        self.assertTrue(self.service.submit(self.phone, frame))
        await self.wait(lambda: len(self.phone.frames) == 1)
        prompt = self.agent.calls[0][0]
        self.assertEqual(prompt["identity"], "opcional")
        self.assertEqual([t["relation"] for t in prompt["turns"]], ["desconocido", "desconocido"])
        self.assertNotIn("portador", json.dumps(prompt))
        self.assertEqual((self.phone.frames[0]["requestId"], self.phone.frames[0]["ref"]["associationVersion"]),
                         ("a1", 0))
        self.service.submit(self.phone, request("c9"))
        await self.wait(lambda: len(self.phone.frames) == 2)
        self.assertEqual(self.agent.calls[1][0]["identity"], "requerida")

    async def test_optional_identity_cancel_and_abstentions_stay_silent(self):
        self.agent.gate.clear()
        frame = anonymous()
        self.service.submit(self.phone, frame)
        await self.wait(self.agent.started.is_set)
        self.service.cancel(self.phone, frame["requestId"], frame["ref"])
        await self.wait(lambda: self.service.active is None)
        self.assertEqual(self.phone.frames, [])
        self.agent.gate.set()
        for i, value in enumerate([{"verdict": "cortesia"}, {"verdict": "incierto"}, {"kind": "nada"}]):
            self.agent.response = value
            self.service.submit(self.phone, anonymous(str(i), "assist" if i == 2 else "assess"))
            await self.wait(lambda: len(self.phone.frames) == i + 1)
            self.assertNotIn("text", self.phone.frames[-1])

    async def test_courtesy_uncertainty_and_silent_assistance(self):
        for i, value in enumerate([{"verdict": "cortesia"}, {"verdict": "incierto"}, {"kind": "nada"}]):
            self.agent.response = value
            self.service.submit(self.phone, request(str(i), "assist" if i == 2 else "assess"))
            await self.wait(lambda: len(self.phone.frames) == i + 1)
            self.assertNotIn("text", self.phone.frames[-1])

    async def test_final_assistance_and_invalid_result_abstention(self):
        self.agent.response = {"kind": "mensaje", "text": " Una idea "}
        self.service.submit(self.phone, request(mode="assist"))
        await self.wait(lambda: self.phone.frames)
        self.assertEqual(self.phone.frames[0]["text"], "Una idea")
        self.agent.response = {"kind": "mensaje", "text": "x" * 1201}
        self.service.submit(self.phone, request("c2", "assist"))
        await self.wait(lambda: len(self.phone.frames) == 2)
        self.assertEqual(self.phone.frames[-1]["type"], "error")
        self.assertNotIn("message", self.phone.frames[-1])

    async def test_short_memory_lists_only_own_delivered_texts_and_expires(self):
        clock = [1000.0]
        self.service = ConversationService(lambda: self.agent, now=lambda: clock[0])
        await self.service.warmup()
        self.agent.response = {"kind": "mensaje", "text": "Primera idea"}
        self.service.submit(self.phone, request(mode="assist"))
        await self.wait(lambda: len(self.phone.frames) == 1)
        self.assertEqual(self.agent.calls[-1][0]["alreadySaid"], [])
        self.service.submit(self.phone, request("c2", "assist"))
        await self.wait(lambda: len(self.phone.frames) == 2)
        self.assertEqual(self.agent.calls[-1][0]["alreadySaid"], ["Primera idea"], "never the speech itself")
        self.agent.response = {"verdict": "tema"}
        self.service.submit(self.phone, request("c3"))
        await self.wait(lambda: len(self.phone.frames) == 3)
        self.assertNotIn("alreadySaid", self.agent.calls[-1][0], "assessments carry no memory")
        clock[0] += 2 * 60 * 60 + 1
        self.agent.response = {"kind": "nada"}
        self.service.submit(self.phone, request("c4", "assist"))
        await self.wait(lambda: len(self.phone.frames) == 4)
        self.assertEqual(self.agent.calls[-1][0]["alreadySaid"], [], "expired after two hours")

    async def test_cancel_is_selective_idempotent_and_drops_late_output(self):
        self.agent.gate.clear()
        frame = request()
        self.service.submit(self.phone, frame)
        await self.wait(self.agent.started.is_set)
        self.service.cancel(Phone(), frame["requestId"], frame["ref"])
        self.service.cancel(self.phone, "old-request", frame["ref"])
        self.service.cancel(self.phone, frame["requestId"], {**frame["ref"], "revision": 99})
        self.assertFalse(self.agent.interrupted.is_set())
        self.service.cancel(self.phone, frame["requestId"], frame["ref"])
        self.service.cancel(self.phone, frame["requestId"], frame["ref"])
        await self.wait(lambda: self.service.active is None)
        self.assertEqual(self.phone.frames, [])

    async def test_chat_priority_and_disconnect_clear_all_context(self):
        for reason in ("chat", "disconnect"):
            self.agent.started.clear(); self.agent.gate.clear()
            self.service.submit(self.phone, request(reason))
            await self.wait(self.agent.started.is_set)
            if reason == "chat":
                self.service.set_chat_active(self.phone, True)
                self.assertFalse(self.service.submit(self.phone, request("blocked")))
            else:
                self.service.disconnect(self.phone)
            await self.wait(lambda: self.service.active is None)
            self.assertIsNone(self.service.pending)
            self.assertEqual(self.phone.frames, [])
            self.service.set_chat_active(self.phone, False)

    async def test_timeout_rejects_output_and_interrupts_inference(self):
        self.agent.gate.clear()
        frame = request(); frame["timeoutMs"] = 10
        self.service.submit(self.phone, frame)
        await self.wait(lambda: self.service.active is None and self.service.task.done())
        self.assertEqual(self.phone.frames, [])
        self.assertTrue(self.agent.interrupted.is_set())

    async def test_replace_pending_is_bounded_without_agent_overlap(self):
        self.agent.gate.clear()
        self.service.submit(self.phone, request("first"))
        await self.wait(self.agent.started.is_set)
        # No yields: an input burst retains only one replaceable pending context.
        for i in range(100):
            self.service.submit(self.phone, request(str(i)))
        self.assertEqual(self.service.pending["requestId"], "99")
        self.agent.gate.set()
        await self.wait(lambda: self.service.active is None and self.service.pending is None)
        self.assertEqual([f["requestId"] for f in self.phone.frames], ["99"])
        self.assertLessEqual(len(self.agent.calls), 2)

    async def test_close_blocks_new_requests_and_closes_the_agent(self):
        await self.service.close()
        self.assertTrue(self.agent.closed)
        self.assertFalse(self.service.submit(self.phone, request()))


if __name__ == "__main__":
    unittest.main()
