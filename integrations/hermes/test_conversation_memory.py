"""Memory receipts, cleanup and duplicate regressions; no provider or real device."""
import asyncio
import unittest
from unittest.mock import patch
import conversation
from conversation import ConversationService, valid_request
from test_conversation import Agent, Phone, request


class MemoryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.agent = Agent()
        self.phone = Phone()
        self.clock = 1000.0
        self.service = ConversationService(lambda: self.agent, now=lambda: self.clock)
        await self.service.warmup()
        self.sequence = 0

    async def asyncTearDown(self):
        await self.service.close()
        self.assertEqual(self.service.said, [])
        self.assertEqual(self.service.deliveries, {})
        self.assertIsNone(self.service.memory_timer)

    async def deliver(self, text="Synthetic idea", ack=True, phone=None):
        self.sequence += 1
        self.agent.response = {"kind": "mensaje", "text": text}
        target = phone or self.phone
        frame = {**request(str(self.sequence), "assist"), "memoryAck": ack}
        self.assertTrue(self.service.submit(target, frame))
        await asyncio.wait_for(self.service.task, 2)
        return target.frames[-1] if target.frames else None

    async def test_only_correlated_one_use_receipt_updates_memory(self):
        frame = await self.deliver()
        self.assertEqual(self.service.said, [])
        self.assertFalse(self.service.presented(Phone(), frame))
        self.assertFalse(self.service.presented(self.phone, {**frame, "requestId": "wrong"}))
        for key in frame["ref"]:
            value = "wrong" if key == "sessionId" else 999
            self.assertFalse(self.service.presented(self.phone, {**frame, "ref": {**frame["ref"], key: value}}))
        self.assertFalse(self.service.presented(self.phone, {**frame, "deliveryId": []}))
        self.assertTrue(self.service.presented(self.phone, frame))
        self.assertFalse(self.service.presented(self.phone, frame))
        self.assertEqual(self.service._recent_said(), ["Synthetic idea"])

    async def test_legacy_client_keeps_outputs_without_claiming_presentation(self):
        frame = await self.deliver(ack=False)
        self.assertEqual(frame["kind"], "mensaje")
        self.assertNotIn("deliveryId", frame)
        self.assertEqual(self.service.said, [])
        self.assertEqual(self.service.deliveries, {})

    async def test_duplicate_is_silent_but_different_factual_answer_is_delivered(self):
        frame = await self.deliver("El resultado es 2.5.")
        self.service.presented(self.phone, frame)
        duplicate = await self.deliver("  EL RESULTADO  ES 2.5.  ")
        self.assertEqual(duplicate["kind"], "nada")
        self.assertNotIn("text", duplicate)
        self.assertNotIn("deliveryId", duplicate)
        different = await self.deliver("El resultado es 25.")
        self.assertEqual(different["kind"], "mensaje")
        self.assertEqual(self.agent.calls[-1][0]["alreadySaid"], ["El resultado es 2.5."])

    async def test_unconfirmed_message_does_not_suppress_a_retry(self):
        first = await self.deliver()
        second = await self.deliver()
        self.assertEqual(second["kind"], "mensaje")
        self.assertEqual(self.agent.calls[-1][0]["alreadySaid"], [])
        # A later request must not remove a receipt for an output whose frame is still in flight.
        self.assertTrue(self.service.presented(self.phone, first))
        self.assertTrue(self.service.presented(self.phone, second))
        self.assertEqual(len(self.service.said), 1)

    async def test_cancel_disconnect_and_chat_revoke_unconfirmed_receipts(self):
        for action in ("cancel", "disconnect", "chat"):
            frame = await self.deliver()
            if action == "cancel":
                self.service.cancel(self.phone, frame["requestId"], frame["ref"])
            elif action == "disconnect":
                self.service.disconnect(self.phone)
            else:
                self.service.set_chat_active(self.phone, True)
            self.assertFalse(self.service.presented(self.phone, frame))
            self.service.set_chat_active(self.phone, False)
        self.assertEqual(self.service.said, [])

    async def test_delivery_expiry_bounds_unseen_output_retention(self):
        frame = await self.deliver()
        self.clock += conversation.DELIVERY_TTL
        self.assertFalse(self.service.presented(self.phone, frame))
        self.assertEqual(self.service.deliveries, {})
        self.assertIsNone(self.service.memory_timer)

    async def test_timer_physically_purges_expired_memory_without_new_requests(self):
        await self.service.close()
        self.service = ConversationService(lambda: self.agent)
        await self.service.warmup()
        with patch.object(conversation, "MEMORY_TTL", .04):
            frame = await self.deliver()
            self.service.presented(self.phone, frame)
            self.assertEqual(len(self.service.said), 1)
            await asyncio.sleep(.08)
            self.assertEqual(self.service.said, [])
            self.assertIsNone(self.service.memory_timer)

    async def test_timer_purges_unconfirmed_output_without_new_requests(self):
        await self.service.close()
        self.service = ConversationService(lambda: self.agent)
        await self.service.warmup()
        with patch.object(conversation, "DELIVERY_TTL", .04):
            await self.deliver()
            self.assertEqual(len(self.service.deliveries), 1)
            await asyncio.sleep(.08)
            self.assertEqual(self.service.deliveries, {})

    async def test_recent_confirmed_memory_and_pending_receipts_are_bounded(self):
        for i in range(10):
            frame = await self.deliver("Synthetic %d" % i)
            self.service.presented(self.phone, frame)
            self.clock += 1
        self.assertEqual(self.service._recent_said(), ["Synthetic %d" % i for i in range(4, 10)])
        for i in range(10):
            await self.deliver("Unconfirmed %d" % i)
        self.assertEqual(len(self.service.deliveries), 6)
        self.clock += conversation.MEMORY_TTL
        self.assertEqual(self.service._recent_said(), [])
        self.assertEqual(self.service.said, [])
        self.assertEqual(self.service.deliveries, {})

    async def test_failed_send_drops_receipt_and_never_updates_memory(self):
        class FailingPhone(Phone):
            async def send(self, channel, **fields):
                raise RuntimeError("Synthetic failure")
        await self.deliver(phone=FailingPhone())
        self.assertEqual(self.service.deliveries, {})
        self.assertEqual(self.service.said, [])

    async def test_memory_ack_flag_is_strictly_boolean(self):
        for value in (None, 1, "true", [], {}):
            self.assertFalse(valid_request({**request(), "memoryAck": value}))
        for value in (True, False):
            self.assertTrue(valid_request({**request(), "memoryAck": value}))
