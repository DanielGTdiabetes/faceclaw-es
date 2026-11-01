package com.faceclaw.app

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.assertNull

class LocalTargetSpeakerVerifierTest {
    private class Decoder : LocalVoiceDecoder {
        override val dimension = 2
        val vectors = ArrayDeque<FloatArray?>()
        val seen = mutableListOf<FloatArray>()
        var released = false
        override fun embed(samples: FloatArray): FloatArray? {
            seen.add(samples)
            return vectors.removeFirst()?.copyOf()
        }
        override fun release() { released = true }
    }
    private val audio = FloatArray(64000) { if (it % 2 == 0) .04f else -.04f }
    private fun decoded(intervals: List<LocalVoiceInterval> = listOf(LocalVoiceInterval("v3-0", 0, 4000)),
        available: Boolean = true, words: List<LocalTimedWord> = listOf(LocalTimedWord("Hola", 100, 1500),
            LocalTimedWord("mundo", 2000, 3500))) = LocalDecodedText("Hola mundo", "es",
                diarization = LocalDiarization(available, audio.size, words, intervals))

    @Test fun matchingDisjointPrintsRecognizeWearerAndEraseCopies() {
        val d = Decoder().apply { repeat(2) { vectors.add(floatArrayOf(1f, 0f)) } }
        val verifier = LocalTargetSpeakerVerifier(d, floatArrayOf(1f, 0f))
        val turns = verifier.attributeDiarized(audio, decoded())
        assertEquals(listOf("Hola mundo"), turns.map { it.text })
        assertEquals("portador", turns.single().label.relation)
        assertEquals(100, turns.single().startMs); assertEquals(3500, turns.single().endMs)
        assertTrue(d.seen.all { it.all { x -> x == 0f } })
        assertTrue(audio.any { it != 0f })
        verifier.release(); assertTrue(d.released)
    }
    @Test fun consistentDifferentVoiceIsOtherWithoutSessionClustering() {
        val d = Decoder().apply { repeat(2) { vectors.add(floatArrayOf(0f, 1f)) } }
        val verifier = LocalTargetSpeakerVerifier(d, floatArrayOf(1f, 0f))
        val turn = verifier.attributeDiarized(audio, decoded()).single()
        assertEquals("otro", turn.label.relation)
        // LocalConversationTurns and isLocalWindowTurn accept voz-N, never arbitrary other labels.
        assertEquals("voz-1", turn.label.speaker)
        assertEquals(1, verifier.voices)
    }
    @Test fun contradictoryPrintsAndTheGreyZoneStayUnknown() {
        for (second in listOf(floatArrayOf(0f, 1f), floatArrayOf(.7f, .7f))) {
            val d = Decoder().apply { vectors.add(floatArrayOf(1f, 0f)); vectors.add(second) }
            val verifier = LocalTargetSpeakerVerifier(d, floatArrayOf(1f, 0f))
            assertEquals("desconocido", verifier.attributeDiarized(audio, decoded()).single().label.relation)
        }
    }
    @Test fun unavailableForeignWordAlignmentOrMissingProfileNeverUseWholeWindowIdentity() {
        val d = Decoder()
        val verifier = LocalTargetSpeakerVerifier(d, null)
        for (value in listOf(decoded(available = false), decoded().copy(text = "otra frase"), decoded(),
            decoded().copy(diarization = decoded().diarization!!.copy(sampleCount = 99)))) {
            assertEquals("desconocido", verifier.attributeDiarized(audio, value).single().label.relation)
        }
        assertTrue(d.seen.isEmpty())
    }
    @Test fun overlapIsExcludedRatherThanEmbeddedAsOneVoice() {
        val intervals = listOf(LocalVoiceInterval("a", 0, 4000), LocalVoiceInterval("b", 1000, 3000))
        assertEquals(listOf(LocalVoiceInterval("a", 0, 1000), LocalVoiceInterval("a", 3000, 4000)),
            LocalTargetSpeakerVerifier.exclusive(intervals))
        val d = Decoder().apply { repeat(2) { vectors.add(floatArrayOf(1f, 0f)) } }
        val verifier = LocalTargetSpeakerVerifier(d, floatArrayOf(1f, 0f))
        assertTrue(verifier.attributeDiarized(audio, decoded(intervals)).all { it.label.relation == "desconocido" })
    }
    @Test fun shortSegmentsAndSilenceNeverBecomeConfirmedOther() {
        val d = Decoder()
        val verifier = LocalTargetSpeakerVerifier(d, floatArrayOf(1f, 0f))
        assertEquals("desconocido", verifier.attributeDiarized(audio, decoded(listOf(LocalVoiceInterval("a", 0, 900))))
            .single().label.relation)
        assertNull(LocalTargetSpeakerVerifier.prepare(FloatArray(32000)))
        assertNull(LocalTargetSpeakerVerifier.prepare(FloatArray(32000) { 1f }))
        assertNull(LocalTargetSpeakerVerifier.prepare(FloatArray(32000) { Float.NaN }))
        assertTrue(d.seen.isEmpty())
    }
    @Test fun twoSpeakersInOneWindowGiveSeparateTextTurns() {
        val d = Decoder().apply {
            repeat(2) { vectors.add(floatArrayOf(1f, 0f)) }
            repeat(2) { vectors.add(floatArrayOf(0f, 1f)) }
        }
        val verifier = LocalTargetSpeakerVerifier(d, floatArrayOf(1f, 0f))
        val spans = listOf(LocalVoiceInterval("a", 0, 2000), LocalVoiceInterval("b", 2000, 4000))
        val turns = verifier.attributeDiarized(audio, decoded(spans))
        assertEquals(listOf("Hola", "mundo"), turns.map { it.text })
        assertEquals(listOf("portador", "otro"), turns.map { it.label.relation })
        assertEquals(listOf(0, 5), turns.map { it.startChar })
        assertEquals(listOf(4, 10), turns.map { it.endChar })
    }
    @Test fun globalGainIsBoundedAndLeavesInputUntouched() {
        val faint = FloatArray(32000) { .004f }
        val output = LocalTargetSpeakerVerifier.prepare(faint)!!
        assertTrue(output.all { it <= .03201f && it >= .03199f })
        assertTrue(faint.all { it == .004f })
    }
    @Test fun scalarDiagnosticExplainsUncertaintyWithoutTextAndCannotChangeTheDecision() {
        val d = Decoder().apply { vectors.add(floatArrayOf(1f, 0f)); vectors.add(floatArrayOf(0f, 1f)) }
        val records = mutableListOf<String>()
        val verifier = LocalTargetSpeakerVerifier(d, floatArrayOf(1f, 0f)) { records.add(it); error("sink failure") }
        assertEquals("desconocido", verifier.attributeDiarized(audio, decoded()).single().label.relation)
        assertTrue(records.single().contains("\"profile\":true"))
        assertTrue(records.single().contains("\"comparisons\":2"))
        assertTrue(records.single().contains("\"similarityMin\":0.0"))
        assertTrue(records.single().contains("\"similarityMax\":1.0"))
        assertTrue(!records.single().contains("Hola"))
    }

