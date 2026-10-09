package com.faceclaw.app

/** Language configuration captured by each accepted start. A rejected start never changes it. */
enum class LocalTranscriptLanguage(val wire: String) {
    AUTO("auto"), ES("es");
    companion object {
        fun fromWire(value: String?): LocalTranscriptLanguage = if (value == "es") ES else AUTO
    }
}

/** ASR can consume the whole stream; participation/enrollment retain their separate VAD buffer. */
enum class LocalTranscriptSegmentation(val wire: String) { VAD("vad"), WINDOWS("windows") }

/** `forced` marks a language imposed on the decoder: it is never a detected language or a confidence. */
data class LocalDecodedText(val text: String, val language: String, val forced: Boolean = false)
interface LocalTranscriptDecoder {
    fun decode(samples: FloatArray): LocalDecodedText
    fun release()
    /** Model label for diagnostics only (e.g. "whisper-small"); never a path. */
    val engine: String get() = "whisper"
    /** Runtime knobs for diagnostics only (e.g. "threads=4;provider=cpu;tail=default"); never a path. */
    val runtime: String get() = ""
}
interface LocalTranscriptHost {
    val dispatcher: CallbackDispatcher
    fun loadDecoder(language: LocalTranscriptLanguage): LocalTranscriptDecoder?
}
interface FaceclawLocalTranscriptListener {
    fun onText(text: String, language: String)
    /** Capture-window bounds, not word alignment. Default preserves existing consumers. */
    fun onSegment(text: String, language: String, startMs: Long, endMs: Long) = onText(text, language)
}

enum class LocalTextRejection { NONE, LANGUAGE, EMPTY, STRUCTURE, HALLUCINATION }

/** Forced Spanish: an empty or "es" engine label becomes forced Spanish; any other explicit label is kept. */
fun normalizeForcedLanguage(raw: String?): String {
    val value = raw?.trim().orEmpty()
    return if (value.isEmpty() || value == "es") "es" else value
}

/** Maps the engine result for the session language. Automatic mode keeps the engine label unchanged. */
fun localDecodedText(text: String, rawLanguage: String?, mode: LocalTranscriptLanguage): LocalDecodedText =
    if (mode == LocalTranscriptLanguage.ES) LocalDecodedText(text, normalizeForcedLanguage(rawLanguage), forced = true)
    else LocalDecodedText(text, rawLanguage ?: "")

/** No semantic confidence is exposed by this runtime. These are structural abstentions only. */
fun localTextRejection(result: LocalDecodedText): LocalTextRejection {
    val text = result.text.trim()
    if (result.forced) {
        // In forced Spanish, any other explicit label (including "ca") is a mismatch, never text.
        if (result.language != "es") return LocalTextRejection.LANGUAGE
    } else if (result.language != "es" && result.language != "ca") return LocalTextRejection.LANGUAGE
    if (text.isEmpty()) return LocalTextRejection.EMPTY
    if (text.length > 600 || !text.any { it.isLetter() }) return LocalTextRejection.STRUCTURE
    if (text.contains("<|") || text.startsWith("[") || text.startsWith("(")) return LocalTextRejection.STRUCTURE
    if (text.any { it.isISOControl() && it != '\n' && it != '\t' }) return LocalTextRejection.STRUCTURE
    if (isKnownWhisperHallucination(text)) return LocalTextRejection.HALLUCINATION
    return LocalTextRejection.NONE
}
fun acceptedLocalText(result: LocalDecodedText): String =
    if (localTextRejection(result) == LocalTextRejection.NONE) result.text.trim() else ""

/**
 * Remove the part of `current` that repeats the end of the adjacent previous window.
 * Exact prefix match of >=2 whole words first (unchanged behaviour). A4 adds a tolerant pass for
 * the 3 s overlap: up to 2 garbled leading words of `current` (word cut at the window start) and
 * up to 2 trailing words of `previous` (word cut at its end) may be skipped, but then at least 3
 * consecutive words must match. Never deletes a single isolated word; keeps everything if unsure.
 */
