import asyncio
import contextlib
import json
import unittest
from types import SimpleNamespace
from notification_delivery import NotificationDelivery


class Phone:
    closed = False

    def __init__(self):
        self.frames = []
        self.on_send = lambda frame: None

    async def send(self, channel, **frame):
        self.frames.append(frame)
        self.on_send(frame)


class DeliveryTests(unittest.IsolatedAsyncioTestCase):
    def setup_router(self):
        self.now = 100
        self.telegram = []
        self.phone = Phone()
        self.bridge = SimpleNamespace(phone=self.phone, token="synthetic-token")
        self.router = NotificationDelivery(self.bridge, self.send_telegram, lambda: self.now)
        self.presence()

    def send_telegram(self, text):
        self.telegram.append(text)
        return {"success": True, "channel": "telegram"}

    def presence(self, **patch):
        self.router.receive(self.phone, {"type": "presence", "connected": True, "worn": True,
            "charging": False, "available": True, "allowed": True, **patch})

    async def test_glasses_confirmed_once_and_conflicting_id_refused(self):
        self.setup_router()
        self.phone.on_send = lambda frame: self.router.receive(self.phone,
            {"type": "receipt", "id": frame["id"], "presented": True})
        results = await asyncio.gather(*(self.router.deliver("one", "Aviso") for _ in range(3)))
        self.assertTrue(all(r["channel"] == "glasses" for r in results))
        self.assertEqual(len(self.phone.frames), 1)
        self.assertEqual(self.telegram, [])
        self.assertEqual((await self.router.deliver("one", "Distinto"))["error"], "id_conflict")

    async def test_unknown_stale_removed_charging_disallowed_or_long_go_to_telegram(self):
        for patch in ({"worn": None}, {"worn": False}, {"connected": False}, {"charging": True},
                      {"available": False}, {"allowed": False}, {}):
            self.setup_router(); self.presence(**patch)
            if not patch:
                self.now += 40
            self.assertEqual((await self.router.deliver("one", "Aviso"))["channel"], "telegram")
            self.assertEqual(len(self.phone.frames), 0)
        self.setup_router()
        self.assertEqual((await self.router.deliver("long", "a" * 241))["channel"], "telegram")

    async def test_refusal_disconnect_and_old_socket_never_confirm(self):
        self.setup_router()
        old = Phone()
        self.router.receive(old, {"type": "presence", "connected": True, "worn": True,
            "charging": False, "available": True, "allowed": True})
        def reject(frame):
            if frame["type"] == "deliver":
                self.router.receive(old, {"type": "receipt", "id": frame["id"], "presented": True})
                self.router.disconnect(self.phone)
        self.phone.on_send = reject
        self.assertEqual((await self.router.deliver("one", "Aviso"))["channel"], "telegram")
        self.assertEqual(self.phone.frames[-1]["type"], "cancel")

    async def test_authenticated_http_delivers_but_unauthorized_cannot(self):
        self.setup_router(); self.presence(worn=False)
        server = await asyncio.start_server(self.router.http, "127.0.0.1", 0)
        try:
            for token, status in (("wrong", b"401"), ("synthetic-token", b"200")):
                reader, writer = await asyncio.open_connection("127.0.0.1", server.sockets[0].getsockname()[1])
                body = json.dumps({"id": "http", "text": "Aviso"}).encode()
                writer.write(f"POST /notify HTTP/1.1\r\nAuthorization: Bearer {token}\r\nContent-Length: {len(body)}\r\n\r\n".encode() + body)
                await writer.drain()
                response = await reader.read()
                self.assertIn(status, response.split(b"\r\n")[0])
                writer.close(); await writer.wait_closed()
            self.assertEqual(self.telegram, ["Aviso"])
        finally:
            server.close(); await server.wait_closed()


