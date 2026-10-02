package com.faceclaw.app

/** Keeps one idle model for an open Chat window, never sharing an in-use recognizer. */
class VoiceTranscriberCache(
    private val load: (VoiceModelKind) -> OfflineTranscriber,
    platform: ProtocolPlatform = protocolPlatform(),
) {
    private val lock = platform.createLock()
    private var retain = false
    private var generation = 0L
    private var selectedKind: VoiceModelKind? = null
    private var cachedKind: VoiceModelKind? = null
    private var cached: OfflineTranscriber? = null

    fun setRetain(enabled: Boolean) {
        var dispose: OfflineTranscriber? = null
        lock.withLock {
            if (retain == enabled) return
            retain = enabled
            if (!enabled) {
                generation++
                dispose = cached
                cached = null
                cachedKind = null
            }
        }
        // A busy model is released by its lease once decoding finishes.
        dispose?.release()
    }

    fun acquire(kind: VoiceModelKind): OfflineTranscriber {
        var model: OfflineTranscriber? = null
        var dispose: OfflineTranscriber? = null
        var leaseGeneration = 0L
        lock.withLock {
            selectedKind = kind
            leaseGeneration = generation
            if (cachedKind == kind) model = cached else dispose = cached
            cached = null
            cachedKind = null
        }
        dispose?.release()
        // Model loading stays off the lock so closing Chat cannot block the UI.
        val leased = model ?: load(kind)
        return object : OfflineTranscriber {
            private var released = false
            override fun recognize(samples: FloatArray, count: Int): String = leased.recognize(samples, count)
            override fun release() {
                var keep = false
                lock.withLock {
                    if (released) return
                    released = true
                    if (retain && generation == leaseGeneration && selectedKind == kind && cached == null) {
                        cached = leased
                        cachedKind = kind
                        keep = true
                    }
                }
                if (!keep) leased.release()
            }
        }
    }
}
