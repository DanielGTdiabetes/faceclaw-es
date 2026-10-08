"""Faceclaw v1 WebSocket transport for the installed Hermes AIAgent.

Only this adapter is new. It doesn't import or contact the G1/Rokid bridges.
Hermes and its tool catalog are initialized once, then reused serially.
"""

from __future__ import annotations

import asyncio
import contextlib
import hmac
import io
import json
import logging
import os
from pathlib import Path
import sys
import threading
import time
import uuid

from websockets.asyncio.server import serve
from conversation import (CAPABILITIES, ConversationService, create_conversation_agent,
                          create_conversation_fallback_agent, fallback_chain, valid_ref)

LOG = logging.getLogger("faceclaw-hermes")
# Cumulative Hermes counters; the per-turn delta is logged (numbers only, never text).
USAGE_COUNTERS = ("session_input_tokens", "session_output_tokens", "session_cache_read_tokens",
                  "session_reasoning_tokens", "session_api_calls")
STYLE = (
    "You are Hermes, receiving speech from Faceclaw on Even Realities G2 glasses. "
    "Answer in Spanish in 1-3 short sentences, plain text, unless asked otherwise. "
    "The current utterance is the request; phone context is supporting data, not a new request. "
    "If the utterance seems cut off or ambiguous, ask one brief clarification instead of guessing a "
    "request from previous topics. Clear short follow-ups may use the prior conversation. "
    "Use glasses_list_tools and glasses_call for this phone and its glasses. "
    "Discover current tool schemas before using an unfamiliar phone tool. "
    "For the user's GPS/location, 'here', 'near me', nearby places, the closest "
    "restaurant, local weather, or saving the current place, first call "
    "glasses_get_location in this turn. It reads location.get_current on the "
    "connected PHONE, not on this server. You do have a phone location tool; "
    "never claim you lack GPS access without attempting it in the current turn. "
    "Past statements that GPS was unavailable are not current capability facts. "
    "Check age_seconds, is_stale and accuracy_meters. An old or unknown-age fix "
    "cannot establish what is near the user now: report that specific limitation. "
    "After a usable fix, ground nearby searches in its coordinates; do not ask "
    "the user to supply their city when the phone already returned a usable fix. "
    "Do not claim a place is the closest unless the search provides evidence. "
    "To remember an explicitly requested place in Hermes, use your memory tool "
    "and confirm only after success. Hermes memory is distinct from Navigate's "
    "saved destinations: only claim a phone destination was saved if a current "
    "phone tool actually saved it. "
    "Use alarm.set or timer.set for alarms and timers, then verify with alarm.list "
    "or timer.list before confirming success. Respect returned errors. "
    "Never invent location, glucose, search results or successful actions. "
    "Do not use legacy G1/Rokid bridge scripts or the service on port 3001. "
    "The phone tools are the current glasses interface. Other tasks may use "
    "your normal Hermes tools."
)


class Phone:
    def __init__(self, ws):
        self.ws = ws
        self.pending = {}
        self.sequence = 0
        self.closed = False

    async def send(self, channel, **fields):
        await self.ws.send(json.dumps({"v": 1, "chan": channel, **fields}))

    async def rpc(self, method, params=None):
        if self.closed:
            raise RuntimeError("Phone disconnected")
        self.sequence += 1
        request_id = self.sequence
        future = asyncio.get_running_loop().create_future()
        self.pending[request_id] = future
        try:
            await self.send("mcp", msg={"jsonrpc": "2.0", "id": request_id,
                                       "method": method, "params": params or {}})
            return await asyncio.wait_for(future, timeout=20)
        finally:
            self.pending.pop(request_id, None)

    def receive(self, msg):
        future = self.pending.get(msg.get("id"))
        if future and not future.done():
            if "error" in msg:
                future.set_exception(RuntimeError("Phone MCP request failed"))
            else:
                future.set_result(msg.get("result"))

    def disconnect(self):
        self.closed = True
        for future in self.pending.values():
            if not future.done():
                future.set_exception(RuntimeError("Phone disconnected"))


