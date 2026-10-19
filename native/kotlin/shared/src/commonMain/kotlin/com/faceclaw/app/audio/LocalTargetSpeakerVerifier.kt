package com.faceclaw.app

import kotlin.math.abs
import kotlin.math.sqrt

data class LocalTimedWord(val text: String, val startMs: Long, val endMs: Long)
/** `speakerId`/`state`: EVO session voice and its evidence state (contract v3); null in v2 answers. */
data class LocalVoiceInterval(val speaker: String, val startMs: Long, val endMs: Long, val relation: String? = null,
    val speakerId: String? = null, val state: String? = null)
data class LocalDiarization(val available: Boolean, val sampleCount: Int,
    val words: List<LocalTimedWord> = emptyList(), val intervals: List<LocalVoiceInterval> = emptyList(), val identity: Boolean = false)
data class LocalSpeakerTurn(val text: String, val startMs: Long, val endMs: Long, val label: LocalSpeakerLabel,
    val startChar: Int = 0, val endChar: Int = text.length)

/**
 * V3 locates anonymous voices inside ONE ASR window. Only this phone compares them with its saved
 * profile. No session clustering, no loudest/first-speaker identity, no profile updates or persistence.
 * Two disjoint, quality-gated prints must agree; short, mixed, contradictory or unavailable evidence
 * stays unknown. Similarity thresholds are unchanged and still require real G2 validation.
 */
