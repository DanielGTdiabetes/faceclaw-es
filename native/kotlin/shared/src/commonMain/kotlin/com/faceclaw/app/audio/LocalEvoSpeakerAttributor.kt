package com.faceclaw.app

/**
 * What the phone did with the previous window's EVO labels: counters only (no text, audio or vectors).
 * Sent with the next window so EVO can correlate both sides without logcat or USB.
 */
data class LocalAttributionReport(
    val status: String,
    val words: Int = 0,
    val wearer: Int = 0,
    val other: Int = 0,
    val unknown: Int = 0,
    val turns: Int = 0,
    val loss: Map<String, Int> = emptyMap(),
) {
    fun toJson(seq: Long): String = buildString {
        append("{\"seq\":").append(seq).append(",\"status\":\"").append(status).append('"')
        append(",\"words\":").append(words).append(",\"portador\":").append(wearer)
        append(",\"otro\":").append(other).append(",\"desconocido\":").append(unknown).append(",\"turns\":").append(turns)
        append(",\"loss\":{")
        loss.entries.filter { it.value > 0 }.sortedBy { it.key }.forEachIndexed { i, (k, v) ->
            if (i > 0) append(','); append('"').append(k).append("\":").append(v)
        }
        append("}}")
    }
}

/**
 * Consumes EVO decisions only. No model, reference loading, cosine or clustering runs on the phone.
 *
 * Contract v3 intervals carry a session `speakerId` (stable within the Conversation session on EVO) and a
 * relation. Each distinct foreign session voice keeps its own label (voz-1, voz-2…) for this session; the
 * wearer is always "portador"; an unknown relation never carries a speaker label, so a voice whose relation
 * is still pending can later become "otro" or "portador" without contradicting earlier turns. v2 answers
 * (no session ids) keep the previous behaviour: any foreign voice is voz-1.
 *
 * Word alignment: intervals of the SAME session voice are combined (fragmented/adjacent spans), so a word
 * crossing them keeps its label when they cover >= 80 % of it; a word touching different voices stays
 * unknown. Every reason a word ends unknown is counted in [report].
 */
class LocalEvoSpeakerAttributor : LocalSpeakerAttributor {
    private val names = LinkedHashMap<String, String>()
    private var legacyOther = false
    private var last: LocalAttributionReport? = null
    override val voices: Int get() = names.size + if (legacyOther) 1 else 0
    override fun attribute(samples: FloatArray, voicedSamples: Int) = LocalSpeakerLabel.UNKNOWN
    override fun report(): LocalAttributionReport? = last
    override fun release() { names.clear(); legacyOther = false; last = null }

    override fun attributeDiarized(samples: FloatArray, decoded: LocalDecodedText): List<LocalSpeakerTurn> {
        val text = decoded.text.trim(); val duration = samples.size / 16L
        val wordCount = decoded.diarization?.words?.size ?: 0
        fun unknown(reason: String): List<LocalSpeakerTurn> {
            last = LocalAttributionReport("invalid", words = wordCount, unknown = wordCount, turns = 1, loss = mapOf(reason to 1))
            return listOf(LocalSpeakerTurn(text, 0, duration, LocalSpeakerLabel.UNKNOWN))
        }
        val diar = decoded.diarization ?: return unknown("contract")
        if (!diar.available || !diar.identity) return unknown("contract")
        if (diar.sampleCount != samples.size) return unknown("samples")
        if (diar.words.isEmpty() || diar.words.size > 256 || diar.intervals.size > 128) return unknown("nowords")
        if (diar.words.joinToString(" ") { it.text.trim() } != text) return unknown("text")
        if (diar.words.any { it.text.isBlank() || it.startMs < 0 || it.endMs <= it.startMs || it.endMs > duration } ||
            diar.words.zipWithNext().any { (a, b) -> b.startMs < a.startMs } ||
            diar.intervals.any { it.startMs < 0 || it.endMs <= it.startMs || it.endMs > duration }) return unknown("times")
        if (diar.intervals.any { it.relation !in RELATIONS || (it.speakerId != null && !SPEAKER_ID.matches(it.speakerId)) })
            return unknown("contract")
        val loss = HashMap<String, Int>()
        var wearer = 0; var other = 0; var unknownWords = 0
        val turns = mutableListOf<LocalSpeakerTurn>(); var offset = 0
        for (word in diar.words) {
            val candidates = diar.intervals.filter { minOf(it.endMs, word.endMs) > maxOf(it.startMs, word.startMs) }
            val byVoice = candidates.groupBy { it.speakerId ?: "${it.speaker}|${it.relation}" }
            val label = when {
                byVoice.isEmpty() -> { loss.bump("coverage"); LocalSpeakerLabel.UNKNOWN }
                byVoice.size > 1 -> { loss.bump("multiple"); LocalSpeakerLabel.UNKNOWN }
                else -> {
                    val spans = byVoice.values.single()
                    val covered = spans.sumOf { minOf(it.endMs, word.endMs) - maxOf(it.startMs, word.startMs) }
                    if (covered.toDouble() / (word.endMs - word.startMs) < .8) { loss.bump("coverage"); LocalSpeakerLabel.UNKNOWN }
                    else labelFor(spans.first()) ?: run { loss.bump("unknown"); LocalSpeakerLabel.UNKNOWN }
                }
            }
            when (label.relation) { "portador" -> wearer++; "otro" -> other++; else -> unknownWords++ }
            val end = offset + word.text.trim().length; val previous = turns.lastOrNull()
            if (previous != null && previous.label == label) turns[turns.lastIndex] = previous.copy(
                text = text.substring(previous.startChar, end), endChar = end, endMs = maxOf(previous.endMs, word.endMs))
            else turns.add(LocalSpeakerTurn(word.text.trim(), word.startMs, word.endMs, label, offset, end))
            offset = end + 1
        }
        last = LocalAttributionReport("ok", diar.words.size, wearer, other, unknownWords, turns.size, loss)
        return turns
    }

    private fun labelFor(span: LocalVoiceInterval): LocalSpeakerLabel? = when (span.relation) {
        "portador" -> LocalSpeakerLabel(LocalSpeakerLabel.WEARER, "portador")
        "otro" -> {
            val id = span.speakerId
            if (id == null) { legacyOther = true; LocalSpeakerLabel("voz-1", "otro") }
            else LocalSpeakerLabel(names.getOrPut(id) { "voz-${names.size + 1}" }, "otro")
        }
        else -> null
    }

    private fun HashMap<String, Int>.bump(key: String) { this[key] = (this[key] ?: 0) + 1 }

    companion object {
        private val RELATIONS = setOf("portador", "otro", "desconocido")
        private val SPEAKER_ID = Regex("^h[0-9]{1,2}$")
    }
}
