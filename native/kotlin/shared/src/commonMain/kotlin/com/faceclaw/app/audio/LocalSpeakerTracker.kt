package com.faceclaw.app

/**
 * Speaker of one transcribed window. `speaker` null means unattributed; `relation` is one of
 * "portador" (the wearer's saved profile), "otro" (another session voice) or "desconocido".
 * Labels are provisional voice-print evidence, never verified identities.
 */
data class LocalSpeakerLabel(val speaker: String?, val relation: String) {
    companion object {
        val UNKNOWN = LocalSpeakerLabel(null, "desconocido")
        const val WEARER = "portador"
    }
}

/** Attributes one window of raw (unconditioned) 16 kHz audio. Lives for one transcription session. */
interface LocalSpeakerAttributor {
    fun attribute(samples: FloatArray, voicedSamples: Int): LocalSpeakerLabel
    /** Scalars only, for diagnostics: number of session voices other than the wearer. */
    val voices: Int
    fun release()
}

/**
 * Session voices in RAM: the wearer's saved profile (optional) plus up to [MAX_VOICES] other voices
 * clustered online by cosine similarity. Other voices are kept only for the session and erased on
 * [release]; nothing is persisted, logged or sent.
 *
 * - similarity to the profile >= [WEARER_MIN] -> "portador";
 * - between [OTHER_MAX] and [WEARER_MIN] -> unattributed (too close to call);
 * - otherwise the nearest voice with similarity >= [JOIN_MIN] (its centroid absorbs the print, with its
 *   weight capped at [CENTROID_CAP]), or a new voice while fewer than [MAX_VOICES] exist.
 * Without a profile every voice is clustered and labelled "desconocido": a cluster may be the wearer.
 * Windows with less than [MIN_VOICED] of voice or without an embedding stay unattributed.
 * Thresholds are the participation ones; they still need calibration on recorded G2 audio.
 */
class LocalSpeakerTracker(private val decoder: LocalVoiceDecoder, profile: FloatArray?) : LocalSpeakerAttributor {
    companion object {
        const val MIN_VOICED = 16000
        const val WEARER_MIN = 0.80
        const val OTHER_MAX = 0.60
        const val JOIN_MIN = 0.70
        const val MAX_VOICES = 6
        const val CENTROID_CAP = 20
    }

    private class Voice(val label: String, var centroid: FloatArray, var count: Int)

    private var own: FloatArray? = normalizeLocalVoice(profile, decoder.dimension)
    private val others = mutableListOf<Voice>()
    private var nextVoice = 1

    override val voices: Int get() = others.size

    override fun attribute(samples: FloatArray, voicedSamples: Int): LocalSpeakerLabel {
        if (voicedSamples < MIN_VOICED) return LocalSpeakerLabel.UNKNOWN
        val vector = normalizeLocalVoice(decoder.embed(samples), decoder.dimension) ?: return LocalSpeakerLabel.UNKNOWN
        try {
            val profile = own
            if (profile != null) {
                val similarity = VoicePrint.dot(profile, vector)
                if (similarity >= WEARER_MIN) return LocalSpeakerLabel(LocalSpeakerLabel.WEARER, "portador")
                if (similarity > OTHER_MAX) return LocalSpeakerLabel.UNKNOWN
            }
            val relation = if (profile != null) "otro" else "desconocido"
            val nearest = others.maxByOrNull { VoicePrint.dot(it.centroid, vector) }
            if (nearest != null && VoicePrint.dot(nearest.centroid, vector) >= JOIN_MIN) {
                val merged = SpeakerEmbeddings.runningMean(nearest.centroid, nearest.count, vector, CENTROID_CAP)
                nearest.centroid.fill(0f)
                nearest.centroid = merged.embedding; nearest.count = merged.count
                return LocalSpeakerLabel(nearest.label, relation)
            }
            if (others.size >= MAX_VOICES) return LocalSpeakerLabel.UNKNOWN
            val voice = Voice("voz-${nextVoice++}", vector.copyOf(), 1)
            others.add(voice)
            return LocalSpeakerLabel(voice.label, relation)
        } finally {
            vector.fill(0f)
        }
    }

    override fun release() {
        own?.fill(0f); own = null
        for (voice in others) voice.centroid.fill(0f)
        others.clear()
        decoder.release()
    }
}
