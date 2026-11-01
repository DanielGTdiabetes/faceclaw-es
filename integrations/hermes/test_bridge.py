"""Isolated protocol tests. Never connects to the production phone bridge."""
import asyncio
import contextlib
import json
import logging
import threading
import time

from websockets.asyncio.client import connect
from websockets.asyncio.server import serve
from bridge import Bridge


class FakeAgent:
    model = "mock"
    tools = []

    def __init__(self, bridge):
        self.bridge = bridge
        self.interrupted = threading.Event()
        self.overlap = 0

    def clear_interrupt(self):
        self.interrupted.clear()

    def interrupt(self, **kwargs):
        self.interrupted.set()

    def close(self):
        pass

    def run_conversation(self, prompt, conversation_history=None):
        assert self.overlap == 0, "Concurrent access to AIAgent"
        self.overlap += 1
        try:
            if prompt == "fail":
                raise RuntimeError("Simulated")
            if prompt == "slow":
                for _ in range(200):
                    if self.interrupted.is_set():
                        # Cancelled turns cannot reach another phone's tools.
                        assert "error" in json.loads(self.bridge.phone_tool("tools/list"))
                        return {"final_response": "", "messages": []}
                    time.sleep(.01)
            if prompt == "tools":
                self.tool_start_callback("private-call-id", "glasses_list_tools", {"secret": "redacted"})
                result = json.loads(self.bridge.phone_tool("tools/list"))
                assert result["connected"] and len(result["tools"]) == 1
                result = json.loads(self.bridge.phone_tool("tools/call", {"name": "test.echo", "arguments": {"value": "safe"}}))
                assert result["content"][0]["text"] == "safe"
            self.stream_delta_callback("prueba ")
            self.stream_delta_callback("lista")
            return {"final_response": "prueba lista.", "messages": [{"role": "user", "content": prompt}]}
        finally:
            self.overlap -= 1


async def fake_phone(ws, frames):
    async for raw in ws:
        frame = json.loads(raw)
        if frame.get("chan") == "mcp":
            msg = frame["msg"]
            if "id" not in msg:
                continue
            method = msg["method"]
            if method == "initialize":
                result = {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}}, "serverInfo": {"name": "mock", "version": "1"}}
            elif method == "tools/list":
                result = {"tools": [{"name": "test.echo", "description": "Harmless test", "inputSchema": {"type": "object", "properties": {"value": {"type": "string"}}}}]}
            elif method == "tools/call":
                result = {"content": [{"type": "text", "text": "safe"}]}
            else:
                raise AssertionError(method)
            await ws.send(json.dumps({"v": 1, "chan": "mcp", "msg": {"jsonrpc": "2.0", "id": msg["id"], "result": result}}))
        else:
            await frames.put(frame)


async def send_turn(ws, turn_id, text):
    await ws.send(json.dumps({"v": 1, "chan": "chat", "type": "utterance", "turnId": turn_id, "text": text}))


async def wait_done(frames, turn_id, expected="turn-done"):
    seen = []
    while True:
        frame = await asyncio.wait_for(frames.get(), 15)
        if frame.get("turnId") == turn_id:
            seen.append(frame)
            if frame.get("type") == expected:
                return seen


async def protocol_tests():
    bridge = Bridge("test-only")
    bridge.agent_factory = lambda: FakeAgent(bridge)
    await bridge.warmup()
    try:
        async with serve(bridge.handle, "127.0.0.1", 0) as server:
            uri = "ws://127.0.0.1:" + str(server.sockets[0].getsockname()[1])
            async with connect(uri) as bad:
                await bad.send(json.dumps({"v": 1, "chan": "ctl", "type": "hello", "token": "wrong"}))
                await bad.wait_closed()
                assert bad.close_code == 1008
            async with connect(uri) as ws:
                frames = asyncio.Queue()
                reader = asyncio.create_task(fake_phone(ws, frames))
                await ws.send(json.dumps({"v": 1, "chan": "ctl", "type": "hello", "token": "test-only"}))
                assert (await asyncio.wait_for(frames.get(), 2))["type"] == "hello-ack"
                await send_turn(ws, "one", "tools")
                seen = await wait_done(frames, "one")
                assert seen[-1]["text"] == "prueba lista."
                assert any(f.get("replace") for f in seen)
                assert [f["label"] for f in seen if f["type"] == "tool-activity"] == ["glasses_list_tools"]
                await send_turn(ws, "two", "fail")
                await wait_done(frames, "two", "turn-error")
                await send_turn(ws, "three", "slow")
                await asyncio.sleep(.1)
                await send_turn(ws, "four", "tools")
                await wait_done(frames, "four")
                assert bridge.agent.overlap == 0
                await send_turn(ws, "five", "slow")
                await asyncio.sleep(.1)
                await ws.send(json.dumps({"v": 1, "chan": "chat", "type": "cancel", "turnId": "five"}))
                seen = await wait_done(frames, "five")
                assert seen[-1]["stopReason"] == "cancelled"
                await send_turn(ws, "old-phone", "slow")
                await asyncio.sleep(.1)
                async with connect(uri) as replacement:
                    replacement_frames = asyncio.Queue()
                    replacement_reader = asyncio.create_task(fake_phone(replacement, replacement_frames))
                    await replacement.send(json.dumps({"v": 1, "chan": "ctl", "type": "hello", "token": "test-only"}))
                    assert (await asyncio.wait_for(replacement_frames.get(), 3))["type"] == "hello-ack"
                    await send_turn(replacement, "new-phone", "tools")
                    seen = await wait_done(replacement_frames, "new-phone")
                    assert seen[-1]["text"] == "prueba lista."
                    assert bridge.agent.overlap == 0
                    await replacement.close()
                    await replacement_reader
                await ws.close()
                await reader
        print("PASS authentication, MCP list/call, streaming, replacement, failure, cancellation, phone reconnection and serial agent ownership")
    finally:
        await bridge.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(protocol_tests())