class LocalTargetSpeakerVerifier(private val decoder: LocalVoiceDecoder, profile: FloatArray?,
    private val probeWholeWindow: Boolean = false,
    private val diagnostic: (String) -> Unit = {}) : LocalSpeakerAttributor {
    private var own = normalizeLocalVoice(profile?.copyOf(), decoder.dimension)
    private var sawOther = false
    private var comparisons = 0
    private var qualityRejected = 0
    private var shortRejected = 0
    private var invalid = 0
    private var failed = 0
    private var minimum = 1.0
    private var maximum = -1.0
    override val voices: Int get() = if (sawOther) 1 else 0
    override fun attribute(samples: FloatArray, voicedSamples: Int) = LocalSpeakerLabel.UNKNOWN

    override fun attributeDiarized(samples: FloatArray, decoded: LocalDecodedText): List<LocalSpeakerTurn> {
        comparisons = 0; qualityRejected = 0; shortRejected = 0; invalid = 0; failed = 0
        minimum = 1.0; maximum = -1.0
        var turns: List<LocalSpeakerTurn> = emptyList()
        try {
            turns = attributeWindow(samples, decoded)
            return turns
        } finally {
            // One scalar record per window. No transcript, profile, embedding or PCM is logged.
            val lo = if (comparisons > 0) ((minimum * 1000).toInt() / 1000.0).toString() else "null"
            val hi = if (comparisons > 0) ((maximum * 1000).toInt() / 1000.0).toString() else "null"
            val pair = if (probeWholeWindow) wholeWindowProbe(samples) else (null to null)
            val longest = decoded.diarization?.intervals?.let { exclusive(it).maxOfOrNull { span -> span.endMs - span.startMs } } ?: 0
            val state = "{\"profile\":${own != null},\"comparisons\":$comparisons," +
                "\"windowMs\":${samples.size / 16},\"longestExclusiveMs\":$longest," +
                "\"wholeRawSimilarity\":${pair.first},\"wholePreparedSimilarity\":${pair.second}," +
                "\"qualityRejected\":$qualityRejected,\"shortRejected\":$shortRejected,\"invalid\":$invalid," +
                "\"errors\":$failed,\"similarityMin\":$lo,\"similarityMax\":$hi," +
                "\"wearer\":${turns.count { it.label.relation == "portador" }}," +
                "\"other\":${turns.count { it.label.relation == "otro" }}," +
                "\"unknown\":${turns.count { it.label.relation == "desconocido" }}}"
            try { diagnostic(state) } catch (_: Throwable) { /* diagnostics never affect attribution */ }
        }
    }

    /** Paired diagnostic only. A whole mixed window is NEVER used to assign an identity. */
    private fun wholeWindowProbe(samples: FloatArray): Pair<Double?, Double?> {
        val profile = own ?: return null to null
        if (samples.size !in 16000..256000) return null to null
        fun score(audio: FloatArray?): Double? {
            if (audio == null) return null
            var vector: FloatArray? = null
            return try {
                vector = normalizeLocalVoice(decoder.embed(audio), decoder.dimension)
                vector?.let { (VoicePrint.dot(profile, it) * 1000).toInt() / 1000.0 }
            } catch (_: Throwable) { null }
            finally { audio.fill(0f); vector?.fill(0f) }
        }
        val raw = samples.copyOf()
        val prepared = prepare(samples)
        return score(raw) to score(prepared)
    }

    private fun attributeWindow(samples: FloatArray, decoded: LocalDecodedText): List<LocalSpeakerTurn> {
        val text = decoded.text.trim()
        fun unknown(): List<LocalSpeakerTurn> {
            invalid++
            return listOf(LocalSpeakerTurn(text, 0, samples.size / 16L, LocalSpeakerLabel.UNKNOWN))
        }
        val diar = decoded.diarization ?: return unknown()
        if (!diar.available || diar.sampleCount != samples.size || diar.words.isEmpty() ||
            diar.words.size > 256 || diar.intervals.size > 128 ||
            diar.words.joinToString(" ") { it.text.trim() } != text) return unknown()
        val duration = samples.size / 16L
        if (diar.words.any { it.text.isBlank() || it.startMs < 0 || it.endMs <= it.startMs || it.endMs > duration } ||
            diar.words.zipWithNext().any { (a, b) -> b.startMs < a.startMs } ||
            diar.intervals.any { it.speaker.isBlank() || it.speaker.length > 16 || it.startMs < 0 ||
                it.endMs <= it.startMs || it.endMs > duration }) return unknown()
        val clean = exclusive(diar.intervals)
        val identities = clean.groupBy { it.speaker }.entries.take(8).associate { (speaker, spans) ->
            speaker to verify(samples, spans)
        }
        val turns = mutableListOf<LocalSpeakerTurn>()
        var offset = 0
        for (word in diar.words) {
            val value = word.text.trim()
            val competing = diar.intervals.filter { minOf(word.endMs, it.endMs) > maxOf(word.startMs, it.startMs) }
                .map { it.speaker }.distinct()
            val label = if (competing.size == 1) {
                val speaker = competing[0]
                val coverage = clean.filter { it.speaker == speaker }.sumOf {
                    maxOf(0L, minOf(word.endMs, it.endMs) - maxOf(word.startMs, it.startMs))
                }
                if (coverage.toDouble() / (word.endMs - word.startMs) >= .8)
                    identities[speaker] ?: LocalSpeakerLabel.UNKNOWN else LocalSpeakerLabel.UNKNOWN
            } else LocalSpeakerLabel.UNKNOWN
            val end = offset + value.length
            val previous = turns.lastOrNull()
            if (previous != null && previous.label == label) {
                turns[turns.lastIndex] = previous.copy(text = text.substring(previous.startChar, end),
                    endMs = maxOf(previous.endMs, word.endMs), endChar = end)
            } else turns.add(LocalSpeakerTurn(value, word.startMs, word.endMs, label, offset, end))
            offset = end + 1
        }
        return turns
    }

    private fun verify(samples: FloatArray, spans: List<LocalVoiceInterval>): LocalSpeakerLabel {
        val profile = own ?: return LocalSpeakerLabel.UNKNOWN
        // Take two disjoint >=1 s pieces, keeping each embedding inside a single V3 voice interval.
        val pieces = mutableListOf<Pair<Int, Int>>()
        for (span in spans.sortedByDescending { it.endMs - it.startMs }) {
            val start = (span.startMs * 16).toInt()
            val end = (span.endMs * 16).toInt()
            if (end - start >= 32000) {
                val middle = (start + end) / 2
                pieces.add(start to minOf(middle, start + 48000))
                pieces.add(middle to minOf(end, middle + 48000))
            } else if (end - start >= 16000) pieces.add(start to end)
            if (pieces.size >= 2) break
        }
        if (pieces.size < 2) { shortRejected++; return LocalSpeakerLabel.UNKNOWN }
        val scores = mutableListOf<Double>()
        for ((start, end) in pieces.take(2)) {
            val raw = samples.copyOfRange(start, end)
            var prepared: FloatArray? = null
            var vector: FloatArray? = null
            try {
                prepared = prepare(raw) ?: run { qualityRejected++; return LocalSpeakerLabel.UNKNOWN }
                vector = normalizeLocalVoice(decoder.embed(prepared), decoder.dimension)
                    ?: run { failed++; return LocalSpeakerLabel.UNKNOWN }
                val score = VoicePrint.dot(profile, vector)
                comparisons++; minimum = minOf(minimum, score); maximum = maxOf(maximum, score)
                scores.add(score)
            } catch (_: Throwable) {
                failed++
                return LocalSpeakerLabel.UNKNOWN
            } finally {
                raw.fill(0f); prepared?.fill(0f); vector?.fill(0f)
            }
        }
        if (scores.all { it >= LocalSpeakerTracker.WEARER_MIN })
            return LocalSpeakerLabel(LocalSpeakerLabel.WEARER, "portador")
        if (scores.all { it <= LocalSpeakerTracker.OTHER_MAX }) {
            sawOther = true
            return LocalSpeakerLabel("voz-1", "otro")
        }
        return LocalSpeakerLabel.UNKNOWN
    }

    override fun release() {
        own?.fill(0f); own = null; sawOther = false
        decoder.release()
    }

    companion object {
        /** Removes ALL intervals with simultaneous different speakers; adjacent same-voice slices merge. */
        fun exclusive(intervals: List<LocalVoiceInterval>): List<LocalVoiceInterval> {
            val bounds = intervals.flatMap { listOf(it.startMs, it.endMs) }.distinct().sorted()
            val result = mutableListOf<LocalVoiceInterval>()
            for ((start, end) in bounds.zipWithNext()) {
                val speakers = intervals.filter { it.startMs < end && it.endMs > start }.map { it.speaker }.distinct()
                if (speakers.size != 1) continue
                val last = result.lastOrNull()
                if (last?.speaker == speakers[0] && last.endMs == start)
                    result[result.lastIndex] = last.copy(endMs = end)
                else result.add(LocalVoiceInterval(speakers[0], start, end))
            }
            return result
        }

        /** Energy is a quality gate, never an identity or proof that two voices are separated. */
        fun prepare(samples: FloatArray): FloatArray? {
            if (samples.size < 16000 || samples.any { !it.isFinite() }) return null
            if (samples.count { abs(it) >= .999f }.toDouble() / samples.size > .01) return null
            val frame = 320
            val energies = (samples.indices step frame).map { start ->
                val end = minOf(samples.size, start + frame)
                sqrt((start until end).sumOf { samples[it].toDouble() * samples[it] } / (end - start))
            }
            val floor = maxOf(.00316, (energies.maxOrNull() ?: 0.0) * .1)
            val active = energies.indices.filter { energies[it] >= floor }
            if (active.sumOf { minOf(frame, samples.size - it * frame) } < 16000) return null
            val begin = active.first() * frame
            val end = minOf(samples.size, (active.last() + 1) * frame)
            val output = samples.copyOfRange(begin, end)
            val rms = sqrt(active.sumOf { energies[it] * energies[it] } / active.size)
            val peak = output.maxOf { abs(it).toDouble() }
            val gain = minOf((.0708 / rms).coerceIn(.25, 8.0), .98 / maxOf(peak, 1e-9))
            for (i in output.indices) output[i] = (output[i] * gain).toFloat()
            return output
        }
    }
}
