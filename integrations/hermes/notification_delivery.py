"""Authenticated, loopback-only personal delivery. No LLM, microphone or durable memory."""
from __future__ import annotations

import asyncio
import hmac
import json
import re
import time
from collections import OrderedDict

CAPABILITY = "notify/1"
ID_PATTERN = re.compile(r"[a-zA-Z0-9_-]{1,128}\Z")


def valid_id(value):
    return isinstance(value, str) and bool(ID_PATTERN.fullmatch(value))


def telegram_send(text):
    # Hermes owns credentials, home-chat resolution and its usual Telegram sender.
    from tools.send_message_tool import send_message_tool
    result = json.loads(send_message_tool({"target": "telegram", "message": text}))
    # Do not expose native SDK errors (which may include credentials) or chat IDs.
    return {"success": result.get("success") is True, "channel": "telegram"}


class NotificationDelivery:
    def __init__(self, bridge, sender=telegram_send, clock=time.monotonic):
        self.bridge, self.sender, self.clock = bridge, sender, clock
        self.presence = None
        self.pending = {}
        self.deliveries = OrderedDict()
        self.lock = asyncio.Lock()

    def receive(self, phone, frame):
        if phone is not self.bridge.phone or phone.closed:
            return
        if frame.get("type") == "presence":
            if (all(type(frame.get(key)) is bool for key in ("connected", "charging", "available", "allowed"))
                    and (frame.get("worn") is None or type(frame.get("worn")) is bool)):
                self.presence = (phone, self.clock(), dict(frame))
        elif frame.get("type") == "receipt" and valid_id(frame.get("id")):
            pending = self.pending.get(frame["id"])
            if pending and pending[0] is phone and not pending[1].done() and type(frame.get("presented")) is bool:
                pending[1].set_result(frame["presented"])

    def disconnect(self, phone):
        if self.presence and self.presence[0] is phone:
            self.presence = None
        for owner, future in self.pending.values():
            if owner is phone and not future.done():
                future.set_result(False)

    def can_use_glasses(self, phone):
        if not phone or phone.closed or not self.presence or self.presence[0] is not phone:
            return False
        _, at, state = self.presence
        return (0 <= self.clock() - at < 40 and state["connected"] and state["worn"] is True
                and not state["charging"] and state["available"] and state["allowed"])

    async def _glasses(self, identifier, text):
        phone = self.bridge.phone
        if len(text) > 240 or not self.can_use_glasses(phone):
            return False
        future = asyncio.get_running_loop().create_future()
        self.pending[identifier] = (phone, future)
        try:
            await phone.send("notify", type="deliver", id=identifier, text=text)
            return await asyncio.wait_for(future, 4)
        except Exception:
            return False
        finally:
            self.pending.pop(identifier, None)
            # Retire an unconfirmed overlay before using Telegram. Cancellation may be lost
            # with the socket; client dedup and BLE receipt reduce, but cannot eliminate, duplicates.
            if not future.done() or future.cancelled() or not future.result():
                try:
                    await phone.send("notify", type="cancel", id=identifier)
                except Exception:
                    pass

    async def deliver(self, identifier, text):
        if not valid_id(identifier) or not isinstance(text, str) or not text.strip() or len(text) > 4000:
            return {"success": False, "error": "invalid_notification"}
        async with self.lock:
            now = self.clock()
            while self.deliveries and now - next(iter(self.deliveries.values()))[0] > 600:
                self.deliveries.popitem(last=False)
            existing = self.deliveries.get(identifier)
            if existing:
                return existing[1] if existing[2] == text else {"success": False, "error": "id_conflict"}
            if await self._glasses(identifier, text):
                result = {"success": True, "channel": "glasses"}
            else:
                try:
                    result = await asyncio.to_thread(self.sender, text)
                except Exception:
                    result = {"success": False, "channel": "telegram", "error": "delivery_failed"}
            self.deliveries[identifier] = (self.clock(), result, text)
            while len(self.deliveries) > 256:
                self.deliveries.popitem(last=False)
            return result

    async def http(self, reader, writer):
        status, result = "400 Bad Request", {"success": False}
        try:
            head = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 3)
            if len(head) > 8192:
                raise ValueError("headers too large")
            lines = head.decode("ascii").split("\r\n")
            headers = {}
            for line in lines[1:]:
                if not line:
                    continue
                key, value = line.split(":", 1)
                key = key.lower().strip()
                if key in headers:
                    raise ValueError("duplicate header")
                headers[key] = value.strip()
            supplied = headers.get("authorization", "").encode()
            expected = ("Bearer " + self.bridge.token).encode()
            if not hmac.compare_digest(supplied, expected):
                status = "401 Unauthorized"
            elif lines[0] == "GET /status HTTP/1.1":
                status, result = "200 OK", {"success": True, "glasses": self.can_use_glasses(self.bridge.phone)}
            elif lines[0] == "POST /notify HTTP/1.1" and "transfer-encoding" not in headers:
                length = int(headers.get("content-length", "0"))
                if not 0 < length <= 20000:
                    raise ValueError("invalid size")
                body = json.loads(await asyncio.wait_for(reader.readexactly(length), 3))
                if not isinstance(body, dict):
                    raise ValueError("invalid payload")
                result = await self.deliver(body.get("id"), body.get("text"))
                status = "200 OK"
        except (ValueError, UnicodeError, asyncio.IncompleteReadError, asyncio.LimitOverrunError, TimeoutError):
            pass
        finally:
            body = json.dumps(result).encode()
            writer.write(f"HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {len(body)}\r\nConnection: close\r\n\r\n".encode() + body)
            try:
                await writer.drain()
            finally:
                writer.close()
                await writer.wait_closed()
