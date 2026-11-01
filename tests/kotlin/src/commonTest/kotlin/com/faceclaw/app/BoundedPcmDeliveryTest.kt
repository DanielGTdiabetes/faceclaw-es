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
    fun slowDispatcherHasOnePendingChunkAndClearRevokesOldCallbacks() {
        val callbacks = mutableListOf<() -> Unit>()
        val received = mutableListOf<Int>()
        val clock = Clock(testPlatform())
        val delivery = BoundedPcmDelivery(CallbackDispatcher { callbacks.add(it) }, clock) { received.add(it[0].toInt()) }
        delivery.reset()
        for (i in 1..100) delivery.offer(ByteArray(1600) { i.toByte() })
        assertEquals(1, callbacks.size)
        assertEquals(99L, delivery.dropped)
        callbacks.removeAt(0)()
        assertEquals(listOf(100), received)
        val pending = ByteArray(1600) { 7 }
        delivery.offer(pending)
        delivery.clear()
        assertTrue(pending.all { it == 0.toByte() })
        delivery.reset()
        delivery.offer(ByteArray(1600) { 9 })
        callbacks.removeAt(0)() // Stale previous session callback.
        assertEquals(listOf(100), received)
        callbacks.removeAt(0)()
        assertEquals(listOf(100, 9), received)
    }

    @Test
    fun staleChunkIsDroppedAndItsAudioCleared() {
        val callbacks = mutableListOf<() -> Unit>()
        val clock = Clock(testPlatform())
        val delivery = BoundedPcmDelivery(CallbackDispatcher { callbacks.add(it) }, clock) { error("stale delivery") }
        val bytes = ByteArray(1600) { 12 }
        delivery.offer(bytes)
        clock.now += 251
        callbacks.removeAt(0)()
        assertEquals(1L, delivery.dropped)
        assertTrue(bytes.all { it == 0.toByte() })
    }
}
