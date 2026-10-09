package com.faceclaw.app

/**
 * Explicit Whisper runtime knobs, captured by one accepted start and handed to that worker as an
 * immutable value. Production keeps [defaultFor]; other values exist only for benchmarks/diagnostics
 * and are validated here so an unmeasured combination can never reach JNI by accident.
 *
 * - `threads`: sherpa-onnx intra/inter-op threads (1, 2, 4 or 6).
 * - `provider`: "cpu" (production) or "xnnpack". sherpa-onnx 1.13.0 silently falls back to CPU when an
 *   execution provider is unavailable, so a non-cpu value is a request, never proof of acceleration.
 * - `tailPaddingFrames`: 0 keeps the runtime default (1000 feature frames = 10 s of zero padding
 *   appended to every window). Values 100..1000 override it. Less padding shortens the encoder input
 *   but may stop Whisper from emitting end-of-text; it must be measured for accuracy, not assumed.
 */
data class LocalWhisperPerformance(val threads: Int, val provider: String = "cpu", val tailPaddingFrames: Int = 0) {
    companion object {
        val THREADS = listOf(1, 2, 4, 6)
        val PROVIDERS = listOf("cpu", "xnnpack")
        const val TAIL_MIN = 100
        const val TAIL_MAX = 1000

        /** Current production values: base keeps one thread, small and medium four. */
        fun defaultFor(modelId: String): LocalWhisperPerformance? = when (modelId) {
            "whisper-base-es" -> LocalWhisperPerformance(1)
            "whisper-small-es", "whisper-medium-es" -> LocalWhisperPerformance(4)
            else -> null
        }

        /** Null for anything outside the measured grid; never clamps silently. */
        fun validated(threads: Int, provider: String, tailPaddingFrames: Int): LocalWhisperPerformance? {
            if (threads !in THREADS || provider !in PROVIDERS) return null
            if (tailPaddingFrames != 0 && tailPaddingFrames !in TAIL_MIN..TAIL_MAX) return null
            return LocalWhisperPerformance(threads, provider, tailPaddingFrames)
        }
    }

    /** Diagnostics label: scalars only, never a path. */
    val wire: String get() =
        "threads=$threads;provider=$provider;tail=${if (tailPaddingFrames == 0) "default" else tailPaddingFrames.toString()}"
}

/**
 * Window policy for [LocalTranscriptSegmentation.WINDOWS]. All sizes are 16 kHz samples and multiples
 * of the 50 ms PCM chunk.
 *
 * - [REFERENCE] is the exact production policy: 6 s windows every 3 s; a window that closes while
 *   the decoder is busy is dropped (overlap means a single drop loses no audio).
 * - [COALESCE] is experimental: identical while the decoder keeps up. When a 6 s window closes while
 *   the decoder is busy it is not dropped; the same bounded buffer keeps growing and is submitted as one
 *   longer window as soon as the decoder is idle, up to [maxWindowSamples] (12 s). Only if the decoder is
 *   still busy at that ceiling is the window dropped, exactly like the reference. sherpa-onnx pads every
 *   window with a fixed tail, so one 9 s window costs much less than two overlapping 6 s windows; this
 *   trades extra latency under load for less repeated work and fewer lost windows. It adds no VAD/energy
 *   gate: every PCM sample still reaches a window regardless of level or speaker.
 */
data class LocalTranscriptWindowPolicy(val id: String, val windowSamples: Int, val hopSamples: Int, val maxWindowSamples: Int) {
    val overlapSamples: Int get() = windowSamples - hopSamples
    val coalesces: Boolean get() = maxWindowSamples > windowSamples

    companion object {
        private const val CHUNK = 800
        /** sherpa-onnx truncates Whisper input at 30 s minus 50 frames; stay well below. */
        const val MAX_SAMPLES = 16000 * 28
        val REFERENCE = LocalTranscriptWindowPolicy("ref-6-3", 16000 * 6, 16000 * 3, 16000 * 6)
        val COALESCE = LocalTranscriptWindowPolicy("coalesce-6-3-max12", 16000 * 6, 16000 * 3, 16000 * 12)
        val ALL = listOf(REFERENCE, COALESCE)

        fun byId(id: String?): LocalTranscriptWindowPolicy? = ALL.firstOrNull { it.id == id }

        fun isValid(policy: LocalTranscriptWindowPolicy): Boolean = with(policy) {
            listOf(windowSamples, hopSamples, maxWindowSamples).all { it > 0 && it % CHUNK == 0 } &&
                hopSamples < windowSamples && overlapSamples >= 16000 && windowSamples <= maxWindowSamples &&
                maxWindowSamples <= MAX_SAMPLES
        }
    }
}
