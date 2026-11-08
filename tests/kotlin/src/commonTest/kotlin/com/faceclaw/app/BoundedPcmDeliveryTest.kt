package com.faceclaw.app

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class BoundedPcmDeliveryTest {
    private class Clock(private val base: ProtocolPlatform) : ProtocolPlatform by base {
        var now = 1000L
        override fun elapsedRealtimeMs(): Long = now
    }

    @Test
    fun busyDispatcherDelaysChunksInOrderWithTheirCaptureTimeAndLosesNone() {
        val callbacks = mutableListOf<() -> Unit>()
        val received = mutableListOf<Pair<Int, Long>>()
        val clock = Clock(testPlatform())
        val delivery = BoundedPcmDelivery(CallbackDispatcher { callbacks.add(it) }, clock) { bytes, at ->
            received.add(bytes[0].toInt() to at)
        }
        delivery.reset()
        // The main thread is blocked ~300 ms by a frame send: 10 chunks wait behind one callback.
        for (i in 1..10) { delivery.offer(ByteArray(1600) { i.toByte() }); clock.now += 50 }
        assertEquals(1, callbacks.size)
        callbacks.removeAt(0)()
        assertEquals((1..10).map { it to 1000L + (it - 1) * 50L }, received)
        assertEquals(0L, delivery.dropped)
    }

    @Test
    fun fullQueueDropsTheOldestChunksAndZeroesThem() {
        val callbacks = mutableListOf<() -> Unit>()
        val received = mutableListOf<Int>()
        val delivery = BoundedPcmDelivery(CallbackDispatcher { callbacks.add(it) }, Clock(testPlatform())) { bytes, _ ->
            received.add(bytes[0].toInt())
        }
        delivery.reset()
        val chunks = (1..25).map { i -> ByteArray(1600) { i.toByte() } }
        chunks.forEach { delivery.offer(it) }
        assertEquals(5L, delivery.dropped)
        assertTrue(chunks.take(5).all { chunk -> chunk.all { it == 0.toByte() } })
        callbacks.removeAt(0)()
        assertEquals((6..25).toList(), received)
        assertTrue(chunks.all { chunk -> chunk.all { it == 0.toByte() } })
    }

    @Test
    fun clearRevokesOldCallbacksAndZeroesPendingAudio() {
        val callbacks = mutableListOf<() -> Unit>()
        val received = mutableListOf<Int>()
        val delivery = BoundedPcmDelivery(CallbackDispatcher { callbacks.add(it) }, Clock(testPlatform())) { bytes, _ ->
            received.add(bytes[0].toInt())
        }
        delivery.reset()
        val pending = ByteArray(1600) { 7 }
        delivery.offer(pending)
        delivery.clear()
        assertTrue(pending.all { it == 0.toByte() })
        delivery.offer(ByteArray(1600) { 8 }) // Inactive after clear: never delivered.
        delivery.reset()
        delivery.offer(ByteArray(1600) { 9 })
        callbacks.removeAt(0)() // Stale previous session callback.
        assertEquals(emptyList(), received)
        callbacks.removeAt(0)()
        assertEquals(listOf(9), received)
    }

    @Test
    fun stopDuringABatchDiscardsTheRestOfIt() {
        val callbacks = mutableListOf<() -> Unit>()
        val received = mutableListOf<Int>()
        lateinit var delivery: BoundedPcmDelivery
        delivery = BoundedPcmDelivery(CallbackDispatcher { callbacks.add(it) }, Clock(testPlatform())) { bytes, _ ->
            received.add(bytes[0].toInt())
            delivery.clear()
        }
        delivery.reset()
        val chunks = (1..3).map { i -> ByteArray(1600) { i.toByte() } }
        chunks.forEach { delivery.offer(it) }
        callbacks.removeAt(0)()
        assertEquals(listOf(1), received)
        assertTrue(chunks.all { chunk -> chunk.all { it == 0.toByte() } })
    }
}
