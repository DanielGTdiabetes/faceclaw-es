package com.faceclaw.app

/** Consumes EVO decisions only. No model, reference loading, cosine or clustering runs on the phone. */
class LocalEvoSpeakerAttributor : LocalSpeakerAttributor {
    private var otherSeen = false
    override val voices: Int get() = if (otherSeen) 1 else 0
    override fun attribute(samples: FloatArray, voicedSamples: Int) = LocalSpeakerLabel.UNKNOWN
    override fun release() { otherSeen = false }
    override fun attributeDiarized(samples: FloatArray, decoded: LocalDecodedText): List<LocalSpeakerTurn> {
        val text = decoded.text.trim(); val duration = samples.size / 16L
        fun unknown() = listOf(LocalSpeakerTurn(text, 0, duration, LocalSpeakerLabel.UNKNOWN))
        val diar = decoded.diarization ?: return unknown()
        if (!diar.available || !diar.identity || diar.sampleCount != samples.size || diar.words.isEmpty() ||
            diar.words.size > 256 || diar.intervals.size > 128 || diar.words.joinToString(" ") { it.text.trim() } != text ||
            diar.words.any { it.text.isBlank() || it.startMs < 0 || it.endMs <= it.startMs || it.endMs > duration } ||
            diar.words.zipWithNext().any { (a,b) -> b.startMs < a.startMs } ||
            diar.intervals.any { it.startMs < 0 || it.endMs <= it.startMs || it.endMs > duration ||
                it.relation !in listOf("portador", "otro", "desconocido") }) return unknown()
        val turns = mutableListOf<LocalSpeakerTurn>(); var offset = 0
        for (word in diar.words) {
            val candidates = diar.intervals.filter { minOf(it.endMs, word.endMs) > maxOf(it.startMs, word.startMs) }
            val label = if (candidates.size == 1) {
                val span = candidates.single()
                val coverage = (minOf(span.endMs, word.endMs) - maxOf(span.startMs, word.startMs)).toDouble() / (word.endMs - word.startMs)
                if (coverage < .8) LocalSpeakerLabel.UNKNOWN else when (span.relation) {
                    "portador" -> LocalSpeakerLabel(LocalSpeakerLabel.WEARER, "portador")
                    "otro" -> { otherSeen = true; LocalSpeakerLabel("voz-1", "otro") }
                    else -> LocalSpeakerLabel.UNKNOWN
                }
            } else LocalSpeakerLabel.UNKNOWN
            val end = offset + word.text.trim().length; val previous = turns.lastOrNull()
            if (previous != null && previous.label == label) turns[turns.lastIndex] = previous.copy(
                text = text.substring(previous.startChar, end), endChar = end, endMs = maxOf(previous.endMs, word.endMs))
            else turns.add(LocalSpeakerTurn(word.text.trim(), word.startMs, word.endMs, label, offset, end))
            offset = end + 1
        }
        return turns
    }
}
