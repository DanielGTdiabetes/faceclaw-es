"""Notification channel checks against the INSTALLED Hermes, never its live profile.

  --inspect   read-only summary of the real profile (booleans and counts only, no values).
  (default)   end-to-end run in a temporary HERMES_HOME: real plugin discovery, notify_user,
              send_message faceclaw:owner, adapter and cron standalone sender, against an in-process
              NotificationDelivery router on a free loopback port with synthetic secrets.
              Telegram is intercepted at send_message_tool._send_telegram: nothing leaves the host.
"""
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import shutil
import socket
import sys
import tempfile
import threading

root = Path(os.environ.get("HERMES_ROOT", "/home/dani/.hermes/hermes-agent"))
here = Path(__file__).resolve().parent
sys.path.insert(0, str(root))


def inspect():
    import hermes_bootstrap  # noqa: F401
    from hermes_cli.env_loader import load_hermes_dotenv
    load_hermes_dotenv(hermes_home=Path("/home/dani/.hermes"), project_env=root / ".env")
    from gateway.config import load_gateway_config, Platform
    config = load_gateway_config()
    telegram = config.platforms.get(Platform.TELEGRAM)
    print(json.dumps({"telegram_enabled": bool(telegram and telegram.enabled),
        "telegram_token_present": bool(telegram and telegram.token),
        "telegram_home_present": bool(telegram and telegram.home_channel and telegram.home_channel.chat_id)}))
    jobs_file = Path(os.environ.get("HERMES_HOME", "/home/dani/.hermes")) / "cron" / "jobs.json"
    if jobs_file.exists():
        jobs = json.loads(jobs_file.read_text())
        if isinstance(jobs, dict):
            jobs = jobs.get("jobs", [])
        print(json.dumps({"scheduled_jobs": len(jobs), "delivery_platforms":
            sorted({str(j.get("deliver", "local")).split(":")[0] for j in jobs if isinstance(j, dict)})}))


class FakePhone:
    """Stands in for the phone socket: answers `deliver` with a BLE receipt when worn."""

    def __init__(self, delivery):
        self.delivery, self.closed, self.worn, self.delivered = delivery, False, True, []

    def presence(self):
        self.delivery.receive(self, {"type": "presence", "connected": True, "worn": self.worn,
                                     "charging": False, "available": True, "allowed": True})

    async def send(self, chan, **frame):
        if chan == "notify" and frame.get("type") == "deliver":
            self.delivered.append(frame["text"])
            self.delivery.receive(self, {"type": "receipt", "id": frame["id"], "presented": self.worn})


