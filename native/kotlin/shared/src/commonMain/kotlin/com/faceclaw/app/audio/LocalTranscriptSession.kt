package com.faceclaw.app

data class LocalDecodedText(val text: String, val language: String)
interface LocalTranscriptDecoder {
    fun decode(samples: FloatArray): LocalDecodedText
    fun release()
}
interface LocalTranscriptHost {
    val dispatcher: CallbackDispatcher
    fun loadDecoder(): LocalTranscriptDecoder?
}
interface FaceclawLocalTranscriptListener {
    fun onText(text: String, language: String)
}

enum class LocalTextRejection { NONE, LANGUAGE, EMPTY, STRUCTURE }

/** No semantic confidence is exposed by this runtime. These are structural abstentions only. */
fun localTextRejection(result: LocalDecodedText): LocalTextRejection {
    val text = result.text.trim()
    if (result.language != "es" && result.language != "ca") return LocalTextRejection.LANGUAGE
    if (text.isEmpty()) return LocalTextRejection.EMPTY
    if (text.length > 600 || !text.any { it.isLetter() }) return LocalTextRejection.STRUCTURE
    if (text.contains("<|") || text.startsWith("[") || text.startsWith("(")) return LocalTextRejection.STRUCTURE
    if (text.any { it.isISOControl() && it != '\n' && it != '\t' }) return LocalTextRejection.STRUCTURE
    return LocalTextRejection.NONE
}
fun acceptedLocalText(result: LocalDecodedText): String =
    if (localTextRejection(result) == LocalTextRejection.NONE) result.text.trim() else ""

/** Segments the existing provisional VAD. Copies PCM only into bounded, erasable RAM. */
class LocalTranscriptBuffer(
    private val segmentInfo: (Int) -> Unit = {},
    private val submit: (ShortArray) -> Unit,
) {
    companion object {
        const val MAX_SAMPLES = 16000 * 8
        const val PRE_SAMPLES = 16000 / 5
        const val MIN_VOICED_SAMPLES = 16000 * 3 / 10
    }
    private val samples = ShortArray(MAX_SAMPLES)
    private val pre = ShortArray(PRE_SAMPLES)
    private var preCount = 0
    private var preWrite = 0
    private var count = 0
    private var voiced = 0
    private var active = false
    private var silenceClosures = 0
    private var limitClosures = 0
    private var shortSegments = 0
    private var interruptedSegments = 0
    private var interruptedSamples = 0L
    private var submittedSamples = 0L
    fun bufferedBytes(): Int = (count + preCount) * 2

    fun reset() {
        if (active && count > 0) { interruptedSegments++; interruptedSamples += count }
        clearAudio()
    }

    fun resetMetrics() {
        clearAudio()
        silenceClosures = 0; limitClosures = 0; shortSegments = 0
        interruptedSegments = 0; interruptedSamples = 0; submittedSamples = 0
    }

    /** Duration is PCM sample time, not wall time or confirmed speech. */
    fun diagnostics(): String = "\"silenceClosures\":$silenceClosures,\"limitClosures\":$limitClosures," +
        "\"shortSegments\":$shortSegments,\"interruptedSegments\":$interruptedSegments," +
        "\"interruptedAudioMs\":${interruptedSamples / 16},\"submittedAudioMs\":${submittedSamples / 16}"

    private fun clearAudio() {
        samples.fill(0); pre.fill(0)
        count = 0; voiced = 0; preCount = 0; preWrite = 0; active = false
    }

    fun accept(pcm: ByteArray, state: String) {
        if (pcm.size != 1600) { reset(); return }
        if (state != "posible voz" && state != "pausa" && state != "sin actividad" && state != "candidato") {
            reset(); return
        }
        if (!active && state == "posible voz") {
            val start = (preWrite - preCount + PRE_SAMPLES) % PRE_SAMPLES
            repeat(preCount) { samples[count++] = pre[(start + it) % PRE_SAMPLES] }
            pre.fill(0); preCount = 0; preWrite = 0; active = true
        }
        for (i in 0 until 800) {
            val value = ((pcm[i * 2].toInt() and 255) or (pcm[i * 2 + 1].toInt() shl 8)).toShort()
            if (active) samples[count++] = value
            else {
                pre[preWrite] = value
                preWrite = (preWrite + 1) % PRE_SAMPLES
                preCount = minOf(PRE_SAMPLES, preCount + 1)
            }
            if (active && state == "posible voz") voiced++
            if (count == MAX_SAMPLES) finish(atLimit = true)
        }
        if (active && state == "sin actividad") finish(atLimit = false)
    }

    private fun finish(atLimit: Boolean) {
        if (atLimit) limitClosures++ else silenceClosures++
        val audio = if (voiced >= MIN_VOICED_SAMPLES) samples.copyOf(count) else null
        val voicedSamples = voiced
        if (audio == null) shortSegments++ else submittedSamples += count
        // Erase before handing a completed segment to an asynchronous consumer.
        clearAudio()
        if (audio != null) { segmentInfo(voicedSamples); submit(audio) }
    }
}

