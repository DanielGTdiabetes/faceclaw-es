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

/** No semantic confidence is exposed by this runtime. These are structural abstentions only. */
fun acceptedLocalText(result: LocalDecodedText): String {
    val text = result.text.trim()
    if (result.language != "es" && result.language != "ca") return ""
    if (text.isEmpty() || text.length > 600 || !text.any { it.isLetter() }) return ""
    if (text.contains("<|") || text.startsWith("[") || text.startsWith("(")) return ""
    if (text.any { it.isISOControl() && it != '\n' && it != '\t' }) return ""
    return text
}

/** Segments the existing provisional VAD. Copies PCM only into bounded, erasable RAM. */
class LocalTranscriptBuffer(private val submit: (ShortArray) -> Unit) {
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
    fun bufferedBytes(): Int = (count + preCount) * 2

    fun reset() {
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
            if (count == MAX_SAMPLES) finish()
        }
        if (active && state == "sin actividad") finish()
    }

    private fun finish() {
        val audio = if (voiced >= MIN_VOICED_SAMPLES) samples.copyOf(count) else null
        // Erase before handing a completed segment to an asynchronous consumer.
        reset()
        if (audio != null) submit(audio)
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
            if (running && ready && pcm != null && platform.elapsedRealtimeMs() < deadline) buffer.accept(pcm, vadState)
        }
    }

    /** Scalar diagnostics only: no text/audio/model path in this snapshot. */
    fun diagnostics(): String = condition.withLock {
        "{\"status\":\"$status\",\"worker\":$worker,\"busy\":$busy," +
            "\"inputBufferedBytes\":${buffer.bufferedBytes() + (job?.audio?.size ?: 0) * 2 + activeInputBytes}," +
            "\"accepted\":$accepted,\"abstentions\":$abstentions,\"dropped\":$dropped}"
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
                try {
                    val canDecode = condition.withLock { running && generation == next.generation && platform.elapsedRealtimeMs() < deadline }
                    val decoded = if (canDecode) decoder?.decode(floats) else null
                    val text = if (decoded != null) acceptedLocalText(decoded) else ""
                    val post = condition.withLock {
                        if (!running || generation != next.generation || platform.elapsedRealtimeMs() >= deadline) false
                        else if (text.isEmpty()) { abstentions++; false }
                        else {
                            accepted++
                            result = Result(next.generation, text, decoded!!.language)
                            true
                        }
                    }
                    if (post) publish(next.generation)
                } catch (_: Throwable) {
                    condition.withLock { if (running && generation == next.generation) abstentions++ }
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
                    result = null; Pair(listener, current)
                } else null
            }
            delivery?.first?.onText(delivery.second.text, delivery.second.language)
        }
    }
}
