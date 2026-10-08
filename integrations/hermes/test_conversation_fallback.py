"""Wall-budget, serialization and privacy regressions; synthetic agents only."""
import asyncio
import json
import time
import sys
import threading
import types
from unittest.mock import patch
import unittest
from conversation import ConversationService, restricted_agent_class
from test_conversation import Agent, Phone, request


class FallbackTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.primary, self.backup, self.phone = Agent(), Agent(), Phone()
        self.service = ConversationService(lambda: self.primary,
            fallback_factory=lambda: self.backup, primary_seconds=.06)
        await self.service.warmup()

    async def asyncTearDown(self):
        self.primary.gate.set(); self.backup.gate.set()
        await self.service.close()

    async def complete(self, mode="assess", timeout=1500):
        frame = request(mode=mode); frame["timeoutMs"] = timeout
        self.assertTrue(self.service.submit(self.phone, frame))
        await asyncio.wait_for(self.service.task, 3)
        return self.phone.frames

    async def test_timeout_waits_for_worker_exit_before_one_backup(self):
        def slow(prompt, conversation_history):
            self.primary.running = 1
            self.primary.started.set()
            while not self.primary.interrupted.is_set(): time.sleep(.002)
            time.sleep(.08)  # Transport teardown is not instantaneous.
            self.primary.running = 0
            return {"final_response": '{"verdict":"incierto"}'}
        self.primary.run_conversation = slow
        original = self.backup.run_conversation
        def backup(prompt, conversation_history):
            self.assertEqual(self.primary.running, 0)
            return original(prompt, conversation_history)
        self.backup.run_conversation = backup
        frames = await self.complete()
        self.assertEqual(frames[0]["verdict"], "tema")
        self.assertEqual(len(self.backup.calls), 1)
        self.assertEqual(frames[0]["timing"]["attempts"], 2)
        self.assertEqual(frames[0]["timing"]["fallbackReason"], "timeout")
        self.assertGreaterEqual(frames[0]["timing"]["cancelWaitMs"], 60)

    async def test_valid_silence_and_courtesy_never_trigger_backup(self):
        for mode, response in (("assist", {"kind":"nada"}), ("assess", {"verdict":"cortesia"})):
            self.primary.response = response
            frames = await self.complete(mode)
            self.assertEqual(frames[-1]["timing"]["attempts"], 1)
            self.assertIsNone(frames[-1]["timing"]["fallbackReason"])
        self.assertEqual(self.backup.calls, [])

    async def test_invalid_json_or_exception_use_same_context_without_history(self):
        for failure in ("invalid", "error"):
            def fail(prompt, conversation_history):
                if failure == "error": raise RuntimeError("private credential must not enter diagnostics")
                return {"final_response": "broken JSON"}
            self.primary.run_conversation = fail
            await self.complete()
            frame = self.phone.frames[-1]
            self.assertEqual(frame["timing"]["fallbackReason"], failure)
            self.assertEqual(self.backup.calls[-1][1], [])
            self.assertNotIn("private", json.dumps(frame["timing"]))

    async def test_cancel_chat_disconnect_and_close_never_start_backup(self):
        for reason in ("cancel", "chat", "disconnect"):
            self.primary.gate.clear(); self.primary.started.clear()
            self.service.submit(self.phone, request(reason))
            await asyncio.to_thread(self.primary.started.wait, 1)
            if reason == "chat": self.service.set_chat_active(self.phone, True)
            elif reason == "disconnect": self.service.disconnect(self.phone)
            else: self.service.cancel(self.phone)
            await asyncio.wait_for(self.service.task, 2)
            self.service.set_chat_active(self.phone, False)
        self.assertEqual(self.phone.frames, [])
        self.assertEqual(self.backup.calls, [])

    async def test_total_deadline_and_insufficient_backup_budget(self):
        self.primary.gate.clear()
        self.assertEqual(await self.complete(timeout=30), [])
        self.assertEqual(self.backup.calls, [])
        self.primary.response = {"verdict":"broken"}; self.primary.gate.set()
        frames = await self.complete(timeout=500)
        self.assertEqual(frames[-1]["type"], "error")
        self.assertEqual(self.backup.calls, [])

    async def test_backup_is_canceled_at_original_deadline_and_no_third_attempt(self):
        self.primary.response = {"verdict":"broken"}; self.backup.gate.clear()
        self.assertEqual(await self.complete(timeout=1100), [])
        self.assertTrue(self.backup.interrupted.is_set())
        self.assertEqual(len(self.backup.calls), 1)

    async def test_first_text_metrics_do_not_store_deltas(self):
        def run(prompt, conversation_history):
            self.primary.stream_delta_callback("private speech")
            self.primary.stream_delta_callback("later")
            return {"final_response": '{"verdict":"tema"}'}
        self.primary.run_conversation = run
        frames = await self.complete()
        self.assertIsInstance(frames[0]["timing"]["primaryFirstTextMs"], int)
        self.assertNotIn("private speech", json.dumps(frames[0]["timing"]))
        self.assertIsNone(self.primary.stream_delta_callback)


class TransportExitTests(unittest.TestCase):
    def test_instance_wrapper_joins_lingering_transport_for_both_paths(self):
        for streaming in (False, True):
            done = threading.Event()
            class Request:
                def __init__(self, *args):
                    self.thread = None; self.worker = None
                def run(self):
                    def network(): time.sleep(.05); done.set()
                    self.thread = self.worker = threading.Thread(target=network)
                    self.thread.start()
                    raise InterruptedError("poll returned before transport")
            package = types.ModuleType("agent")
            nonstream = types.ModuleType("agent.chat_completion_nonstream")
            helpers = types.ModuleType("agent.chat_completion_helpers")
            nonstream._NonStreamRequest = Request; helpers._StreamingCall = Request
            package.chat_completion_helpers = helpers
            class Base:
                def __init__(self, **kwargs): pass
            agent = restricted_agent_class(Base)(); agent.api_mode = "chat_completions"
            with patch.dict(sys.modules, {"agent": package, "agent.chat_completion_nonstream": nonstream,
                                         "agent.chat_completion_helpers": helpers}):
                method = agent._interruptible_streaming_api_call if streaming else agent._interruptible_api_call
                with self.assertRaises(InterruptedError): method({})
            self.assertTrue(done.is_set(), "caller cannot start backup while network worker is alive")


if __name__ == "__main__": unittest.main()