/** One worker, at most one pending/in-flight segment; never queues utterances behind decoding. */
class LocalTranscriptSession(
    private val host: LocalTranscriptHost,
    private val platform: ProtocolPlatform = protocolPlatform(),
) {
    private data class Job(val generation: Long, val audio: ShortArray)
    private data class Result(val generation: Long, val text: String, val language: String)
    private val condition = platform.createCondition()
    private var running = false
    private var worker = false
    private var ready = false
    private var generation = 0L
    private var deadline = 0L
    private var status = "inactivo"
    private var job: Job? = null
    private var busy = false
    private var activeInputBytes = 0
    private var result: Result? = null
    private var accepted = 0
    private var abstentions = 0
    private var dropped = 0
    private var pcmChunks = 0
    private var loadingChunks = 0
    private var decodeCalls = 0
    private var decodedSamples = 0L
    private var decodeTotalMs = 0L
    private var decodeMaxMs = 0L
    private var rejectedLanguage = 0
    private var rejectedEmpty = 0
    private var rejectedStructure = 0
    private var decodeErrors = 0
    private var processingErrors = 0
    private var invalidatedDecodes = 0
    private var languageEs = 0
    private var languageCa = 0
    private var languageOther = 0
    private var delivered = 0
    private var listener: FaceclawLocalTranscriptListener? = null
    private val buffer = LocalTranscriptBuffer { audio ->
        // Called under condition by acceptPcm; do not acquire its non-reentrant lock again.
        if (!running || !ready || busy) { audio.fill(0); dropped++ }
        else { job = Job(generation, audio); busy = true; condition.signalAll() }
    }

    fun setListener(value: FaceclawLocalTranscriptListener?) { condition.withLock { listener = value } }
    fun start(): Boolean {
        condition.withLock {
            if (worker) return false // A non-interruptible previous JNI call must drain first.
            running = true; worker = true; ready = false; generation++
            deadline = platform.elapsedRealtimeMs() + 120000
            accepted = 0; abstentions = 0; dropped = 0; status = "cargando"
            buffer.resetMetrics()
            pcmChunks = 0; loadingChunks = 0; decodeCalls = 0; decodedSamples = 0
            decodeTotalMs = 0; decodeMaxMs = 0; rejectedLanguage = 0; rejectedEmpty = 0
            rejectedStructure = 0; decodeErrors = 0; processingErrors = 0; invalidatedDecodes = 0
            languageEs = 0; languageCa = 0; languageOther = 0; delivered = 0
        }
        startThread("FaceclawLocalTranscript", true) { runWorker() }
        return true
    }

    fun resetStream() {
        condition.withLock {
            generation++; buffer.reset(); result = null
            job?.audio?.fill(0); job = null
            if (activeInputBytes == 0) busy = false
            condition.signalAll()
        }
    }

    /** Non-blocking. In-flight JNI decoding is invalidated and releases its stream on return. */
    fun stop() {
        condition.withLock {
            running = false; ready = false; generation++; buffer.reset(); result = null
            job?.audio?.fill(0); job = null
            if (activeInputBytes == 0) busy = false
            status = "inactivo"; condition.signalAll()
        }
    }

    fun acceptPcm(pcm: ByteArray?, vadState: String) {
        condition.withLock {
            if (running && pcm != null && platform.elapsedRealtimeMs() < deadline) {
                if (pcm.size == 1600) { pcmChunks++; if (!ready) loadingChunks++ }
                if (ready) buffer.accept(pcm, vadState)
            }
        }
    }

    /** Scalar diagnostics only: no text/audio/model path in this snapshot. */
    fun diagnostics(): String = condition.withLock {
        "{\"status\":\"$status\",\"worker\":$worker,\"busy\":$busy," +
            "\"inputBufferedBytes\":${buffer.bufferedBytes() + (job?.audio?.size ?: 0) * 2 + activeInputBytes}," +
            "\"accepted\":$accepted,\"abstentions\":$abstentions,\"dropped\":$dropped," +
            "\"analysis\":{\"pcmAudioMs\":${pcmChunks * 50L},\"loadingAudioMs\":${loadingChunks * 50L}," +
            buffer.diagnostics() + ",\"decodeCalls\":$decodeCalls,\"decodedAudioMs\":${decodedSamples / 16}," +
            "\"decodeTotalMs\":$decodeTotalMs,\"decodeMaxMs\":$decodeMaxMs," +
            "\"rejectedLanguage\":$rejectedLanguage,\"rejectedEmpty\":$rejectedEmpty," +
            "\"rejectedStructure\":$rejectedStructure,\"decodeErrors\":$decodeErrors," +
            "\"processingErrors\":$processingErrors," +
            "\"invalidatedDecodes\":$invalidatedDecodes,\"languageEs\":$languageEs," +
            "\"languageCa\":$languageCa,\"languageOther\":$languageOther,\"delivered\":$delivered}}"
    }

    private fun nextJob(): Job? = condition.withLock {
        while (running && job == null && platform.elapsedRealtimeMs() < deadline) condition.awaitMs(250)
        if (platform.elapsedRealtimeMs() >= deadline) {
            running = false; ready = false; status = "inactivo"
            buffer.reset(); result = null; job?.audio?.fill(0)
        }
        val next = if (running) job else null
        job = null
        if (next != null) activeInputBytes = next.audio.size * 6 // PCM16 + float input until erased.
        next
    }

    private fun runWorker() {
        var decoder: LocalTranscriptDecoder? = null
        try {
            decoder = host.loadDecoder()
            condition.withLock {
                if (running) {
                    ready = decoder != null
                    status = if (ready) "listo" else "modelo no disponible"
                    if (!ready) running = false
                }
            }
            while (true) {
                val next = nextJob() ?: break
                val floats = FloatArray(next.audio.size) { next.audio[it] / 32768f }
                next.audio.fill(0)
                var decodeStarted: Long? = null
                var decodeFailed = false
                try {
                    val canDecode = condition.withLock { running && generation == next.generation && platform.elapsedRealtimeMs() < deadline }
                    if (canDecode) {
                        decodeStarted = platform.elapsedRealtimeMs()
                        condition.withLock { decodeCalls++; decodedSamples += floats.size }
                    }
                    val decoded = if (canDecode) try {
                        decoder?.decode(floats)
                    } catch (failure: Throwable) {
                        decodeFailed = true
                        throw failure
                    } finally {
                        val elapsed = maxOf(0L, platform.elapsedRealtimeMs() - decodeStarted!!)
                        condition.withLock { decodeTotalMs += elapsed; decodeMaxMs = maxOf(decodeMaxMs, elapsed) }
                    } else null
                    val text = if (decoded != null) acceptedLocalText(decoded) else ""
                    val post = condition.withLock {
                        if (!running || generation != next.generation || platform.elapsedRealtimeMs() >= deadline) {
                            if (canDecode) invalidatedDecodes++
                            false
                        } else {
                            when (decoded?.language) { "es" -> languageEs++; "ca" -> languageCa++; else -> languageOther++ }
                            when (decoded?.let { localTextRejection(it) }) {
                                LocalTextRejection.LANGUAGE -> rejectedLanguage++
                                LocalTextRejection.EMPTY -> rejectedEmpty++
                                LocalTextRejection.STRUCTURE -> rejectedStructure++
                                else -> Unit
                            }
                            if (text.isEmpty()) { abstentions++; false }
                            else {
                                accepted++
                                result = Result(next.generation, text, decoded!!.language)
                                true
                            }
                        }
                    }
                    if (post) publish(next.generation)
                } catch (_: Throwable) {
                    condition.withLock {
                        if (running && generation == next.generation && platform.elapsedRealtimeMs() < deadline) {
                            abstentions++
                            if (decodeFailed) decodeErrors++ else processingErrors++
                        } else if (decodeStarted != null) invalidatedDecodes++
                    }
                    // No error popup, transcript dump or fallback recognizer.
                } finally {
                    floats.fill(0f); next.audio.fill(0)
                    condition.withLock { activeInputBytes = 0; busy = false }
                }
            }
        } catch (_: Throwable) {
            condition.withLock { if (running) status = "error"; running = false }
        } finally {
            try { decoder?.release() } catch (_: Throwable) { /* no content in diagnostics */ }
            condition.withLock {
                buffer.reset(); job?.audio?.fill(0); job = null; result = null
                activeInputBytes = 0; busy = false; ready = false; running = false; worker = false
            }
        }
    }

    private fun publish(token: Long) {
        host.dispatcher.post {
            val delivery = condition.withLock {
                val current = result
                if (running && generation == token && current?.generation == token && platform.elapsedRealtimeMs() < deadline) {
                    if (listener != null) delivered++
                    result = null; Pair(listener, current)
                } else null
            }
            delivery?.first?.onText(delivery.second.text, delivery.second.language)
        }
    }
}
