package com.faceclaw.app

/**
 * Whole-buffer transcription with the on-device model, for when a remote recognizer (the EVO-X2
 * service) failed after the utterance was already captured. Applies the same rules as the live
 * ONBOARD transcript in [VoiceCaptureSession]: segments of at most
 * [VoiceCaptureSession.TRANSCRIPT_SEGMENT_MAX_SAMPLES], cut at the quietest point near the limit,
 * Whisper's near-silence gate before normalization, peak normalization and the same text join.
 */
object BufferedTranscription {
    /** Longest utterance accepted for fallback decoding (the TS side caps its buffer the same). */
    const val MAX_SAMPLES = VoiceCaptureSession.SAMPLE_RATE * 30

    /** Decodes [pcm16le] (16 kHz mono S16LE); returns "" for silence or an empty buffer. */
    fun transcribe(pcm16le: ByteArray, isWhisper: Boolean, recognize: (FloatArray, Int) -> String): String {
        val all = AudioSegmentation.pcm16leToFloat(pcm16le, 0, minOf(pcm16le.size, MAX_SAMPLES * 2))
        var text = ""
        var start = 0
        while (start < all.size) {
            val remaining = all.size - start
            val length = if (remaining <= VoiceCaptureSession.TRANSCRIPT_SEGMENT_MAX_SAMPLES) {
                remaining
            } else {
                val window = all.copyOfRange(start, start + VoiceCaptureSession.TRANSCRIPT_SEGMENT_MAX_SAMPLES)
                AudioSegmentation.quietestCutPoint(
                    window, window.size,
                    VoiceCaptureSession.TRANSCRIPT_CUT_SEARCH_SAMPLES, VoiceCaptureSession.TRANSCRIPT_CUT_WINDOW_SAMPLES,
                ).coerceIn(1, window.size)
            }
            val segment = all.copyOfRange(start, start + length)
            start += length
            if (isWhisper && AudioSegmentation.peakAmplitude(segment) < VoiceCaptureSession.WHISPER_SILENCE_PEAK_THRESHOLD) {
                continue
            }
            AudioSegmentation.normalizePeak(
                segment, VoiceCaptureSession.TRANSCRIPT_NORMALIZE_TARGET_PEAK, VoiceCaptureSession.TRANSCRIPT_NORMALIZE_MAX_GAIN,
            )
            text = VoiceCaptureSession.joinTranscript(text, recognize(segment, segment.size).trim())
        }
        return text.trim()
    }
}