    @Test fun callerErasingLoadedProfileCannotEraseEitherAttributorsOwnedReference() {
        val profile = floatArrayOf(1f, 0f)
        val d = Decoder().apply { repeat(2) { vectors.add(floatArrayOf(1f, 0f)) } }
        val verifier = LocalTargetSpeakerVerifier(d, profile)
        profile.fill(0f) // Android erases the decrypted temporary after the constructor returns.
        assertEquals("portador", verifier.attributeDiarized(audio, decoded()).single().label.relation)
        verifier.release()
        val legacyProfile = floatArrayOf(1f, 0f)
        val legacyDecoder = Decoder().apply { vectors.add(floatArrayOf(1f, 0f)) }
        val legacy = LocalSpeakerTracker(legacyDecoder, legacyProfile)
        legacyProfile.fill(0f)
        assertEquals("portador", legacy.attribute(audio, 64000).relation)
        legacy.release()
    }

    @Test fun wholeWindowProbeIsReadOnlyEvenWhenItsResultDisagreesWithTheCleanFragments() {
        val d = Decoder().apply {
            repeat(2) { vectors.add(floatArrayOf(1f, 0f)) }
            repeat(2) { vectors.add(floatArrayOf(0f, 1f)) }
        }
        val records = mutableListOf<String>()
        val verifier = LocalTargetSpeakerVerifier(d, floatArrayOf(1f, 0f), probeWholeWindow = true) { records.add(it) }
        assertEquals("portador", verifier.attributeDiarized(audio, decoded()).single().label.relation)
        assertTrue(records.single().contains("\"wholeRawSimilarity\":0.0"))
        assertTrue(records.single().contains("\"wholePreparedSimilarity\":0.0"))
        assertTrue(d.seen.all { it.all { x -> x == 0f } })
        assertTrue(audio.any { it != 0f })
    }

}