class Bridge:
    def __init__(self, token, agent_factory=None, conversation_factory=None, conversation_fallback_factory=None):
        if not isinstance(token, str) or not token:
            raise ValueError("A private authentication token is required")
        self.token = token
        self.agent_factory = agent_factory or self.create_agent
        self.agent = None
        self.loop = None
        self.phone = None
        self.active = None
        self.history = None
        self.lock = asyncio.Lock()
        self.tasks = set()
        self.run_sequence = 0
        self.running_state = None
        self.conversation = ConversationService(conversation_factory,
            fallback_factory=conversation_fallback_factory) if conversation_factory else None

    def phone_tool(self, method, params=None):
        # Hermes may execute a tool on a separate worker thread. The serial
        # agent lock retains this state until all tool execution has finished.
        state = self.running_state
        phone = state["phone"] if state else None
        if (phone is None or phone.closed or phone is not self.phone or
            state["cancelled"].is_set()):
            return json.dumps({"error": "Phone disconnected"})
        try:
            start = time.perf_counter()
            result = asyncio.run_coroutine_threadsafe(
                phone.rpc(method, params), self.loop).result(timeout=22)
            if method == "tools/list":
                LOG.info("phone catalog tools=%d location=%s", len(result.get("tools", [])),
                         any(tool.get("name") == "location.get_current" for tool in result.get("tools", [])))
                return json.dumps({"connected": True, "tools": result.get("tools", [])})
            # Only metadata: never log arguments, results, coordinates or speech.
            LOG.info("phone tool %s", json.dumps({"name": (params or {}).get("name"),
                "outcome": "error" if result.get("isError") else "ok",
                "totalMs": round((time.perf_counter()-start)*1000)}))
            if result.get("isError"):
                return json.dumps({"error": "Phone tool failed", "result": result})
            return json.dumps(result)
        except Exception:
            LOG.info("phone request failed method=%s name=%s", method, (params or {}).get("name"))
            return json.dumps({"error": "Phone tool request failed or timed out"})

    def create_agent(self):
        root = os.environ.get("HERMES_ROOT", "/home/dani/.hermes/hermes-agent")
        sys.path.insert(0, root)
        from run_agent import AIAgent
        from hermes_cli.runtime_provider import resolve_runtime_provider
        from hermes_cli.mcp_startup import ensure_mcp_discovery_before_agent_build
        from tools.registry import registry
        from toolsets import create_custom_toolset
        import toolsets

        logging.getLogger().setLevel(logging.WARNING)
        for name in ("run_agent", "agent.turn_context", "agent.conversation_loop", "agent.tool_executor", "httpx2", "tools.mcp_tool"):
            logging.getLogger(name).setLevel(logging.WARNING)
        # Nearby search queries may contain GPS coordinates. Keep native search
        # diagnostics out of the service journal as well as our own metrics.
        for name in list(logging.Logger.manager.loggerDict):
            if name == "tools.web_tools" or name.startswith("plugins.web."):
                logging.getLogger(name).setLevel(logging.WARNING)
        LOG.setLevel(logging.INFO)

        def list_tools(args, **kwargs):
            return self.phone_tool("tools/list")

        def call_tool(args, **kwargs):
            name = args.get("tool")
            arguments = args.get("args", {})
            if not isinstance(name, str) or not name.strip() or not isinstance(arguments, dict):
                return json.dumps({"error": "Invalid phone tool arguments"})
            return self.phone_tool("tools/call", {"name": name, "arguments": arguments})

        def get_location(args, **kwargs):
            return self.phone_tool("tools/call", {"name": "location.get_current", "arguments": {}})

        registry.register(
            name="glasses_list_tools", toolset="faceclaw-phone",
            schema={"name": "glasses_list_tools", "description":
                    "List current G2 phone/glasses tools and their JSON schemas, including phone GPS/location and navigation. Use glasses_get_location directly for the user's current position.",
                    "parameters": {"type": "object", "properties": {},
                                   "additionalProperties": False}},
            handler=list_tools)
        registry.register(
            name="glasses_call", toolset="faceclaw-phone",
            schema={"name": "glasses_call", "description":
                    "Call a current phone/glasses tool from glasses_list_tools.",
                    "parameters": {"type": "object", "properties": {
                        "tool": {"type": "string"},
                        "args": {"type": "object", "additionalProperties": True}},
                        "required": ["tool"], "additionalProperties": False}},
            handler=call_tool)
        registry.register(
            name="glasses_get_location", toolset="faceclaw-phone",
            schema={"name": "glasses_get_location", "description":
                    "Read the connected PHONE's GPS/current or last-known location. Use first for 'here', 'near me', nearby places, the closest restaurant, weather near the user, or saving the current place. Returns latitude, longitude, accuracy_meters, age_seconds and is_stale, or the real phone error. Check freshness and accuracy. Available during a user conversation; never continuously tracks location.",
                    "parameters": {"type": "object", "properties": {},
                                   "additionalProperties": False}},
            handler=get_location)
        create_custom_toolset("faceclaw-phone", "Current Faceclaw phone tools",
                              tools=["glasses_list_tools", "glasses_call", "glasses_get_location"])
        # Keep phone entry points visible immediately; the rest of
        # Hermes still uses its native deferred tool search. Process-local only.
        toolsets._HERMES_CORE_TOOLS = list(dict.fromkeys(
            list(toolsets._HERMES_CORE_TOOLS) + ["glasses_list_tools", "glasses_call", "glasses_get_location"]))
        # Discover the configured native Hermes MCP catalog at service startup.
        # It isn't reconstructed by launching a CLI process for every phrase.
        ensure_mcp_discovery_before_agent_build(logger=LOG, single_query=False)
        model = os.environ.get("FACECLAW_MODEL", "gpt-6-luna")
        runtime = resolve_runtime_provider(requested=os.environ.get("FACECLAW_PROVIDER", "openai-codex"), target_model=model)
        return AIAgent(
            api_key=runtime.get("api_key"), base_url=runtime.get("base_url"),
            provider=runtime.get("provider"), requested_provider=runtime.get("requested_provider"),
            api_mode=runtime.get("api_mode"), credential_pool=runtime.get("credential_pool"),
            model=model, enabled_toolsets=["hermes-cli", "faceclaw-phone"],
            quiet_mode=True, save_trajectories=False, max_iterations=12,
            session_id="faceclaw-" + str(uuid.uuid4()),
            skip_context_files=True, skip_background_review=True,
            ephemeral_system_prompt=STYLE,
            reasoning_config={"effort": os.environ.get("FACECLAW_CHAT_REASONING_EFFORT", "low")},
            run_budget_seconds=120, checkpoints_enabled=False, fallback_model=fallback_chain())

    async def warmup(self):
        self.loop = asyncio.get_running_loop()
        start = time.perf_counter()

        def initialize():
            with contextlib.redirect_stdout(io.StringIO()):
                return self.agent_factory()

        self.agent = await asyncio.to_thread(initialize)
        if self.conversation:
            try:
                await self.conversation.warmup()
            except Exception:
                LOG.warning('conversation unavailable; normal chat retained')
                await self.conversation.close()
                self.conversation = None
        LOG.info("ready %s", json.dumps({"initializationMs": round((time.perf_counter()-start)*1000),
                                        "model": getattr(self.agent, "model", None),
                                        "toolCount": len(getattr(self.agent, "tools", []) or [])}))

    def cancel(self, phone, turn_id=None):
        if self.conversation and turn_id is None:
            self.conversation.cancel(phone)
        for active in (self.active, self.running_state):
            if not active or active["phone"] is not phone or (turn_id is not None and active["turnId"] != turn_id):
                continue
            active["cancelled"].set()
            if active.get("running"):
                self.agent.interrupt(hard_cancel=True)

    async def handle(self, ws):
        phone = None
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=10)
            hello = json.loads(raw)
            if not isinstance(hello, dict):
                await ws.close(code=1008, reason="Invalid hello")
                return
            token = hello.get("token")
            if (hello.get("v") != 1 or hello.get("chan") != "ctl" or
                hello.get("type") != "hello" or not isinstance(token, str) or
                not hmac.compare_digest(token.encode(), self.token.encode())):
                await ws.close(code=1008, reason="Authentication failed")
                return
            if self.phone:
                previous = self.phone
                self.cancel(previous)
                previous.disconnect()
                await previous.ws.close(code=1000, reason="New authenticated connection")
            phone = Phone(ws)
            self.phone = phone
            await phone.send("ctl", type="hello-ack", serverName="faceclaw-hermes",
                             sessionKey="faceclaw:hermes",
                             capabilities=["chat", "mcp"] + (list(CAPABILITIES) if self.conversation else []))
            task = asyncio.create_task(self.initialize_phone(phone))
            self.tasks.add(task)
            task.add_done_callback(self.tasks.discard)
            LOG.info("phone connected")
            async for raw in ws:
                try:
                    frame = json.loads(raw)
                except (ValueError, TypeError):
                    continue
                if not isinstance(frame, dict) or frame.get("v") != 1:
                    continue
                if frame.get("chan") == "mcp" and isinstance(frame.get("msg"), dict):
                    phone.receive(frame["msg"])
                elif frame.get("chan") == "ctl" and frame.get("type") == "ping":
                    await phone.send("ctl", type="pong", ts=frame.get("ts"))
                elif frame.get("chan") == "chat":
                    if frame.get("type") == "cancel":
                        self.cancel(phone, frame.get("turnId"))
                    elif frame.get("type") == "utterance":
                        self.cancel(phone)
                        if self.conversation:
                            self.conversation.set_chat_active(phone, True)
                        state = {"phone": phone, "turnId": frame.get("turnId"),
                                 "cancelled": threading.Event(), "running": False}
                        self.active = state
                        task = asyncio.create_task(self.turn(phone, frame, state))
                        self.tasks.add(task)
                        task.add_done_callback(self.tasks.discard)
                elif frame.get("chan") == "conv" and self.conversation:
                    if frame.get("type") == "presented":
                        self.conversation.presented(phone, frame)
                    elif frame.get("type") == "cancel":
                        if isinstance(frame.get("requestId"), str) and valid_ref(frame.get("ref")):
                            self.conversation.cancel(phone, frame["requestId"], frame["ref"])
                    else:
                        self.conversation.submit(phone, frame)
        except Exception as exc:
            LOG.info("connection ended type=%s", type(exc).__name__)
        finally:
            if phone:
                self.cancel(phone)
                if self.conversation:
                    self.conversation.disconnect(phone)
                phone.disconnect()
                if self.phone is phone:
                    self.phone = None

    async def initialize_phone(self, phone):
        try:
            await phone.rpc("initialize", {"protocolVersion": "2024-11-05",
                "capabilities": {}, "clientInfo": {"name": "faceclaw-hermes", "version": "0.1"}})
            await phone.send("mcp", msg={"jsonrpc": "2.0", "method": "notifications/initialized"})
            result = await phone.rpc("tools/list")
            LOG.info("phone catalog tools=%d location=%s", len(result.get("tools", [])),
                     any(tool.get("name") == "location.get_current" for tool in result.get("tools", [])))
        except Exception as exc:
            LOG.info("phone catalog unavailable type=%s", type(exc).__name__)

    async def turn(self, phone, frame, state):
        turn_id, text = frame.get("turnId"), frame.get("text")
        if (not isinstance(turn_id, str) or not turn_id or len(turn_id) > 200 or
            not isinstance(text, str) or not text.strip() or len(text) > 32000):
            await phone.send("chat", type="turn-error", turnId=turn_id, message="Invalid utterance")
            if self.active is state:
                self.active = None
                if self.conversation:
                    self.conversation.set_chat_active(phone, False)
            return
        start = time.perf_counter()
        self.run_sequence += 1
        run_id = self.run_sequence
        first_ms = None
        sent_text = ""
        queue = asyncio.Queue()
        tool_count = 0
        outcome = "failed"
        metrics = {}

        def enqueue(kind, value):
            if not state["cancelled"].is_set():
                self.loop.call_soon_threadsafe(queue.put_nowait, (kind, value))

        def worker():
            self.agent.stream_delta_callback = lambda delta: enqueue("text", delta) if isinstance(delta, str) and delta else None
            self.agent.tool_start_callback = lambda call_id, name, args: enqueue("tool", name if isinstance(name, str) else "tool")
            if state["cancelled"].is_set():
                return {}
            prompt = text.strip()
            ctx = frame.get("ctx")
            ctx_chars = 0
            if isinstance(ctx, dict):
                # Phone context is user-supplied data, never a system instruction.
                ctx_json = json.dumps(ctx, ensure_ascii=False)[:8000]
                ctx_chars = len(ctx_json)
                prompt += "\n\n[Phone context data]\n" + ctx_json
            history = self.history or []
            metrics.update(promptChars=len(prompt), ctxChars=ctx_chars, historyMessages=len(history),
                           historyChars=sum(len(json.dumps(m, ensure_ascii=False, default=str)) for m in history))
            before = {name: getattr(self.agent, name, 0) or 0 for name in USAGE_COUNTERS}
            agent_start = time.perf_counter()
            try:
                with contextlib.redirect_stdout(io.StringIO()):
                    return self.agent.run_conversation(prompt, conversation_history=self.history)
            finally:
                metrics["agentMs"] = round((time.perf_counter()-agent_start)*1000)
                for name in USAGE_COUNTERS:
                    metrics[name.removeprefix("session_")] = (getattr(self.agent, name, 0) or 0) - before[name]

        try:
            lock_start = time.perf_counter()
            async with self.lock:
                metrics["lockWaitMs"] = round((time.perf_counter()-lock_start)*1000)
                if state["cancelled"].is_set() or phone.closed:
                    outcome = "cancelled"
                    return
                self.agent.clear_interrupt()
                state["running"] = True
                self.running_state = state
                future = asyncio.create_task(asyncio.to_thread(worker))
                try:
                    while not future.done() or not queue.empty():
                        try:
                            kind, value = await asyncio.wait_for(queue.get(), timeout=0.05)
                        except asyncio.TimeoutError:
                            continue
                        if state["cancelled"].is_set() or phone.closed:
                            continue
                        if kind == "text":
                            if first_ms is None:
                                first_ms = round((time.perf_counter()-start)*1000)
                            sent_text += value
                            await phone.send("chat", type="text-delta", turnId=turn_id, text=value)
                        elif kind == "tool":
                            tool_count += 1
                            await phone.send("chat", type="tool-activity", turnId=turn_id, label=value)
                    result = await future
                except BaseException:
                    state["cancelled"].set()
                    self.agent.interrupt(hard_cancel=True)
                    # Retain exclusive ownership until the agent thread actually exits.
                    await asyncio.shield(future)
                    raise
                if state["cancelled"].is_set():
                    outcome = "cancelled"
                    if not phone.closed:
                        await phone.send("chat", type="turn-done", turnId=turn_id,
                                         stopReason="cancelled", text="")
                    return
                answer = (result.get("final_response") or "").strip()
                if result.get("failed") or result.get("partial"):
                    raise RuntimeError("Hermes did not complete the turn")
                self.history = result.get("messages")
                if answer and sent_text != answer:
                    if first_ms is None:
                        first_ms = round((time.perf_counter()-start)*1000)
                    await phone.send("chat", type="text-delta", turnId=turn_id,
                                     text=answer, replace=True)
                await phone.send("chat", type="turn-done", turnId=turn_id,
                                 stopReason="end_turn", text=answer)
                outcome = "completed"
        except Exception as exc:
            LOG.warning("turn failed run=%d type=%s", run_id, type(exc).__name__)
            if not phone.closed:
                await phone.send("chat", type="turn-error", turnId=turn_id,
                                 message="Hermes could not complete this request")
        finally:
            state["running"] = False
            if self.running_state is state:
                self.running_state = None
            if self.active is state:
                self.active = None
                if self.conversation:
                    self.conversation.set_chat_active(phone, False)
            LOG.info("timing %s", json.dumps({"run": run_id, "outcome": outcome,
                "firstTextMs": first_ms, "totalMs": round((time.perf_counter()-start)*1000),
                "toolCalls": tool_count, **metrics}))

    async def close(self):
        if self.phone:
            self.cancel(self.phone)
            await self.phone.ws.close()
        if self.tasks:
            await asyncio.gather(*self.tasks, return_exceptions=True)
        if self.conversation:
            await self.conversation.close()
        if self.agent:
            await asyncio.to_thread(self.agent.close)


async def main():
    private = Path(os.environ.get("FACECLAW_SECRET_FILE", "/home/dani/faceclaw-hermes-bridge/private.json"))
    token = json.loads(private.read_text())["token"]
    bridge = Bridge(token, conversation_factory=create_conversation_agent
                    if os.environ.get("FACECLAW_CONVERSATION") == "1" else None,
                    conversation_fallback_factory=create_conversation_fallback_agent
                    if os.environ.get("FACECLAW_CONVERSATION") == "1" else None)
    await bridge.warmup()
    try:
        async with serve(bridge.handle, os.environ.get("FACECLAW_BIND", "0.0.0.0"),
                         int(os.environ.get("FACECLAW_PORT", "8791")),
                         max_size=4*1024*1024, ping_interval=20, ping_timeout=30):
            LOG.info("listening port=%s", os.environ.get("FACECLAW_PORT", "8791"))
            await asyncio.Event().wait()
    finally:
        await bridge.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.WARNING, format="%(asctime)s %(name)s %(message)s")
    LOG.setLevel(logging.INFO)
    asyncio.run(main())
