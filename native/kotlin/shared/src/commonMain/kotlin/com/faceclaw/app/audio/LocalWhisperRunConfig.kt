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

        /**
         * Production values: four CPU threads for every model. Base moved from 1 to 4 after the Pixel
         * sustained replay (two 5 min blocks per setting, order 1/4/4/1: p95 1726/831/828/1388 ms,
         * identical hypotheses). Provider, padding and window policy stay at their defaults.
         */
        fun defaultFor(modelId: String): LocalWhisperPerformance? = when (modelId) {
            "whisper-base-es", "whisper-small-es", "whisper-medium-es" -> LocalWhisperPerformance(4)
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
 * - [PAUSE] closes a window at a pause instead of every hop, so one window usually holds one speaker
 *   and whole phrases: after [windowSamples] (2 s) a run of quiet VAD chunks closes it without carrying
 *   audio over. It keeps growing while the decoder is busy and is cut at [maxWindowSamples] (12 s),
 *   keeping [overlapSamples] (1 s) so a word cut by the limit is deduplicated like the reference.
 *   While nothing voiced has arrived only a short pre-roll is kept, and a window whose chunks were all
 *   quiet is not decoded. "Voiced" is VAD activity OR a chunk level above about -52 dBFS, so quiet far
 *   speech the energy VAD misses still reaches the decoder.
 */
data class LocalTranscriptWindowPolicy(val id: String, val windowSamples: Int, val hopSamples: Int, val maxWindowSamples: Int,
    val closesOnPause: Boolean = false) {
    val overlapSamples: Int get() = windowSamples - hopSamples
    val coalesces: Boolean get() = maxWindowSamples > windowSamples

    companion object {
        private const val CHUNK = 800
        /** sherpa-onnx truncates Whisper input at 30 s minus 50 frames; stay well below. */
        const val MAX_SAMPLES = 16000 * 28
        val REFERENCE = LocalTranscriptWindowPolicy("ref-6-3", 16000 * 6, 16000 * 3, 16000 * 6)
        val COALESCE = LocalTranscriptWindowPolicy("coalesce-6-3-max12", 16000 * 6, 16000 * 3, 16000 * 12)
        val PAUSE = LocalTranscriptWindowPolicy("pause-2-12", 16000 * 2, 16000, 16000 * 12, closesOnPause = true)
        val ALL = listOf(REFERENCE, COALESCE, PAUSE)

        fun byId(id: String?): LocalTranscriptWindowPolicy? = ALL.firstOrNull { it.id == id }

        fun isValid(policy: LocalTranscriptWindowPolicy): Boolean = with(policy) {
            listOf(windowSamples, hopSamples, maxWindowSamples).all { it > 0 && it % CHUNK == 0 } &&
                hopSamples < windowSamples && overlapSamples >= 16000 && windowSamples <= maxWindowSamples &&
                maxWindowSamples <= MAX_SAMPLES
        }
    }
}
