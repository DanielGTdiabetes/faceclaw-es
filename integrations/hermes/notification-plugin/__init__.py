"""Personal output channel for Hermes; no core modifications and no new model calls."""
import asyncio
import http.client
import json
from pathlib import Path
import uuid

OWNER = "owner"
DEFAULT_BRIDGE_PORT = 8792


def _telegram_fallback(text):
    from tools.send_message_tool import send_message_tool
    sent = json.loads(send_message_tool({"target": "telegram", "message": text}))
    # Never forward native errors or the resolved chat id: they may carry private details.
    return {"success": sent.get("success") is True, "channel": "telegram"}


def _request(config, text, identifier):
    secret = Path(config.extra["bridge_secret_file"])
    token = json.loads(secret.read_text())["token"]
    port = int(config.extra.get("bridge_port", DEFAULT_BRIDGE_PORT))
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=35)
    try:
        connection.request("POST", "/notify", json.dumps({"id": identifier, "text": text}),
                           {"Authorization": "Bearer " + token, "Content-Type": "application/json"})
        response = connection.getresponse()
        if response.status != 200:
            return {"success": False, "error": "notification_bridge_rejected"}
        result = json.loads(response.read(4096))
        return result if isinstance(result, dict) else {"success": False, "error": "notification_bridge_rejected"}
    except ConnectionRefusedError:
        # A refused connection proves that this request never reached the bridge.
        return _telegram_fallback(text)
    except (TimeoutError, OSError, ValueError):
        # Do not retry an ambiguous send: it may already have reached either channel.
        return {"success": False, "error": "delivery_unconfirmed"}
    finally:
        connection.close()


async def send_personal(config, chat_id, message, *, thread_id=None, media_files=None, force_document=False):
    if str(chat_id) != OWNER or thread_id or media_files or force_document:
        return {"success": False, "error": "personal_channel_text_only"}
    if not isinstance(message, str) or not message.strip() or len(message) > 4000:
        return {"success": False, "error": "invalid_notification"}
    identifier = uuid.uuid4().hex
    try:
        result = await asyncio.to_thread(_request, config, message, identifier)
    except (KeyError, ValueError, TypeError, OSError):
        return {"success": False, "error": "personal_channel_configuration"}
    if result.get("success"):
        result.update(platform="faceclaw", chat_id=OWNER, message_id=identifier)
    return result


def register(ctx):
    from gateway.config import Platform
    from gateway.platforms.base import BasePlatformAdapter, SendResult

    class PersonalAdapter(BasePlatformAdapter):
        MAX_MESSAGE_LENGTH = 4000

        def __init__(self, config):
            super().__init__(config, Platform("faceclaw"))

        async def connect(self, *, is_reconnect=False):
            self._running = True
            return True

        async def disconnect(self):
            self._running = False

        async def send(self, chat_id, content, reply_to=None, metadata=None):
            result = await send_personal(self.config, chat_id, content,
                thread_id=(metadata or {}).get("thread_id"))
            return SendResult(success=result.get("success") is True,
                              message_id=result.get("message_id"), error=result.get("error"))

        async def get_chat_info(self, chat_id):
            return {"name": "Avisos personales: gafas o Telegram", "type": "dm"}

    async def tool_sender(args, chat_id, platform_name, config):
        return await send_personal(config, chat_id, args.get("message", ""))

    ctx.register_platform(name="faceclaw", label="Gafas o Telegram", adapter_factory=PersonalAdapter,
        check_fn=lambda: True, validate_config=lambda cfg: bool(cfg.extra.get("bridge_secret_file")),
        # The only addressable chat is the owner; without a parser `faceclaw:owner` would not resolve.
        parse_target_ref_fn=lambda ref: (OWNER, None) if str(ref).strip() == OWNER else None,
        validate_target_ref_fn=lambda chat_id: str(chat_id) == OWNER or "only faceclaw:owner exists",
        standalone_sender_fn=send_personal, send_message_handler=tool_sender,
        max_message_length=4000, emoji="👓")

    def notify(args, **kwargs):
        from tools.send_message_tool import send_message_tool
        return send_message_tool({"target": "faceclaw:" + OWNER, "message": args.get("text", "")})

    ctx.register_tool(name="notify_user", toolset="messaging", handler=notify,
        schema={"name": "notify_user", "description":
            "Contact the owner about a relevant result, blocker or event without waiting for a question. "
            "Automatically delivers to worn, connected glasses or the owner's Telegram bot. "
            "Use for personal proactive notices; normal replies stay in their original chat. "
            "Keep text short (up to 240 characters for glasses; longer text goes to Telegram). "
            "This tool delivers a message; it does not schedule or monitor events.",
            "parameters": {"type": "object", "properties": {"text": {"type": "string", "maxLength": 4000}},
                           "required": ["text"], "additionalProperties": False}})
    ctx.register_system_prompt_section("faceclaw.personal-notifications",
        "For personal proactive notices, task completion or questions blocking your work, use notify_user "
        "(or send_message target faceclaw:owner). It chooses worn glasses or the owner's Telegram. "
        "For newly requested personal scheduled notices, use deliver=faceclaw:owner. "
        "Ordinary replies remain in the incoming chat. Respect an explicit request for another channel. "
        "This delivery preference does not authorize new monitoring or unsolicited repeated notices.")
