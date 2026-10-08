"""Loopback integration of the patched real bridge with two synthetic agents."""
import asyncio
import json
import unittest

from websockets.asyncio.client import connect
from websockets.asyncio.server import serve
from bridge import Bridge
from test_bridge import FakeAgent, fake_phone, send_turn, wait_done
from test_conversation import Agent, anonymous, request


class BridgeTests(unittest.IsolatedAsyncioTestCase):
    async def run_bridge(self, enabled, exercise):
        conversation_agent = Agent()
        bridge = Bridge("test-only", conversation_factory=(lambda: conversation_agent) if enabled else None)
        bridge.agent_factory = lambda: FakeAgent(bridge)
        await bridge.warmup()
        try:
            async with serve(bridge.handle, "127.0.0.1", 0) as server:
                uri = "ws://127.0.0.1:" + str(server.sockets[0].getsockname()[1])
                async with connect(uri) as socket:
                    queue = asyncio.Queue()
                    reader = asyncio.create_task(fake_phone(socket, queue))
                    await socket.send(json.dumps({"v": 1, "chan": "ctl", "type": "hello", "token": "test-only"}))
                    hello = await asyncio.wait_for(queue.get(), 3)
                    await exercise(bridge, socket, queue, hello, conversation_agent)
                    await socket.close()
                    await reader
            self.assertFalse(conversation_agent.overlap)
        finally:
            conversation_agent.gate.set()
            await bridge.close()

    async def test_enabled_capability_and_correlated_result(self):
        async def exercise(bridge, socket, queue, hello, agent):
            self.assertIn("conv/1", hello["capabilities"])
            self.assertIn("conv/2", hello["capabilities"])
            await socket.send(json.dumps(request()))
            frame = await asyncio.wait_for(queue.get(), 3)
            self.assertEqual((frame["chan"], frame["type"], frame["requestId"], frame["verdict"]),
                             ("conv", "result", "c1", "tema"))
            self.assertEqual(bridge.history, None)
            self.assertEqual(agent.calls[0][1], [])
        await self.run_bridge(True, exercise)

    async def test_disabled_capability_retains_normal_chat(self):
        async def exercise(bridge, socket, queue, hello, agent):
            self.assertNotIn("conv/1", hello["capabilities"])
            self.assertNotIn("conv/2", hello["capabilities"])
            await socket.send(json.dumps(request()))
            await send_turn(socket, "normal", "hello")
            frames = await wait_done(queue, "normal")
            self.assertTrue(all(f["chan"] == "chat" for f in frames))
            self.assertEqual(frames[-1]["text"], "prueba lista.")
            self.assertEqual(agent.calls, [])
        await self.run_bridge(False, exercise)

    async def test_real_transport_updates_memory_only_after_correlated_native_receipt(self):
        async def exercise(bridge, socket, queue, hello, agent):
            self.assertIn("conv/memory-ack/1", hello["capabilities"])
            agent.response = {"kind": "mensaje", "text": "Synthetic idea"}
            await socket.send(json.dumps({**anonymous("memory", "assist"), "memoryAck": True}))
            frame = await asyncio.wait_for(queue.get(), 3)
            self.assertEqual(bridge.conversation.said, [])
            ack = {"v": 1, "chan": "conv", "type": "presented", "requestId": frame["requestId"],
                   "ref": frame["ref"], "deliveryId": frame["deliveryId"]}
            await socket.send(json.dumps({**ack, "requestId": "wrong"}))
            # A ping/pong orders the preceding receipt without timing assumptions.
            await socket.send(json.dumps({"v": 1, "chan": "ctl", "type": "ping"}))
            self.assertEqual((await asyncio.wait_for(queue.get(), 3))["type"], "pong")
            self.assertEqual(bridge.conversation.said, [])
            await socket.send(json.dumps(ack))
            await socket.send(json.dumps({**anonymous("duplicate", "assist"), "memoryAck": True}))
            duplicate = await asyncio.wait_for(queue.get(), 3)
            self.assertEqual(duplicate["kind"], "nada")
            self.assertEqual(bridge.conversation._recent_said(), ["Synthetic idea"])
            self.assertEqual(agent.calls[-1][0]["alreadySaid"], ["Synthetic idea"])
            self.assertIsNone(bridge.history)
        await self.run_bridge(True, exercise)

    async def test_optional_identity_context_and_invalid_modality_over_the_real_bridge(self):
        async def exercise(bridge, socket, queue, hello, agent):
            await socket.send(json.dumps({**anonymous("bad"), "modality": "otra"}))
            await socket.send(json.dumps(anonymous()))
            frame = await asyncio.wait_for(queue.get(), 3)
            self.assertEqual((frame["chan"], frame["type"], frame["requestId"], frame["ref"]["associationVersion"]),
                             ("conv", "result", "a1", 0))
            self.assertEqual(len(agent.calls), 1)
            self.assertEqual(agent.calls[0][0]["identity"], "opcional")
        await self.run_bridge(True, exercise)

    async def test_normal_chat_interrupts_conv_without_losing_chat_response(self):
        async def exercise(bridge, socket, queue, hello, agent):
            agent.gate.clear()
            await socket.send(json.dumps(request()))
            for _ in range(100):
                if agent.started.is_set():
                    break
                await asyncio.sleep(.01)
            self.assertTrue(agent.started.is_set())
            await send_turn(socket, "priority", "hello")
            frames = await wait_done(queue, "priority")
            self.assertTrue(all(f["chan"] == "chat" for f in frames))
            self.assertTrue(agent.interrupted.is_set())
            self.assertEqual(frames[-1]["text"], "prueba lista.")
        await self.run_bridge(True, exercise)


if __name__ == "__main__":
    unittest.main()