class BridgeWebSocketTests(unittest.IsolatedAsyncioTestCase):
    """Real Bridge.handle over a loopback WebSocket with a simulated phone; never the user's phone."""

    async def test_negotiated_presence_receipt_fallback_and_replaced_socket(self):
        from websockets.asyncio.client import connect
        from websockets.exceptions import ConnectionClosed
        from websockets.asyncio.server import serve
        from bridge import Bridge

        class Agent:
            model, tools = "mock", []
            def close(self): pass

        bridge = Bridge("test-only", agent_factory=Agent)
        telegram = []
        bridge.notifications.sender = lambda text: telegram.append(text) or {"success": True, "channel": "telegram"}
        presence = {"chan": "notify", "type": "presence", "connected": True, "worn": True,
                    "charging": False, "available": True, "allowed": True}

        async def phone(ws, presented):
            """Answer MCP setup and notify deliveries like the app; record notify frames."""
            seen = []
            with contextlib.suppress(ConnectionClosed):
                async for raw in ws:
                    frame = json.loads(raw)
                    if frame.get("chan") == "mcp" and "id" in frame["msg"]:
                        result = {"tools": []} if frame["msg"]["method"] == "tools/list" else {}
                        await ws.send(json.dumps({"v": 1, "chan": "mcp", "msg": {"jsonrpc": "2.0",
                                                  "id": frame["msg"]["id"], "result": result}}))
                    elif frame.get("chan") == "notify":
                        seen.append(frame)
                        if frame["type"] == "deliver" and presented is not None:
                            await ws.send(json.dumps({"v": 1, "chan": "notify", "type": "receipt",
                                                      "id": frame["id"], "presented": presented}))
                    elif frame.get("type") == "hello-ack":
                        seen.append(frame)
            return seen

        async def hello(ws):
            await ws.send(json.dumps({"v": 1, "chan": "ctl", "type": "hello", "token": "test-only",
                                      "capabilities": ["chat", "mcp", "notify/1"]}))

        async def settle(predicate):
            for _ in range(200):
                if predicate():
                    return
                await asyncio.sleep(.01)
            self.fail("condition not reached")

        async with serve(bridge.handle, "127.0.0.1", 0) as server:
            uri = "ws://127.0.0.1:" + str(server.sockets[0].getsockname()[1])
            async with connect(uri) as ws:
                reader = asyncio.create_task(phone(ws, True))
                await hello(ws)
                await settle(lambda: bridge.phone is not None)
                # Without presence the router cannot assume worn glasses.
                self.assertEqual((await bridge.notifications.deliver("before", "Aviso"))["channel"], "telegram")
                await ws.send(json.dumps({"v": 1, **presence}))
                await settle(lambda: bridge.notifications.can_use_glasses(bridge.phone))
                self.assertEqual((await bridge.notifications.deliver("worn", "Aviso"))["channel"], "glasses")
                old_phone = bridge.phone
                async with connect(uri) as replacement:
                    replacement_reader = asyncio.create_task(phone(replacement, False))
                    await hello(replacement)
                    await settle(lambda: bridge.phone is not None and bridge.phone is not old_phone)
                    # The replaced socket is closed by the bridge and its presence no longer counts.
                    await asyncio.wait_for(ws.wait_closed(), 2)
                    self.assertFalse(bridge.notifications.can_use_glasses(bridge.phone))
                    await replacement.send(json.dumps({"v": 1, **presence}))
                    await settle(lambda: bridge.notifications.can_use_glasses(bridge.phone))
                    self.assertEqual((await bridge.notifications.deliver("refused", "Rechazo"))["channel"], "telegram")
                    await replacement.close()
                    new_seen = await replacement_reader
                old_seen = await reader
        self.assertIn("notify/1", next(f for f in old_seen if f.get("type") == "hello-ack")["capabilities"])
        self.assertEqual([f["type"] for f in old_seen if f.get("chan") == "notify"], ["deliver"])
        self.assertEqual([f["type"] for f in new_seen if f.get("chan") == "notify"], ["deliver", "cancel"])
        self.assertEqual(telegram, ["Aviso", "Rechazo"])
        await bridge.close()


if __name__ == "__main__":
    unittest.main()