fun localWindowNovelText(previous: String, current: String): String {
    val words = Regex("\\S+")
    fun norm(value: String) = value.trim { c -> !c.isLetterOrDigit() }.lowercase()
    val before = words.findAll(previous).map { norm(it.value) }.toList()
    val after = words.findAll(current).toList()
    val afterNorm = after.map { norm(it.value) }
    var best: Int? = null
    var bestSize = 0
    for (skipEnd in 0..minOf(2, before.size)) {
        for (skipStart in 0..minOf(2, afterNorm.size)) {
            val minimum = if (skipEnd == 0 && skipStart == 0) 2 else 3
            val limit = minOf(12, before.size - skipEnd, afterNorm.size - skipStart)
            for (size in limit downTo minimum) {
                if (size <= bestSize) break
                val tail = before.subList(before.size - skipEnd - size, before.size - skipEnd)
                val head = afterNorm.subList(skipStart, skipStart + size)
                if (head.all { it.isNotEmpty() } && tail == head) { best = skipStart + size; bestSize = size; break }
            }
        }
    }
    val end = best ?: return current
    return if (end >= after.size) "" else current.substring(after[end - 1].range.last + 1).trimStart()
}

/**
 * Diagnostic phases are user marks, not speaker identification. Indices 0..4 are marks and 5 is a
 * segment whose samples (including pre-roll) came from more than one mark.
 */
object LocalTranscriptPhases {
    const val MARKED = 5
    const val MIXED = 5
    const val COUNT = 6
    val NAMES = arrayOf("sin-marcar", "otra-persona", "yo", "referencia", "fin", "mixta")
}

