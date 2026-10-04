package com.faceclaw.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.k2fsa.sherpa.onnx.OfflineRecognizer
import java.io.File
import java.security.MessageDigest

/** Independent local-only Whisper route. No speaker model, storage, BLE or network client. */
class FaceclawLocalTranscriber(context: Context) {
    private val directory = File(context.applicationContext.filesDir,
        "faceclaw-voice-asr/sherpa-onnx-whisper-base-es-int8")
    private val handler = Handler(Looper.getMainLooper())
    private val session = LocalTranscriptSession(object : LocalTranscriptHost {
        override val dispatcher = CallbackDispatcher { action -> handler.post { action() } }
        /** `language` comes from the accepted start that owns this worker; it is never re-read later. */
        override fun loadDecoder(language: LocalTranscriptLanguage): LocalTranscriptDecoder? {
            val files = mapOf(
                "base-encoder.int8.onnx" to "0b8fb1304b6109976038efff5ace81720e00386f3ff6b54ee8c75291ca0a1e11",
                "base-decoder.int8.onnx" to "9759d217388a01b3a4c7c15533201067b48ae819c4daafc8624e64b9409dc02d",
                "base-tokens.txt" to "b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126",
            )
            // Verify the already-downloaded weights on the worker before entering JNI.
            for ((name, expected) in files) {
                val file = File(directory, name)
                if (!file.isFile) return null
                val digest = MessageDigest.getInstance("SHA-256")
                file.inputStream().use { input ->
                    val block = ByteArray(65536)
                    while (true) {
                        val count = input.read(block)
                        if (count < 0) break
                        digest.update(block, 0, count)
                    }
                    block.fill(0)
                }
                if (digest.digest().joinToString("") { "%02x".format(it) } != expected) return null
            }
            val recognizer = OfflineRecognizer(AndroidSpeechEngines.recognizerConfig(
                directory, VoiceModelKind.WHISPER, if (language == LocalTranscriptLanguage.ES) "es" else ""))
            return object : LocalTranscriptDecoder {
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
    })
    fun setListener(listener: FaceclawLocalTranscriptListener?) = session.setListener(listener)
    /** "es" forces Spanish for this session only; anything else keeps automatic detection. */
    fun start(language: String): Boolean = session.start(LocalTranscriptLanguage.fromWire(language), LocalTranscriptSegmentation.WINDOWS)
    fun setPhase(phase: Int) = session.setPhase(phase)
    fun stop() = session.stop()
    fun resetStream() = session.resetStream()
    fun acceptPcm(pcm: ByteArray?, vadState: String) = session.acceptPcm(pcm, vadState)
    fun diagnostics(): String = session.diagnostics()
}
