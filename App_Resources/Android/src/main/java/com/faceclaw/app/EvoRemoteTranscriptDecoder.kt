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
import org.json.JSONArray

/**
 * Conversation windows transcribed by the EVO-X2 ASR gateway (Parakeet) instead of on-phone Whisper.
 *
 * Same endpoint and protocol as the Hey Even "even" provider: binary PCM16 frames, `session.update` and
 * `input_audio_buffer.commit`, answered by one `...transcription.completed`. One short WebSocket per window,
 * so the gateway's single session is held only while a window decodes and Hey Even can still use it between
 * windows. Capture stays on the phone; raw audio and the compatible reference are identified on EVO.
 *
 * A busy gateway (HTTP 503) is retried once; any other failure throws, which the session counts as a decode
 * error for that window only. No local fallback and no audio retained after the call.
 */
class EvoRemoteTranscriptDecoder(
    private val url: String,
    private val key: String,
    private val language: LocalTranscriptLanguage,
    private val profile: FloatArray? = null,
) : LocalTranscriptDecoder {
    override val conditionAudio: Boolean get() = false
    override val engine: String get() = ENGINE
    override val runtime: String get() = "remote=evo-x2"

    override fun decode(samples: FloatArray): LocalDecodedText = decode(samples, null)

    override fun decode(samples: FloatArray, window: LocalWindowContext?): LocalDecodedText {
        val pcm = pcm16(samples)
        try {
            val decoded = try {
                transcribe(pcm, window)
            } catch (busy: GatewayBusy) {
                Thread.sleep(BUSY_RETRY_MS)
                transcribe(pcm, window)
            }
            // Parakeet detects the language itself and reports none: label it Spanish for the session filters.
            return decoded
        } finally {
            pcm.fill(0)
        }
    }

    override fun release() { profile?.fill(0f) }

    private class GatewayBusy : RuntimeException("EVO-X2 ASR busy")

    private fun transcribe(pcm: ByteArray, window: LocalWindowContext?): LocalDecodedText {
        val done = CountDownLatch(1)
        var transcript: String? = null
        var diarization = LocalDiarization(false, pcm.size / 2)
        var failure: RuntimeException? = null
        val request = Request.Builder().url(url).header("Authorization", "Bearer $key").build()
        val socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                // v3 adds the ephemeral window context so EVO can follow voices across the session.
                val session = JSONObject().put("sample_rate", 16000).put("language", language.wire)
                    .put("g2_diarization", if (window != null) 3 else 2)
                window?.let { w ->
                    session.put("g2_session", JSONObject().put("id", w.sessionId).put("seq", w.seq)
                        .put("start_ms", w.startMs).put("end_ms", w.endMs).put("voices", if (w.voices) "on" else "off"))
                    w.report?.let { report -> try { session.put("g2_feedback", JSONObject(report)) } catch (_: Throwable) {} }
                }
                profile?.let { vector ->
                    val values = JSONArray(); for (value in vector) values.put(value.toDouble())
                    session.put("g2_voice_profile", JSONObject().put("model_sha256",
                        "c46fad10b5f81e1aa4a60c162714208577093655076c5450f8c469e522ec54ef").put("vector", values))
                }
                webSocket.send(JSONObject().put("type", "session.update").put("session", session).toString())
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
                        diarization = parseDiarization(message.optJSONObject("g2_diarization"), pcm.size / 2, window != null)
                        val remote = message.optJSONObject("g2_diarization")
                        val stats = remote?.optJSONObject("diagnostic")
                        if (stats != null) {
                            val safe = JSONObject().put("server", true).put("profile", stats.optBoolean("profile"))
                            for (field in listOf("comparisons", "qualityRejected", "errors")) safe.put(field, stats.optInt(field))
                            for (field in listOf("similarityMin", "similarityMax")) {
                                val value = stats.optDouble(field); safe.put(field, if (value.isFinite()) value else JSONObject.NULL)
                            }
                            for (relation in listOf("portador", "otro", "desconocido")) safe.put(relation, diarization.intervals.count { it.relation == relation })
                            android.util.Log.i("FaceclawVoz", safe.toString())
                        }
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
        transcript?.let { return localDecodedText(it.trim().replace(Regex("\\s+"), " "), "es", language)
            .copy(diarization = diarization) }
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

        /** Invalid or unsupported metadata keeps all text unknown. Reference migration is authorized by the owner; never echoed or logged. */
        internal fun parseDiarization(value: JSONObject?, samples: Int, sessionRequested: Boolean = false): LocalDiarization {
            val unknown = LocalDiarization(false, samples)
            try {
                // v3 only when this window asked for it; an older gateway may still answer v2.
                val version = value?.optInt("v") ?: 0
                if (value == null || !(version == 2 || (version == 3 && sessionRequested)) || value.optString("status") != "ok" ||
                    value.optInt("samples", -1) != samples) return unknown
                val words = value.optJSONArray("words") ?: return unknown
                val intervals = value.optJSONArray("segments") ?: return unknown
                if (words.length() !in 1..256 || intervals.length() > 128) return unknown
                fun ms(row: JSONObject, key: String): Long {
                    val seconds = row.getDouble(key)
                    if (!seconds.isFinite() || seconds < 0 || seconds > samples / 16000.0 + .001)
                        throw IllegalArgumentException("Invalid interval")
                    return (seconds * 1000).toLong().coerceAtMost(samples / 16L)
                }
                val timed = (0 until words.length()).map { i ->
                    val row = words.getJSONObject(i)
                    LocalTimedWord(row.getString("word").trim(), ms(row, "start"), ms(row, "end"))
                }
                val spans = (0 until intervals.length()).map { i ->
                    val row = intervals.getJSONObject(i)
                    LocalVoiceInterval(row.getString("speaker"), ms(row, "start"), ms(row, "end"), row.optString("relation"),
                        if (version == 3 && !row.isNull("speaker_id")) row.optString("speaker_id") else null,
                        if (version == 3 && !row.isNull("state")) row.optString("state") else null)
                }
                return LocalDiarization(true, samples, timed, spans, identity = value.optBoolean("identity"))
            } catch (_: Throwable) { return unknown }
        }

        /** Same endpoint check as the TypeScript provider: a ws:// or wss:// URL. */
        fun validUrl(value: String?): String? {
            val url = value?.trim().orEmpty()
            return if (Regex("^wss?://[^\\s/]+(/\\S*)?$", RegexOption.IGNORE_CASE).matches(url)) url else null
        }

        /** Raw float window to PCM16 LE, clamped. */
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