/** Segments the existing provisional VAD. Copies PCM only into bounded, erasable RAM. */
class LocalTranscriptBuffer(
    private val segmentInfo: (Int) -> Unit = {},
    private val segmentPhase: (Int) -> Unit = {},
    /** Consulted only by a coalescing window policy: false while the consumer is still busy. */
    private val canSubmit: () -> Boolean = { true },
    private val submit: (ShortArray) -> Unit,
) {
    companion object {
        const val MAX_SAMPLES = 16000 * 8
        const val PRE_SAMPLES = 16000 / 5
        const val MIN_VOICED_SAMPLES = 16000 * 3 / 10
        const val CHUNK_SAMPLES = 800
        const val WINDOW_SAMPLES = 16000 * 6
        /** A4: 3 s hop. Every second is heard by two windows, so one busy drop loses no audio. */
        const val OVERLAP_SAMPLES = 16000 * 3
    }
    private var samples = ShortArray(MAX_SAMPLES)
    private val pre = ShortArray(PRE_SAMPLES)
    private val prePhases = IntArray(PRE_SAMPLES / CHUNK_SAMPLES)
    private val segmentSamplesByPhase = LongArray(LocalTranscriptPhases.MARKED)
    private var preCount = 0
    private var preWrite = 0
    private var count = 0
    private var voiced = 0
    private var active = false
    private var segmentation = LocalTranscriptSegmentation.VAD
    private var policy = LocalTranscriptWindowPolicy.REFERENCE
    private var windowPhases = IntArray(WINDOW_SAMPLES / CHUNK_SAMPLES)
    private var constantWindows = 0
    private var deferredWindows = 0
    private var coalescedWindows = 0
    private var maxWindowSamples = 0
    private var silenceClosures = 0
    private var limitClosures = 0
    private var shortSegments = 0
    private var interruptedSegments = 0
    private var interruptedSamples = 0L
    private var submittedSamples = 0L
    private val phaseSilence = LongArray(LocalTranscriptPhases.COUNT)
    private val phaseLimit = LongArray(LocalTranscriptPhases.COUNT)
    private val phaseShort = LongArray(LocalTranscriptPhases.COUNT)
    private val phaseInterrupted = LongArray(LocalTranscriptPhases.COUNT)
    private val phaseInterruptedSamples = LongArray(LocalTranscriptPhases.COUNT)
    private val phaseSubmittedSamples = LongArray(LocalTranscriptPhases.COUNT)
    private val mixedSamplesByPhase = LongArray(LocalTranscriptPhases.MARKED)
    fun bufferedBytes(): Int = (count + preCount) * 2

    fun reset() {
        if (active && count > 0) {
            val phase = closePhase()
            interruptedSegments++; interruptedSamples += count
            phaseInterrupted[phase]++; phaseInterruptedSamples[phase] += count.toLong()
        }
        clearAudio()
    }

    fun resetMetrics(mode: LocalTranscriptSegmentation = LocalTranscriptSegmentation.VAD,
        windows: LocalTranscriptWindowPolicy = LocalTranscriptWindowPolicy.REFERENCE) {
        clearAudio()
        // Fixed capacity per start: never grows while audio arrives.
        val capacity = maxOf(MAX_SAMPLES, windows.maxWindowSamples)
        if (samples.size != capacity) samples = ShortArray(capacity)
        if (windowPhases.size != windows.maxWindowSamples / CHUNK_SAMPLES) windowPhases = IntArray(windows.maxWindowSamples / CHUNK_SAMPLES)
        segmentation = mode; policy = windows; constantWindows = 0
        deferredWindows = 0; coalescedWindows = 0; maxWindowSamples = 0
        silenceClosures = 0; limitClosures = 0; shortSegments = 0
        interruptedSegments = 0; interruptedSamples = 0; submittedSamples = 0
        for (array in listOf(phaseSilence, phaseLimit, phaseShort, phaseInterrupted,
            phaseInterruptedSamples, phaseSubmittedSamples, mixedSamplesByPhase)) array.fill(0)
    }

    /** Duration is PCM sample time, not wall time or confirmed speech. */
    fun diagnostics(): String = "\"silenceClosures\":$silenceClosures,\"limitClosures\":$limitClosures," +
        "\"shortSegments\":$shortSegments,\"interruptedSegments\":$interruptedSegments," +
        "\"interruptedAudioMs\":${interruptedSamples / 16},\"submittedAudioMs\":${submittedSamples / 16}," +
        "\"segmentation\":\"${segmentation.wire}\",\"constantWindows\":$constantWindows," +
        "\"windowPolicy\":\"${policy.id}\",\"deferredWindows\":$deferredWindows,\"coalescedWindows\":$coalescedWindows," +
        "\"maxWindowMs\":${maxWindowSamples / 16}"

    /** Same segment counters attributed to the origin phase of each segment. */
    fun phaseDiagnostics(phase: Int): String = "\"silenceClosures\":${phaseSilence[phase]}," +
        "\"limitClosures\":${phaseLimit[phase]},\"shortSegments\":${phaseShort[phase]}," +
        "\"interruptedSegments\":${phaseInterrupted[phase]}," +
        "\"interruptedAudioMs\":${phaseInterruptedSamples[phase] / 16}," +
        "\"submittedAudioMs\":${phaseSubmittedSamples[phase] / 16}"

    /** Audio of mixed segments (submitted, short or interrupted) split by the mark it arrived under. */
    fun mixedDiagnostics(): String =
        "\"mixedAudioMsByPhase\":[${mixedSamplesByPhase.joinToString(",") { (it / 16).toString() }}]"

    private fun clearAudio() {
        samples.fill(0); pre.fill(0); prePhases.fill(0); segmentSamplesByPhase.fill(0)
        windowPhases.fill(0)
        count = 0; voiced = 0; preCount = 0; preWrite = 0; active = false
    }

    private fun segmentPhaseOf(): Int {
        var found = -1
        for (index in 0 until LocalTranscriptPhases.MARKED) {
            if (segmentSamplesByPhase[index] > 0) {
                if (found >= 0) return LocalTranscriptPhases.MIXED
                found = index
            }
        }
        return if (found < 0) 0 else found
    }

    /** Origin of the segment being closed; mixed segments also record their split. */
    private fun closePhase(): Int {
        val phase = segmentPhaseOf()
        if (phase == LocalTranscriptPhases.MIXED) {
            for (index in 0 until LocalTranscriptPhases.MARKED) mixedSamplesByPhase[index] += segmentSamplesByPhase[index]
        }
        return phase
    }

    fun accept(pcm: ByteArray, state: String, phase: Int = 0) {
        if (pcm.size != 1600) { reset(); return }
        if (segmentation == LocalTranscriptSegmentation.WINDOWS) {
            acceptWindow(pcm, phase.coerceIn(0, LocalTranscriptPhases.MARKED - 1))
            return
        }
        if (state != "posible voz" && state != "pausa" && state != "sin actividad" && state != "candidato") {
            reset(); return
        }
        val origin = phase.coerceIn(0, LocalTranscriptPhases.MARKED - 1)
        if (!active && state == "posible voz") {
            val start = (preWrite - preCount + PRE_SAMPLES) % PRE_SAMPLES
            repeat(preCount) {
                val position = (start + it) % PRE_SAMPLES
                samples[count++] = pre[position]
                segmentSamplesByPhase[prePhases[position / CHUNK_SAMPLES]]++
            }
            pre.fill(0); prePhases.fill(0); preCount = 0; preWrite = 0; active = true
        }
        for (i in 0 until 800) {
            val value = ((pcm[i * 2].toInt() and 255) or (pcm[i * 2 + 1].toInt() shl 8)).toShort()
            if (active) { samples[count++] = value; segmentSamplesByPhase[origin]++ }
            else {
                pre[preWrite] = value
                prePhases[preWrite / CHUNK_SAMPLES] = origin
                preWrite = (preWrite + 1) % PRE_SAMPLES
                preCount = minOf(PRE_SAMPLES, preCount + 1)
            }
            if (active && state == "posible voz") voiced++
            if (count == MAX_SAMPLES) finish(atLimit = true)
        }
        if (active && state == "sin actividad") finish(atLimit = false)
    }

    /**
     * Every valid chunk reaches a window (six seconds in the reference policy), regardless of VAD or
     * speaker identity. The overlap protects words at boundaries. Only a perfectly constant signal
     * (digital silence/DC, including stuck saturation) is skipped: this is NOT a speech detector.
     * Noise can still hallucinate in Whisper. This text never supplies participation evidence.
     * A coalescing policy may keep growing the same bounded buffer while the consumer is busy.
     */
    private fun acceptWindow(pcm: ByteArray, origin: Int) {
        active = true
        windowPhases[count / CHUNK_SAMPLES] = origin
        repeat(CHUNK_SAMPLES) { i ->
            samples[count++] = ((pcm[i * 2].toInt() and 255) or (pcm[i * 2 + 1].toInt() shl 8)).toShort()
        }
        segmentSamplesByPhase[origin] += CHUNK_SAMPLES.toLong()
        if (count < policy.windowSamples) return
        if (policy.coalesces && count < policy.maxWindowSamples && !canSubmit()) {
            if (count == policy.windowSamples) deferredWindows++
            return
        }
        closeWindow()
    }

    private fun closeWindow() {
        val phase = closePhase()
        limitClosures++; phaseLimit[phase]++
        val varying = (1 until count).any { samples[it] != samples[0] }
        val audio = if (varying) samples.copyOf(count) else null
        if (audio == null) constantWindows++
        else {
            submittedSamples += count; phaseSubmittedSamples[phase] += count.toLong()
            if (count > policy.windowSamples) coalescedWindows++
            maxWindowSamples = maxOf(maxWindowSamples, count)
        }
        // Keep only the overlap; no second PCM queue or unbounded conversation history.
        val overlap = policy.overlapSamples
        val chunks = count / CHUNK_SAMPLES
        samples.copyInto(samples, 0, count - overlap, count)
        samples.fill(0, overlap)
        val overlapChunks = overlap / CHUNK_SAMPLES
        windowPhases.copyInto(windowPhases, 0, chunks - overlapChunks, chunks)
        windowPhases.fill(0, overlapChunks)
        segmentSamplesByPhase.fill(0)
        repeat(overlapChunks) { segmentSamplesByPhase[windowPhases[it]] += CHUNK_SAMPLES.toLong() }
        count = overlap
        if (audio != null) { segmentPhase(phase); submit(audio) }
    }

    private fun finish(atLimit: Boolean) {
        val phase = closePhase()
        if (atLimit) { limitClosures++; phaseLimit[phase]++ } else { silenceClosures++; phaseSilence[phase]++ }
        val audio = if (voiced >= MIN_VOICED_SAMPLES) samples.copyOf(count) else null
        val voicedSamples = voiced
        if (audio == null) { shortSegments++; phaseShort[phase]++ }
        else { submittedSamples += count; phaseSubmittedSamples[phase] += count.toLong() }
        // Erase before handing a completed segment to an asynchronous consumer.
        clearAudio()
        if (audio != null) { segmentInfo(voicedSamples); segmentPhase(phase); submit(audio) }
    }
}