def free_port():
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def run():
    import hermes_bootstrap  # noqa: F401
    from hermes_cli import venv_sync
    # Reuse the installed dependency runtime; only plugin/config state is temporary. Test-only bypass.
    venv_sync.prepare_launch = lambda *args, **kwargs: None
    for key in [k for k in os.environ if k.startswith(("TELEGRAM_", "FACECLAW_"))]:
        del os.environ[key]
    with tempfile.TemporaryDirectory(prefix="faceclaw-notify-test-") as temporary:
        home = Path(temporary)
        os.environ["HERMES_HOME"] = temporary
        token = "synthetic-" + os.urandom(8).hex()
        secret = home / "private.json"
        secret.write_text(json.dumps({"token": token}))
        port = free_port()
        shutil.copytree(here / "notification-plugin", home / "plugins" / "faceclaw-notifications",
                        ignore=shutil.ignore_patterns("__pycache__"))
        (home / "config.yaml").write_text(
            "plugins:\n  enabled: [faceclaw-notifications]\nplatforms:\n"
            "  telegram:\n    enabled: true\n    token: synthetic-telegram\n"
            "    home_channel:\n      platform: telegram\n      chat_id: '1000'\n      name: Synthetic\n"
            "  faceclaw:\n    enabled: true\n"
            "    home_channel:\n      platform: faceclaw\n      chat_id: owner\n      name: Avisos personales\n"
            f"    extra:\n      bridge_secret_file: {secret}\n      bridge_port: {port}\n")

        import tools.send_message_tool as smt
        telegram = []

        async def fake_telegram(token_, chat_id, message, **kwargs):
            telegram.append((chat_id, message))
            return {"success": True, "platform": "telegram", "chat_id": chat_id, "message_id": "synthetic"}
        smt._send_telegram = fake_telegram

        from hermes_cli.plugins import discover_plugins, get_plugin_manager
        discover_plugins()
        from gateway.config import load_gateway_config, Platform
        from gateway.platform_registry import platform_registry
        from tools.registry import registry
        entry = platform_registry.get("faceclaw")
        if entry is None:
            print([(key, value.enabled, value.error) for key, value in get_plugin_manager()._plugins.items()
                   if "faceclaw" in key])
        assert entry is not None, "plugin platform was not discovered"
        assert registry.get_entry("notify_user") is not None, "notify_user not registered"
        sections = get_plugin_manager()._system_prompt_sections
        assert "faceclaw.personal-notifications" in sections, "prompt section not registered"
        config = load_gateway_config().platforms[Platform("faceclaw")]
        assert config.extra["bridge_secret_file"] == str(secret)
        assert load_gateway_config().get_home_channel(Platform("faceclaw")).chat_id == "owner"

        # Router under test, exactly as bridge.py constructs it, on its own loop/thread.
        spec = importlib.util.spec_from_file_location("notification_delivery", here / "notification_delivery.py")
        nd = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(nd)
        bridge = type("Bridge", (), {"token": token, "phone": None})()
        delivery = nd.NotificationDelivery(bridge)
        phone = FakePhone(delivery)
        loop = asyncio.new_event_loop()
        started = threading.Event()
        holder = {}

        def serve():
            asyncio.set_event_loop(loop)
            holder["server"] = loop.run_until_complete(
                asyncio.start_server(delivery.http, "127.0.0.1", port, limit=8192))
            started.set()
            loop.run_forever()
        thread = threading.Thread(target=serve, daemon=True)
        thread.start()
        assert started.wait(5)

        def on_loop(fn):
            asyncio.run_coroutine_threadsafe(asyncio.sleep(0), loop).result(5)
            loop.call_soon_threadsafe(fn)
            asyncio.run_coroutine_threadsafe(asyncio.sleep(0), loop).result(5)

        def connect_phone(worn):
            bridge.phone = phone
            phone.worn = worn
            on_loop(phone.presence)

        def result(raw):
            return json.loads(raw) if isinstance(raw, str) else raw

        checks = []
        # 1. Worn glasses: notify_user lands on the lenses only.
        connect_phone(True)
        r = result(registry.dispatch("notify_user", {"text": "Aviso sintético gafas"}))
        assert r.get("success") is True and r.get("channel") == "glasses", r
        assert phone.delivered == ["Aviso sintético gafas"] and not telegram, (phone.delivered, telegram)
        checks.append("notify_user->glasses")
        # 2. Removed glasses: router falls back to Telegram home (intercepted).
        connect_phone(False)
        r = result(registry.dispatch("notify_user", {"text": "Aviso sintético quitadas"}))
        assert r.get("success") is True and r.get("channel") == "telegram", r
        assert telegram[-1] == ("1000", "Aviso sintético quitadas"), telegram
        checks.append("notify_user->telegram(removed)")
        # 3. No phone at all.
        bridge.phone = None
        r = result(smt.send_message_tool({"target": "faceclaw:owner", "message": "Sin móvil"}))
        assert r.get("success") is True and telegram[-1][1] == "Sin móvil", r
        checks.append("send_message faceclaw:owner->telegram(no phone)")
        # 4. Bare platform target uses the faceclaw home channel (owner).
        connect_phone(True)
        r = result(smt.send_message_tool({"target": "faceclaw", "message": "Home"}))
        assert r.get("success") is True and phone.delivered[-1] == "Home", r
        checks.append("send_message faceclaw(home)->glasses")
        # 5. Nobody else is addressable.
        r = result(smt.send_message_tool({"target": "faceclaw:someone", "message": "x"}))
        assert not r.get("success"), r
        checks.append("other chat refused")
        # 6. Long text skips the lenses.
        long_text = "L" * 300
        r = result(registry.dispatch("notify_user", {"text": long_text}))
        assert r.get("channel") == "telegram" and telegram[-1][1] == long_text, r
        checks.append("long->telegram")
        # 7. Cron's out-of-process lane and the gateway adapter use the same router.
        r = asyncio.run(entry.standalone_sender_fn(config, "owner", "Cron sintético"))
        assert r.get("success") is True and phone.delivered[-1] == "Cron sintético", r
        adapter = entry.adapter_factory(config)

        async def adapter_round():
            assert await adapter.connect()
            ok = await adapter.send("owner", "Adaptador sintético")
            denied = await adapter.send("another-person", "x")
            await adapter.disconnect()
            return ok, denied
        ok, denied = asyncio.run(adapter_round())
        assert ok.success and not denied.success, (ok, denied)
        checks.append("cron standalone + adapter")
        # 8. Wrong token is rejected and never delivered.
        secret.write_text(json.dumps({"token": "wrong"}))
        before = (len(phone.delivered), len(telegram))
        r = asyncio.run(entry.standalone_sender_fn(config, "owner", "Token incorrecto"))
        assert not r.get("success") and (len(phone.delivered), len(telegram)) == before, r
        secret.write_text(json.dumps({"token": token}))
        checks.append("bad token rejected")
        # 9. Bridge down (connection refused): the plugin itself falls back to Telegram.
        loop.call_soon_threadsafe(holder["server"].close)
        asyncio.run_coroutine_threadsafe(holder["server"].wait_closed(), loop).result(5)
        r = result(registry.dispatch("notify_user", {"text": "Bridge caído"}))
        assert r.get("success") is True and telegram[-1][1] == "Bridge caído", r
        checks.append("bridge down->telegram")
        loop.call_soon_threadsafe(loop.stop)
        thread.join(5)
        assert all(chat == "1000" for chat, _ in telegram)
        print(json.dumps({"checks": checks, "telegram_intercepted": len(telegram),
                          "glasses_delivered": len(phone.delivered)}, ensure_ascii=False))
        print("NOTIFICATION_RUNTIME_OK")


if __name__ == "__main__":
    inspect() if "--inspect" in sys.argv else run()
