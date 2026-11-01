package com.faceclaw.app

/** Classic WebRTC VAD; conservative mode 1, at least 180 ms of voice per ASR window. */
internal class FaceclawSpeechVad {
    val available: Boolean = loaded
    init { if (!available) android.util.Log.w("FaceclawVAD", "WebRTC VAD unavailable; preserving audio for Whisper") }
    fun containsSpeech(samples: FloatArray): Boolean =
        if (available) containsSpeechNative(samples) else true
    private external fun containsSpeechNative(samples: FloatArray): Boolean
    companion object {
        private val loaded = try { System.loadLibrary("faceclaw_vad"); true } catch (_: UnsatisfiedLinkError) { false }
    }
}