/** One worker, at most one pending/in-flight segment; never queues utterances behind decoding. */
class LocalTranscriptSession(
    private val host: LocalTranscriptHost,
    private val platform: ProtocolPlatform = protocolPlatform(),
    /** A3: lift quiet speech in the ASR copy only. Off by default so fixtures see raw PCM. */
    private val conditionAudio: Boolean = false,
) {
    /** Per-phase scalar counters. They never hold text, audio or model paths. */
    private class LocalTranscriptPhaseStats {
        var pcmChunks = 0L; var loadingChunks = 0L; var dropped = 0L
        var decodeCalls = 0L; var decodedSamples = 0L; var decodeTotalMs = 0L; var decodeMaxMs = 0L
        var rejectedLanguage = 0L; var rejectedEmpty = 0L; var rejectedStructure = 0L; var rejectedHallucination = 0L
        var decodeErrors = 0L; var processingErrors = 0L; var invalidatedDecodes = 0L
        var languageEs = 0L; var languageCa = 0L; var languageOther = 0L; var languageForced = 0L; var forcedMismatch = 0L
        var accepted = 0L; var abstentions = 0L; var delivered = 0L; var deliveredChars = 0L; var deliveryDiscarded = 0L
    }
    private data class Job(val generation: Long, val audio: ShortArray, val phase: Int, val endChunk: Long, val closedAtMs: Long) {
        val startChunk: Long get() = endChunk - audio.size / LocalTranscriptBuffer.CHUNK_SAMPLES
    }
    private data class Result(val generation: Long, val text: String, val language: String, val phase: Int, val endChunk: Long,
        val sampleCount: Int, val closedAtMs: Long) {
        val startChunk: Long get() = endChunk - sampleCount / LocalTranscriptBuffer.CHUNK_SAMPLES
    }
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
    private var lastDelivered: Result? = null
    private var inputChunks = 0L
    private var windowed = false
    private var phase = 0
    private var pendingSegmentPhase = 0
    private var languageMode = LocalTranscriptLanguage.AUTO
    private var stats = Array(LocalTranscriptPhases.COUNT) { LocalTranscriptPhaseStats() }
    private var listener: FaceclawLocalTranscriptListener? = null
    private val levels = LocalAsrLevelStats()
    private var engine = ""
    private var runtime = ""
    /** Union of decoded capture windows, in PCM chunks: audio a dropped window loses only if no neighbour covered it. */
    private var coveredChunks = 0L
    private var coveredEndChunk = 0L
    /** Window close (PCM time) to listener delivery, wall clock. Decode + queue + dispatcher. */
    private var latencyCount = 0L
    private var latencyTotalMs = 0L
    private var latencyMaxMs = 0L
    /** Last decoded windows as (captureStartMs, captureEndMs, decodeMs) scalars; fixed size, never text/audio. */
    private val timings = LongArray(TIMING_SLOTS * 3)
    private var timingCount = 0L
    // Both lambdas are called under condition by acceptPcm; do not acquire its non-reentrant lock again.
    private val buffer = LocalTranscriptBuffer(segmentPhase = { pendingSegmentPhase = it },
        canSubmit = { running && ready && !busy }) { audio ->
        if (!running || !ready || busy) { audio.fill(0); stats[pendingSegmentPhase].dropped++ }
        else {
            job = Job(generation, audio, pendingSegmentPhase, inputChunks, platform.elapsedRealtimeMs())
            busy = true; condition.signalAll()
        }
    }

    companion object {
        const val TIMING_SLOTS = 256
    }

    fun setListener(value: FaceclawLocalTranscriptListener?) { condition.withLock { listener = value } }

    /**
     * Benchmark detail kept out of [diagnostics] (polled by the UI): the most recent decoded windows as
     * [captureStartMs, captureEndMs, decodeMs], oldest first. Capture times are PCM time since start.
     */
    fun decodeTimings(): String = condition.withLock {
        val count = minOf(timingCount, TIMING_SLOTS.toLong()).toInt()
        val first = timingCount - count
        (0 until count).joinToString(",", "{\"total\":$timingCount,\"windows\":[", "]}") {
            val slot = ((first + it) % TIMING_SLOTS).toInt() * 3
            "[${timings[slot]},${timings[slot + 1]},${timings[slot + 2]}]"
        }
    }
    fun isWorkerActive(): Boolean = condition.withLock { worker }

    /** The language is captured only by an accepted start and handed to that worker as an immutable value. */
    fun start(language: LocalTranscriptLanguage = LocalTranscriptLanguage.AUTO,
        segmentation: LocalTranscriptSegmentation = LocalTranscriptSegmentation.VAD, maxMs: Long = 120000,
        windows: LocalTranscriptWindowPolicy = LocalTranscriptWindowPolicy.REFERENCE): Boolean {
        if (!LocalTranscriptWindowPolicy.isValid(windows)) return false
        condition.withLock {
            if (worker) return false // A non-interruptible previous JNI call must drain first.
            running = true; worker = true; ready = false; generation++
            deadline = platform.elapsedRealtimeMs() + maxMs.coerceIn(1, 1200000)
            status = "cargando"; phase = 0; pendingSegmentPhase = 0; languageMode = language
            buffer.resetMetrics(segmentation, windows)
            coveredChunks = 0; coveredEndChunk = 0; latencyCount = 0; latencyTotalMs = 0; latencyMaxMs = 0
            timings.fill(0); timingCount = 0
            inputChunks = 0; windowed = segmentation == LocalTranscriptSegmentation.WINDOWS; lastDelivered = null
            stats = Array(LocalTranscriptPhases.COUNT) { LocalTranscriptPhaseStats() }
            levels.reset(); engine = ""; runtime = ""
        }
        val config = language
        startThread("FaceclawLocalTranscript", true) { runWorker(config) }
        return true
    }

    /** User mark for diagnostics. Applies to the next PCM chunk; invalid values are ignored. */
    fun setPhase(value: Int) {
        condition.withLock { if (value in 0 until LocalTranscriptPhases.MARKED) phase = value }
    }

    fun resetStream() {
        condition.withLock {
            generation++; buffer.reset(); discardPendingResult(); lastDelivered = null
            job?.audio?.fill(0); job = null
            if (activeInputBytes == 0) busy = false
            condition.signalAll()
        }
    }

    /** Non-blocking. In-flight JNI decoding is invalidated and releases its stream on return. */
    fun stop() {
        condition.withLock {
            running = false; ready = false; generation++; buffer.reset(); discardPendingResult(); lastDelivered = null
            job?.audio?.fill(0); job = null
            if (activeInputBytes == 0) busy = false
            status = "inactivo"; condition.signalAll()
        }
    }

    fun acceptPcm(pcm: ByteArray?, vadState: String) {
        condition.withLock {
            if (running && pcm != null && platform.elapsedRealtimeMs() < deadline) {
                if (pcm.size == 1600) { stats[phase].pcmChunks++; if (!ready) stats[phase].loadingChunks++ }
                if (ready) { if (pcm.size == 1600) inputChunks++; buffer.accept(pcm, vadState, phase) }
            }
        }
    }

    /** Single exit for a pending result that will not be delivered. Must run under condition. */
    private fun discardPendingResult() {
        result?.let { stats[it.phase].deliveryDiscarded++ }
        result = null
    }

    private fun sum(field: (LocalTranscriptPhaseStats) -> Long): Long = stats.sumOf(field)

    private fun phaseJson(index: Int): String {
        val s = stats[index]
        return "{\"phase\":\"${LocalTranscriptPhases.NAMES[index]}\",\"pcmAudioMs\":${s.pcmChunks * 50}," +
            "\"loadingAudioMs\":${s.loadingChunks * 50}," + buffer.phaseDiagnostics(index) +
            ",\"dropped\":${s.dropped},\"decodeCalls\":${s.decodeCalls},\"decodedAudioMs\":${s.decodedSamples / 16}," +
            "\"decodeTotalMs\":${s.decodeTotalMs},\"decodeMaxMs\":${s.decodeMaxMs}," +
            "\"rejectedLanguage\":${s.rejectedLanguage},\"rejectedEmpty\":${s.rejectedEmpty}," +
            "\"rejectedStructure\":${s.rejectedStructure},\"rejectedHallucination\":${s.rejectedHallucination},\"decodeErrors\":${s.decodeErrors}," +
            "\"processingErrors\":${s.processingErrors},\"invalidatedDecodes\":${s.invalidatedDecodes}," +
            "\"languageEs\":${s.languageEs},\"languageCa\":${s.languageCa},\"languageOther\":${s.languageOther}," +
            "\"languageForced\":${s.languageForced},\"forcedMismatch\":${s.forcedMismatch}," +
            "\"accepted\":${s.accepted},\"abstentions\":${s.abstentions},\"delivered\":${s.delivered}," +
            "\"deliveredChars\":${s.deliveredChars},\"deliveryDiscarded\":${s.deliveryDiscarded}}"
    }

    /** Scalar diagnostics only: no text/audio/model path in this snapshot. Totals first, phases last. */
    fun diagnostics(): String = condition.withLock {
        "{\"status\":\"$status\",\"worker\":$worker,\"busy\":$busy," +
            "\"inputBufferedBytes\":${buffer.bufferedBytes() + (job?.audio?.size ?: 0) * 2 + activeInputBytes}," +
            "\"accepted\":${sum { it.accepted }},\"abstentions\":${sum { it.abstentions }},\"dropped\":${sum { it.dropped }}," +
            "\"analysis\":{\"pcmAudioMs\":${sum { it.pcmChunks } * 50},\"loadingAudioMs\":${sum { it.loadingChunks } * 50}," +
            buffer.diagnostics() + ",\"decodeCalls\":${sum { it.decodeCalls }},\"decodedAudioMs\":${sum { it.decodedSamples } / 16}," +
            "\"decodeTotalMs\":${sum { it.decodeTotalMs }},\"decodeMaxMs\":${stats.maxOf { it.decodeMaxMs }}," +
            "\"rejectedLanguage\":${sum { it.rejectedLanguage }},\"rejectedEmpty\":${sum { it.rejectedEmpty }}," +
            "\"rejectedStructure\":${sum { it.rejectedStructure }},\"rejectedHallucination\":${sum { it.rejectedHallucination }},\"decodeErrors\":${sum { it.decodeErrors }}," +
            "\"processingErrors\":${sum { it.processingErrors }}," +
            "\"invalidatedDecodes\":${sum { it.invalidatedDecodes }},\"languageEs\":${sum { it.languageEs }}," +
            "\"languageCa\":${sum { it.languageCa }},\"languageOther\":${sum { it.languageOther }},\"delivered\":${sum { it.delivered }}," +
            "\"languageForced\":${sum { it.languageForced }},\"forcedMismatch\":${sum { it.forcedMismatch }}," +
            "\"deliveredChars\":${sum { it.deliveredChars }},\"deliveryDiscarded\":${sum { it.deliveryDiscarded }}," +
            "\"languageMode\":\"${languageMode.wire}\",\"engine\":\"$engine\",\"conditioned\":$conditionAudio," +
            "\"runtime\":\"$runtime\",\"windowedAudioMs\":${inputChunks * 50},\"coveredAudioMs\":${coveredChunks * 50}," +
            "\"deliveryLatencyCount\":$latencyCount,\"deliveryLatencyTotalMs\":$latencyTotalMs,\"deliveryLatencyMaxMs\":$latencyMaxMs," +
            levels.json() + "," + buffer.mixedDiagnostics() +
            ",\"phases\":[${(0 until LocalTranscriptPhases.COUNT).joinToString(",") { phaseJson(it) }}]}}"
    }

    private fun nextJob(): Job? = condition.withLock {
        while (running && job == null && platform.elapsedRealtimeMs() < deadline) condition.awaitMs(250)
        if (platform.elapsedRealtimeMs() >= deadline) {
            running = false; ready = false; status = "inactivo"
            buffer.reset(); discardPendingResult(); lastDelivered = null; job?.audio?.fill(0)
        }
        val next = if (running) job else null
        job = null
        if (next != null) activeInputBytes = next.audio.size * 6 // PCM16 + float input until erased.
        next
    }

    private fun runWorker(language: LocalTranscriptLanguage) {
        var decoder: LocalTranscriptDecoder? = null
        try {
            decoder = host.loadDecoder(language)
            condition.withLock {
                if (running) {
                    ready = decoder != null
                    engine = decoder?.engine ?: ""
                    runtime = decoder?.runtime ?: ""
                    status = if (ready) "listo" else "modelo no disponible"
                    if (!ready) running = false
                }
            }
            while (true) {
                val next = nextJob() ?: break
                val floats = FloatArray(next.audio.size) { next.audio[it] / 32768f }
                next.audio.fill(0)
                if (conditionAudio) {
                    val level = LocalAsrConditioner.condition(floats)
                    condition.withLock { levels.add(level) }
                }
                var decodeStarted: Long? = null
                var decodeFailed = false
                try {
                    val canDecode = condition.withLock { running && generation == next.generation && platform.elapsedRealtimeMs() < deadline }
                    if (canDecode) {
                        decodeStarted = platform.elapsedRealtimeMs()
                        condition.withLock {
                            stats[next.phase].decodeCalls++; stats[next.phase].decodedSamples += floats.size
                            if (windowed && next.endChunk > coveredEndChunk) {
                                coveredChunks += next.endChunk - maxOf(next.startChunk, coveredEndChunk)
                                coveredEndChunk = next.endChunk
                            }
                        }
                    }
                    val decoded = if (canDecode) try {
                        decoder?.decode(floats)
                    } catch (failure: Throwable) {
                        decodeFailed = true
                        throw failure
                    } finally {
                        val elapsed = maxOf(0L, platform.elapsedRealtimeMs() - decodeStarted!!)
                        condition.withLock {
                            val s = stats[next.phase]
                            s.decodeTotalMs += elapsed; s.decodeMaxMs = maxOf(s.decodeMaxMs, elapsed)
                            val slot = (timingCount % TIMING_SLOTS).toInt() * 3
                            timings[slot] = next.startChunk * 50; timings[slot + 1] = next.endChunk * 50; timings[slot + 2] = elapsed
                            timingCount++
                        }
                    } else null
                    val text = if (decoded != null) acceptedLocalText(decoded) else ""
                    val post = condition.withLock {
                        val s = stats[next.phase]
                        if (!running || generation != next.generation || platform.elapsedRealtimeMs() >= deadline) {
                            if (canDecode) s.invalidatedDecodes++
                            false
                        } else {
                            when {
                                decoded == null -> s.languageOther++
                                decoded.forced -> if (decoded.language == "es") s.languageForced++ else s.forcedMismatch++
                                decoded.language == "es" -> s.languageEs++
                                decoded.language == "ca" -> s.languageCa++
                                else -> s.languageOther++
                            }
                            when (decoded?.let { localTextRejection(it) }) {
                                LocalTextRejection.LANGUAGE -> s.rejectedLanguage++
                                LocalTextRejection.EMPTY -> s.rejectedEmpty++
                                LocalTextRejection.STRUCTURE -> s.rejectedStructure++
                                LocalTextRejection.HALLUCINATION -> s.rejectedHallucination++
                                else -> Unit
                            }
                            if (text.isEmpty()) { s.abstentions++; false }
                            else {
                                s.accepted++
                                // Single result slot (unchanged): an undelivered predecessor is counted, not queued.
                                discardPendingResult()
                                result = Result(next.generation, text, decoded!!.language, next.phase, next.endChunk, next.audio.size,
                                    next.closedAtMs)
                                true
                            }
                        }
                    }
                    if (post) publish(next.generation)
                } catch (_: Throwable) {
                    condition.withLock {
                        val s = stats[next.phase]
                        if (running && generation == next.generation && platform.elapsedRealtimeMs() < deadline) {
                            s.abstentions++
                            if (decodeFailed) s.decodeErrors++ else s.processingErrors++
                        } else if (decodeStarted != null) s.invalidatedDecodes++
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
                buffer.reset(); job?.audio?.fill(0); job = null; discardPendingResult(); lastDelivered = null
                activeInputBytes = 0; busy = false; ready = false; running = false; worker = false
            }
        }
    }

    private fun publish(token: Long) {
        host.dispatcher.post {
            val delivery = condition.withLock {
                val current = result
                if (current == null || current.generation != token) null // Already counted or a newer generation.
                else {
                    result = null
                    val target = listener
                    if (running && generation == token && platform.elapsedRealtimeMs() < deadline && target != null) {
                        val previous = lastDelivered
                        // Adjacent = this window starts inside the previously delivered one. In the reference
                        // policy that is exactly "one hop later"; any dropped/skipped window breaks it.
                        val text = if (windowed && previous?.generation == current.generation &&
                            current.startChunk < previous.endChunk && current.endChunk > previous.endChunk)
                            localWindowNovelText(previous.text, current.text) else current.text
                        lastDelivered = current
                        if (text.isEmpty()) return@withLock null
                        val latency = maxOf(0L, platform.elapsedRealtimeMs() - current.closedAtMs)
                        latencyCount++; latencyTotalMs += latency; latencyMaxMs = maxOf(latencyMaxMs, latency)
                        stats[current.phase].delivered++
                        stats[current.phase].deliveredChars += text.length.toLong()
                        Pair(target, current.copy(text = text))
                    } else {
                        // Invalid publication or consumption without a listener is never a delivery.
                        stats[current.phase].deliveryDiscarded++
                        null
                    }
                }
            }
            delivery?.let { (target, segment) ->
                val endMs = segment.endChunk * 50
                target.onSegment(segment.text, segment.language, maxOf(0L, endMs - segment.sampleCount / 16), endMs)
            }
        }
    }
}
