package com.faceclaw.app

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString.Companion.toByteString
import org.json.JSONObject

/**
 * Conversation windows transcribed by the EVO-X2 ASR gateway (Parakeet) instead of on-phone Whisper.
 *
 * Same endpoint and protocol as the Hey Even "even" provider: binary PCM16 frames, `session.update` and
 * `input_audio_buffer.commit`, answered by one `...transcription.completed`. One short WebSocket per window,
 * so the gateway's single session is held only while a window decodes and Hey Even can still use it between
 * windows. Capture, pause windows, level conditioning and speaker attribution stay on the phone.
 *
 * A busy gateway (HTTP 503) is retried once; any other failure throws, which the session counts as a decode
 * error for that window only. No local fallback and no audio retained after the call.
 */
class EvoRemoteTranscriptDecoder(
    private val url: String,
    private val key: String,
    private val language: LocalTranscriptLanguage,
) : LocalTranscriptDecoder {
    override val engine: String get() = ENGINE
    override val runtime: String get() = "remote=evo-x2"

    override fun decode(samples: FloatArray): LocalDecodedText {
        val pcm = pcm16(samples)
        try {
            val text = try {
                transcribe(pcm)
            } catch (busy: GatewayBusy) {
                Thread.sleep(BUSY_RETRY_MS)
                transcribe(pcm)
            }
            // Parakeet detects the language itself and reports none: label it Spanish for the session filters.
            return localDecodedText(text, "es", language)
        } finally {
            pcm.fill(0)
        }
    }

    override fun release() = Unit

    private class GatewayBusy : RuntimeException("EVO-X2 ASR busy")

    private fun transcribe(pcm: ByteArray): String {
        val done = CountDownLatch(1)
        var transcript: String? = null
        var failure: RuntimeException? = null
        val request = Request.Builder().url(url).header("Authorization", "Bearer $key").build()
        val socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                webSocket.send(JSONObject().put("type", "session.update")
                    .put("session", JSONObject().put("sample_rate", 16000).put("language", language.wire)).toString())
                var offset = 0
                while (offset < pcm.size) {
                    val end = minOf(pcm.size, offset + CHUNK_BYTES)
                    webSocket.send(pcm.toByteString(offset, end - offset))
                    offset = end
                }
                webSocket.send("{\"type\":\"input_audio_buffer.commit\"}")
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val message = try { JSONObject(text) } catch (_: Throwable) { return }
                when (message.optString("type")) {
                    "conversation.item.input_audio_transcription.completed" -> {
                        transcript = message.optString("transcript", "")
                        done.countDown()
                    }
                    "error" -> {
                        failure = IllegalStateException("EVO-X2 ASR error")
                        done.countDown()
                    }
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                if (transcript == null) failure = IllegalStateException("EVO-X2 ASR closed $code")
                done.countDown()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                failure = if (response?.code == 503) GatewayBusy() else IllegalStateException("EVO-X2 ASR unreachable")
                done.countDown()
            }
        })
        val finished = done.await(DECODE_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        if (finished && transcript != null) socket.close(1000, "done") else socket.cancel()
        if (!finished) throw IllegalStateException("EVO-X2 ASR timeout")
        transcript?.let { return it.trim() }
        throw failure ?: IllegalStateException("EVO-X2 ASR without result")
    }

    companion object {
        const val ENGINE = "evo-parakeet"
        private const val CHUNK_BYTES = 64 * 1024
        private const val DECODE_TIMEOUT_MS = 10_000L
        private const val BUSY_RETRY_MS = 400L

        private val client: OkHttpClient by lazy {
            OkHttpClient.Builder()
                .connectTimeout(3, TimeUnit.SECONDS)
                .readTimeout(10, TimeUnit.SECONDS)
                .writeTimeout(5, TimeUnit.SECONDS)
                .addInterceptor(FaceclawHttp.userAgentInterceptor())
                .build()
        }

        /** Same endpoint check as the TypeScript provider: a ws:// or wss:// URL. */
        fun validUrl(value: String?): String? {
            val url = value?.trim().orEmpty()
            return if (Regex("^wss?://[^\\s/]+(/\\S*)?$", RegexOption.IGNORE_CASE).matches(url)) url else null
        }

        /** Conditioned float window to PCM16 LE, clamped. */
        fun pcm16(samples: FloatArray): ByteArray {
            val out = ByteArray(samples.size * 2)
            for (i in samples.indices) {
                val value = (samples[i].coerceIn(-1f, 1f) * 32767f).toInt()
                out[i * 2] = (value and 0xff).toByte()
                out[i * 2 + 1] = ((value shr 8) and 0xff).toByte()
            }
            return out
        }
    }
}
