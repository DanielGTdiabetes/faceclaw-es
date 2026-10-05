"""Prepare an isolated candidate from the inspected installed bridge; never deploys it."""
from pathlib import Path
import hashlib
import sys

EXPECTED = "c6fcbf814aa9afaed8878d62b07747c4790b48164133f741512e03252400a705"
# conv/2: capabilities come from conversation.CAPABILITIES (conv/1 + conv/2) instead of a literal.
CONVERSATION_IMPORT = "from conversation import CAPABILITIES, ConversationService, create_conversation_agent, valid_ref"
CAPABILITY_EXPRESSION = "(list(CAPABILITIES) if self.conversation else [])"


def prepare(source, target):
    raw = Path(source).read_bytes()
    if hashlib.sha256(raw).hexdigest() != EXPECTED:
        raise ValueError("Bridge source differs from inspected version; review before adapting")
    text = raw.decode("utf-8")

    def replace(old, new):
        nonlocal text
        if text.count(old) != 1:
            raise ValueError("Expected unique bridge integration point")
        text = text.replace(old, new)

    replace("from websockets.asyncio.server import serve",
            "from websockets.asyncio.server import serve\n" + CONVERSATION_IMPORT)
    replace("def __init__(self, token, agent_factory=None):",
            "def __init__(self, token, agent_factory=None, conversation_factory=None):")
    replace("        self.run_sequence = 0\n        self.running_state = None",
            "        self.run_sequence = 0\n        self.running_state = None\n"
            "        self.conversation = ConversationService(conversation_factory) if conversation_factory else None")
    replace("        self.agent = await asyncio.to_thread(initialize)",
            "        self.agent = await asyncio.to_thread(initialize)\n"
            "        if self.conversation:\n"
            "            try:\n"
            "                await self.conversation.warmup()\n"
            "            except Exception:\n"
            "                LOG.warning('conversation unavailable; normal chat retained')\n"
            "                await self.conversation.close()\n"
            "                self.conversation = None")
    replace("    def cancel(self, phone, turn_id=None):\n",
            "    def cancel(self, phone, turn_id=None):\n"
            "        if self.conversation and turn_id is None:\n"
            "            self.conversation.cancel(phone)\n")
    replace('                             sessionKey="faceclaw:hermes")',
            '                             sessionKey="faceclaw:hermes",\n'
            '                             capabilities=["chat", "mcp"] + ' + CAPABILITY_EXPRESSION + ')')
    replace('                    elif frame.get("type") == "utterance":\n                        self.cancel(phone)',
            '                    elif frame.get("type") == "utterance":\n                        self.cancel(phone)\n'
            '                        if self.conversation:\n                            self.conversation.set_chat_active(phone, True)')
    replace('                        task.add_done_callback(self.tasks.discard)\n        except Exception as exc:',
            '                        task.add_done_callback(self.tasks.discard)\n'
            '                elif frame.get("chan") == "conv" and self.conversation:\n'
            '                    if frame.get("type") == "cancel":\n'
            '                        if isinstance(frame.get("requestId"), str) and valid_ref(frame.get("ref")):\n'
            '                            self.conversation.cancel(phone, frame["requestId"], frame["ref"])\n'
            '                    else:\n                        self.conversation.submit(phone, frame)\n'
            '        except Exception as exc:')
    replace('            if phone:\n                self.cancel(phone)\n                phone.disconnect()',
            '            if phone:\n                self.cancel(phone)\n'
            '                if self.conversation:\n                    self.conversation.disconnect(phone)\n'
            '                phone.disconnect()')
    replace('            await phone.send("chat", type="turn-error", turnId=turn_id, message="Invalid utterance")\n            return',
            '            await phone.send("chat", type="turn-error", turnId=turn_id, message="Invalid utterance")\n'
            '            if self.active is state:\n'
            '                self.active = None\n'
            '                if self.conversation:\n                    self.conversation.set_chat_active(phone, False)\n'
            '            return')
    replace('            if self.active is state:\n                self.active = None\n            LOG.info("timing',
            '            if self.active is state:\n                self.active = None\n'
            '                if self.conversation:\n                    self.conversation.set_chat_active(phone, False)\n'
            '            LOG.info("timing')
    replace('        if self.agent:\n            await asyncio.to_thread(self.agent.close)',
            '        if self.conversation:\n            await self.conversation.close()\n'
            '        if self.agent:\n            await asyncio.to_thread(self.agent.close)')
    replace('    bridge = Bridge(token)',
            '    bridge = Bridge(token, conversation_factory=create_conversation_agent\n'
            '                    if os.environ.get("FACECLAW_CONVERSATION") == "1" else None)')
    compile(text, "candidate_bridge.py", "exec")
    # Keep the reviewed Linux bytes on Windows too: deployment checks the exact SHA-256.
    Path(target).write_bytes(text.encode("utf-8"))


if __name__ == "__main__":
    prepare(sys.argv[1], sys.argv[2])
