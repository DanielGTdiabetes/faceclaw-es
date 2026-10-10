package com.faceclaw.app

import com.k2fsa.sherpa.onnx.OfflineRecognizer
import java.io.File
import java.security.MessageDigest

/**
 * Whisper model catalogue and decoder factory shared by [FaceclawLocalTranscriber] and the separate
 * benchmark app (evaluations/whisper-tensor/bench-android), so a benchmark measures exactly the
 * production files, hashes, sherpa configuration and decode call. No downloads, no substitution.
 */
internal object LocalWhisperModels {
    class Model(val id: String, val label: String, val kind: VoiceModelKind, val directoryName: String,
        val files: Map<String, String>)

    val SMALL = Model("whisper-small-es", "whisper-small", VoiceModelKind.WHISPER_SMALL, "sherpa-onnx-whisper-small-es-int8", mapOf(
        "small-encoder.int8.onnx" to "4cbe7b22fa9026b843b60a68640c747de05bafb1a11b57edc0e66c232d9f33a9",
        "small-decoder.int8.onnx" to "acad50b5c782696e91b55914cc5ab4f756f1532f76e22aa6fc615f39fb69a8ee",
        "small-tokens.txt" to "b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126",
    ))
    val BASE = Model("whisper-base-es", "whisper-base", VoiceModelKind.WHISPER, "sherpa-onnx-whisper-base-es-int8", mapOf(
        "base-encoder.int8.onnx" to "0b8fb1304b6109976038efff5ace81720e00386f3ff6b54ee8c75291ca0a1e11",
        "base-decoder.int8.onnx" to "9759d217388a01b3a4c7c15533201067b48ae819c4daafc8624e64b9409dc02d",
        "base-tokens.txt" to "b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126",
    ))
    val MEDIUM = Model("whisper-medium-es", "whisper-medium", VoiceModelKind.WHISPER_MEDIUM, "sherpa-onnx-whisper-medium-es-int8", mapOf(
        "medium-encoder.int8.onnx" to "1c54582b4d829de0089f6cb63bbbdb3bf7555398bacaf855fbecf1a84dfd193e",
        "medium-decoder.int8.onnx" to "595d00a338a365a7bfa0ca7f296cabc639583bef770ab6130df90f49a6412747",
        "medium-tokens.txt" to "b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126",
    ))

    fun byId(id: String): Model? = when (id) {
        BASE.id -> BASE
        SMALL.id -> SMALL
        MEDIUM.id -> MEDIUM
        else -> null
    }

    /** Verify already-downloaded weights before entering JNI. */
    fun verified(root: File, model: Model): Boolean {
        val directory = File(root, model.directoryName)
        for ((name, expected) in model.files) {
            val file = File(directory, name)
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

    /** Loads the recognizer for an already verified model. `language` comes from the accepted start. */
    fun load(root: File, model: Model, language: LocalTranscriptLanguage, performance: LocalWhisperPerformance): LocalTranscriptDecoder {
        val recognizer = OfflineRecognizer(AndroidSpeechEngines.recognizerConfig(
            File(root, model.directoryName), model.kind, if (language == LocalTranscriptLanguage.ES) "es" else "",
            performance.threads, performance.provider, performance.tailPaddingFrames))
        val vad = FaceclawSpeechVad()
        return object : LocalTranscriptDecoder {
            override val engine: String = model.label
            override val speechDetector: String = if (vad.available) "webrtc-mode1" else "unavailable"
            override val runtime: String = performance.wire + ";vad=" + if (vad.available) "webrtc-mode1" else "unavailable"
            override fun hasSpeech(samples: FloatArray): Boolean = vad.containsSpeech(samples)
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
}
