package com.faceclaw.app

/** One pending PCM chunk, one dispatcher callback, no callback-owned audio copies. */
class BoundedPcmDelivery(
    private val dispatcher: CallbackDispatcher,
    private val platform: ProtocolPlatform,
    private val deliver: (ByteArray) -> Unit,
) {
    private val lock = platform.createLock()
    private var epoch = 0L
    private var pending: ByteArray? = null
    private var pendingAt = 0L
    private var scheduled = false
    private var active = true
    var dropped = 0L
        private set

    fun reset() = lock.withLock {
        epoch++
        pending?.fill(0)
        pending = null
        scheduled = false
        dropped = 0L
        active = true
    }

    fun clear() = lock.withLock {
        epoch++
        pending?.fill(0)
        pending = null
        scheduled = false
        active = false
    }

    fun offer(bytes: ByteArray) {
        var token = 0L
        lock.withLock {
            if (!active) { bytes.fill(0); return }
            if (pending != null) {
                dropped++
                pending?.fill(0)
            }
            pending = bytes
            pendingAt = platform.elapsedRealtimeMs()
            if (scheduled) return
            scheduled = true
            token = epoch
        }
        dispatcher.post {
                var value: ByteArray? = null
                lock.withLock delivery@ {
                    if (token != epoch) return@delivery
                    value = pending
                    pending = null
                    scheduled = false
                    if (platform.elapsedRealtimeMs() - pendingAt > 250) {
                        if (value != null) dropped++
                        value?.fill(0)
                        value = null
                    }
                }
                // Never invoke main/JS under the lock: a callback may STOP and
                // wait for the worker, which must be able to clear this delivery.
                value?.let { bytes ->
                    try { deliver(bytes) } finally { bytes.fill(0) }
                }
        }
    }
}
