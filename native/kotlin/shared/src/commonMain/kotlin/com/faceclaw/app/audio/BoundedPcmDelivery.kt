package com.faceclaw.app

/**
 * Bounded PCM hand-off to the dispatcher (main/JS) thread. Up to [capacity] chunks wait while that
 * thread is busy (a Hermes frame send blocks it ~300 ms), so a stall delays audio instead of losing
 * it. Each chunk carries its native capture time, which lets the consumer tell a late delivery from a
 * real capture gap. When the queue is full the oldest chunk is dropped and counted. One dispatcher
 * callback drains everything pending, in order; no callback-owned audio copies.
 */
class BoundedPcmDelivery(
    private val dispatcher: CallbackDispatcher,
    private val platform: ProtocolPlatform,
    private val capacity: Int = DEFAULT_CAPACITY,
    private val deliver: (ByteArray, Long) -> Unit,
) {
    companion object {
        /** 1 s of 50 ms chunks (32 KB): longer than the frame-send stalls measured on the Pixel. */
        const val DEFAULT_CAPACITY = 20
    }

    private class Chunk(val bytes: ByteArray, val captureMs: Long)

    private val lock = platform.createLock()
    private var epoch = 0L
    private val pending = ArrayDeque<Chunk>()
    private var scheduled = false
    private var active = true
    var dropped = 0L
        private set

    fun reset() = lock.withLock {
        epoch++
        zeroPending()
        scheduled = false
        dropped = 0L
        active = true
    }

    fun clear() = lock.withLock {
        epoch++
        zeroPending()
        scheduled = false
        active = false
    }

    fun offer(bytes: ByteArray) {
        var token = 0L
        lock.withLock {
            if (!active) { bytes.fill(0); return }
            if (pending.size >= capacity) {
                dropped++
                pending.removeFirst().bytes.fill(0)
            }
            pending.addLast(Chunk(bytes, platform.elapsedRealtimeMs()))
            if (scheduled) return
            scheduled = true
            token = epoch
        }
        dispatcher.post {
                var batch: List<Chunk> = emptyList()
                lock.withLock delivery@ {
                    if (token != epoch) return@delivery
                    batch = pending.toList()
                    pending.clear()
                    scheduled = false
                }
                // Never invoke main/JS under the lock: a callback may STOP and
                // wait for the worker, which must be able to clear this delivery.
                for (chunk in batch) {
                    try {
                        // A callback may STOP or restart capture: the rest of this batch is stale.
                        if (lock.withLock { token == epoch }) deliver(chunk.bytes, chunk.captureMs)
                    } finally {
                        chunk.bytes.fill(0)
                    }
                }
        }
    }

    private fun zeroPending() {
        for (chunk in pending) chunk.bytes.fill(0)
        pending.clear()
    }
}
