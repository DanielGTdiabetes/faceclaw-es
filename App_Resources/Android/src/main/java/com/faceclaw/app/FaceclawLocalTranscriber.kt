package com.faceclaw.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.k2fsa.sherpa.onnx.OfflineRecognizer
import java.io.File
import java.security.MessageDigest

/**
 * Independent local-only Whisper route. No speaker model, storage, BLE or network client.
 *
 * A3: prefers Whisper small int8 when its weights are already downloaded and verify; otherwise
 * falls back to Whisper base. Never downloads anything by itself. The ASR copy of each window is
 * level-conditioned (LocalAsrConditioner) before decoding; capture, VAD and profile are untouched.
 */
class FaceclawLocalTranscriber(context: Context) {
    private class Model(val label: String, val kind: VoiceModelKind, val directory: File,
        val threads: Int, val files: Map<String, String>)

    private val root = File(context.applicationContext.filesDir, "faceclaw-voice-asr")
    private val small = Model("whisper-small", VoiceModelKind.WHISPER_SMALL,
        File(root, "sherpa-onnx-whisper-small-es-int8"), 2, mapOf(
            "small-encoder.int8.onnx" to "4cbe7b22fa9026b843b60a68640c747de05bafb1a11b57edc0e66c232d9f33a9",
            "small-decoder.int8.onnx" to "acad50b5c782696e91b55914cc5ab4f756f1532f76e22aa6fc615f39fb69a8ee",
            "small-tokens.txt" to "b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126",
        ))
    private val base = Model("whisper-base", VoiceModelKind.WHISPER,
        File(root, "sherpa-onnx-whisper-base-es-int8"), 1, mapOf(
            "base-encoder.int8.onnx" to "0b8fb1304b6109976038efff5ace81720e00386f3ff6b54ee8c75291ca0a1e11",
            "base-decoder.int8.onnx" to "9759d217388a01b3a4c7c15533201067b48ae819c4daafc8624e64b9409dc02d",
            "base-tokens.txt" to "b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126",
        ))
    private val handler = Handler(Looper.getMainLooper())

    /** Verify already-downloaded weights on the worker before entering JNI. */
    private fun verified(model: Model): Boolean {
        for ((name, expected) in model.files) {
            val file = File(model.directory, name)
            if (!file.isFile) return false
            val digest = MessageDigest.getInstance("SHA-256")
            file.inputStream().use { input ->
                val block = ByteArray(1 shl 20)
                while (true) {
                    val count = input.read(block)
                    if (count < 0) break
                    digest.update(block, 0, count)
                }
                block.fill(0)
            }
            if (digest.digest().joinToString("") { "%02x".format(it) } != expected) return false
        }
        return true
    }

    private val session = LocalTranscriptSession(object : LocalTranscriptHost {
        override val dispatcher = CallbackDispatcher { action -> handler.post { action() } }
        /** `language` comes from the accepted start that owns this worker; it is never re-read later. */
        override fun loadDecoder(language: LocalTranscriptLanguage): LocalTranscriptDecoder? {
            val model = listOf(small, base).firstOrNull { verified(it) } ?: return null
            val recognizer = OfflineRecognizer(AndroidSpeechEngines.recognizerConfig(
                model.directory, model.kind, if (language == LocalTranscriptLanguage.ES) "es" else "", model.threads))
            return object : LocalTranscriptDecoder {
                override val engine: String = model.label
                override fun decode(samples: FloatArray): LocalDecodedText {
                    val stream = recognizer.createStream()
                    try {
                        stream.acceptWaveform(samples, 16000)
                        recognizer.decode(stream)
                        val result = recognizer.getResult(stream)
                        // Forced Spanish is labelled as forced, never as a detected language.
                        return localDecodedText(result.text, result.lang, language)
                    } finally { stream.release() }
                }
                override fun release() { recognizer.release() }
            }
        }
    }, conditionAudio = true)
    fun setListener(listener: FaceclawLocalTranscriptListener?) = session.setListener(listener)
    /** "es" forces Spanish for this session only; anything else keeps automatic detection. */
    fun start(language: String): Boolean = session.start(LocalTranscriptLanguage.fromWire(language), LocalTranscriptSegmentation.WINDOWS)
    fun setPhase(phase: Int) = session.setPhase(phase)
    fun stop() = session.stop()
    fun resetStream() = session.resetStream()
    fun acceptPcm(pcm: ByteArray?, vadState: String) = session.acceptPcm(pcm, vadState)
    fun diagnostics(): String = session.diagnostics()
}
