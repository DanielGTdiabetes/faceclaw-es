package com.faceclaw.app

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class LocalParticipationSessionTest {
    @Test fun longComparisonSurvivesTwoMinutesButEnrollmentRetainsItsOldDeadline() {
        var now = 1000L
        val clock = object : ProtocolPlatform by testPlatform() { override fun elapsedRealtimeMs(): Long = now }
        val comparison = LocalParticipationSession(Host(), clock)
        assertTrue(comparison.start(false, durationMs = 1200000)); ready(comparison)
        now += 120001
        phrase(comparison); idle(comparison)
        assertTrue(comparison.diagnostics().contains("\"comparisons\":1"))
        comparison.stop(); stopped(comparison)
        val enrollment = LocalParticipationSession(Host(), clock)
        assertTrue(enrollment.start(true, durationMs = 1200000)); ready(enrollment)
        now += 120001
        stopped(enrollment)
        assertTrue(enrollment.diagnostics().contains("\"comparisons\":0"))
    }
    @Test fun timedComparisonsUseAcceptedAudioAndResetErasesPendingEvidence() {
        val session = LocalParticipationSession(Host())
        assertTrue(session.start(false, durationMs = 1200000)); ready(session)
        repeat(40) { session.acceptTimedPcm(pcm(), "posible voz", it * 50) }
        session.acceptTimedPcm(pcm(0), "sin actividad", 2000); idle(session)
        val evidence = session.drainMatches()
        assertTrue(evidence.contains("\"startMs\":0"))
        assertTrue(evidence.contains("\"endMs\":2050"))
        assertTrue(evidence.contains("\"voicedMs\":2000"))
        assertEquals("[]", session.drainMatches())
        repeat(40) { session.acceptTimedPcm(pcm(), "posible voz", 2050 + it * 50) }
        session.acceptTimedPcm(pcm(0), "sin actividad", 4050); idle(session)
        session.resetStream(); assertEquals("[]", session.drainMatches())
        session.stop(); stopped(session); assertEquals("[]", session.drainMatches())
    }

    @Test fun resetDuringTimedEmbeddingCannotPublishOldIdentityEvidence() {
        val host = Host(); val session = LocalParticipationSession(host)
        host.beforeEmbedding = { session.resetStream() }
        assertTrue(session.start(false)); ready(session)
        repeat(40) { session.acceptTimedPcm(pcm(), "posible voz", it * 50) }
        session.acceptTimedPcm(pcm(0), "sin actividad", 2000); idle(session)
        assertEquals("[]", session.drainMatches())
        session.stop(); stopped(session)
    }
    private fun pcm(value: Int = 2000): ByteArray = ByteArray(1600).also { bytes ->
        repeat(800) { bytes[it * 2] = value.toByte(); bytes[it * 2 + 1] = (value shr 8).toByte() }
    }
    private fun phrase(session: LocalParticipationSession, chunks: Int = 80, value: Int = 2000) {
        repeat(chunks) { session.acceptPcm(pcm(value), "posible voz") }
        session.acceptPcm(pcm(0), "sin actividad")
    }
    private fun waitFor(session: LocalParticipationSession, predicate: (String) -> Boolean) {
        val condition = testPlatform().createCondition()
        repeat(300) {
            if (predicate(session.diagnostics())) return
            condition.withLock { condition.awaitMs(10) }
        }
        error("session did not reach expected state: ${session.diagnostics()}")
    }
    private fun ready(session: LocalParticipationSession) = waitFor(session) { it.contains("\"status\":\"listo\"") }
    private fun idle(session: LocalParticipationSession) = waitFor(session) { it.contains("\"busy\":false") }
    private fun stopped(session: LocalParticipationSession) = waitFor(session) { it.contains("\"worker\":false") }
    private class Host : LocalParticipationHost {
        var profile: FloatArray? = floatArrayOf(1f, 0f)
        var vector = floatArrayOf(1f, 0f)
        var commits = 0
        var prepared: FloatArray? = null
        var embeddedSamples: FloatArray? = null
        var beforeEmbedding: (() -> Unit)? = null
        var beforePrepare: (() -> Unit)? = null
        var loads = 0
        var embeddings = 0
        override fun loadDecoder(): LocalVoiceDecoder {
            loads++
            return object : LocalVoiceDecoder {
                override val dimension = 2
                override fun embed(samples: FloatArray): FloatArray {
                    embeddings++; embeddedSamples = samples; beforeEmbedding?.invoke(); return vector.copyOf()
                }
                override fun release() {}
            }
        }
        override fun loadProfile(dimension: Int): FloatArray? = profile?.copyOf()
        override fun prepareProfile(vector: FloatArray): PreparedLocalVoiceProfile {
            beforePrepare?.invoke(); prepared = vector
            return object : PreparedLocalVoiceProfile {
                override fun commit(): Boolean { commits++; profile = vector.copyOf(); return true }
                override fun cancel() {}
            }
        }
    }
    @Test fun invalidAndZeroVectorsAreErasedAndCannotBecomeIdentity() {
        for (vector in listOf(floatArrayOf(0f, 0f), floatArrayOf(Float.NaN, 1f), floatArrayOf(1f))) {
            assertNull(normalizeLocalVoice(vector, 2)); assertTrue(vector.all { it == 0f })
        }
        val normalized = normalizeLocalVoice(floatArrayOf(3f, 4f), 2)!!
        assertEquals(0.6f, normalized[0]); assertEquals(0.8f, normalized[1])
    }
    @Test fun conversationNeedsTwoAlternationsAndExpiresOrResetsWithUncertainty() {
        val turns = LocalParticipationTurns()
        turns.accept(0.95, 1000); assertEquals("esperando alternancia", turns.state(1000))
        turns.accept(0.2, 2000); assertEquals("esperando alternancia", turns.state(2000))
        turns.accept(0.91, 3000); assertEquals("conversación candidata", turns.state(3000))
        assertEquals("evidencia insuficiente", turns.state(23001))
        turns.accept(0.7, 4000); assertEquals("evidencia insuficiente", turns.state(4000))
        turns.accept(0.91, 5000); turns.accept(0.9, 6000)
        assertEquals("esperando alternancia", turns.state(6000))
        turns.accept(Double.NaN, 7000); assertEquals("insuficiente", turns.voice)
    }
    @Test fun oldTransitionsCannotConfirmANewSingleAlternation() {
        val turns = LocalParticipationTurns()
        turns.accept(0.95, 1000); turns.accept(0.2, 2000); turns.accept(0.95, 3000)
        turns.accept(0.95, 15000); turns.accept(0.95, 25000); turns.accept(0.2, 26000)
        assertEquals("esperando alternancia", turns.state(26000))
    }
    @Test fun absentOrInvalidProfileNeverCapturesIdentityOrEnrollsAutomatically() {
        for (profile in listOf(null, floatArrayOf(0f, 0f), floatArrayOf(1f))) {
            val host = Host().apply { this.profile = profile }
            val session = LocalParticipationSession(host, testPlatform())
            assertTrue(session.start(false)); stopped(session)
            phrase(session)
            assertTrue(session.diagnostics().contains("sin perfil compatible"))
            assertEquals(0, host.embeddings); assertEquals(0, host.commits)
            assertTrue(session.diagnostics().contains("\"inputBufferedBytes\":0"))
        }
    }
    @Test fun enrollmentRequiresThreeCoherentSegmentsAndTenSecondsOfVadVoice() {
        val host = Host(); val session = LocalParticipationSession(host, testPlatform())
        assertTrue(session.start(true)); ready(session)
        phrase(session, 40); idle(session)
        phrase(session, 40); idle(session)
        phrase(session, 40); idle(session)
        assertEquals(0, host.commits) // Three phrases, only six seconds.
        host.vector = floatArrayOf(0f, 1f); phrase(session); idle(session)
        assertEquals(0, host.commits) // Inconsistent enrollment must not enter the centroid.
        host.vector = floatArrayOf(1f, 0f); phrase(session); stopped(session)
        assertEquals(1, host.commits); assertTrue(session.diagnostics().contains("\"profileSaved\":true"))
        assertTrue(host.prepared!!.all { it == 0f }); assertTrue(host.embeddedSamples!!.all { it == 0f })
        assertTrue(session.diagnostics().contains("\"inputBufferedBytes\":0"))
    }
    @Test fun silenceShortAndClippedSegmentsAbstainBeforeEmbedding() {
        val host = Host(); val session = LocalParticipationSession(host, testPlatform())
        assertTrue(session.start(false)); ready(session)
        phrase(session, 10); idle(session)
        phrase(session, 30, 0); idle(session)
        phrase(session, 30, 32767); idle(session)
        assertEquals(0, host.embeddings); assertEquals(0, host.commits)
        assertTrue(session.diagnostics().contains("\"abstentions\":3"))
        session.stop(); stopped(session)
    }
    @Test fun guidedEnrollmentCannotSaveBeforeFourAcceptedSamples() {
        val host = Host(); val session = LocalParticipationSession(host, testPlatform())
        assertTrue(session.start(true, 4)); ready(session)
        repeat(3) { phrase(session); idle(session) }
        assertEquals(0, host.commits) // Twelve seconds are insufficient until the fourth guided sample.
        assertTrue(session.diagnostics().contains("\"enrollmentSegments\":3"))
        phrase(session); stopped(session)
        assertEquals(1, host.commits); assertTrue(session.diagnostics().contains("\"profileSaved\":true"))
    }
    @Test fun offDuringEmbeddingDrainsWithoutPublishingAndNeverQueuesAudio() {
        val platform = testPlatform(); val embedded = Latch(1, platform); val finish = Latch(1, platform)
        val host = Host().apply { beforeEmbedding = { embedded.countDown(); finish.await(3000) } }
        val session = LocalParticipationSession(host, platform)
        assertTrue(session.start(false)); ready(session); phrase(session)
        assertTrue(embedded.await(2000)); phrase(session)
        assertTrue(session.diagnostics().contains("\"dropped\":1"))
        session.stop(); assertFalse(session.start(false)); finish.countDown(); stopped(session)
        assertEquals(1, host.embeddings); assertEquals(0, host.commits)
        assertTrue(host.embeddedSamples!!.all { it == 0f })
        assertTrue(session.diagnostics().contains("\"comparisons\":0"))
        assertTrue(session.diagnostics().contains("\"inputBufferedBytes\":0"))
    }
    @Test fun preemptionWhilePreparingProfileCannotCommitEvenAfterEncryptionCompletes() {
        val platform = testPlatform(); val prepared = Latch(1, platform); val finish = Latch(1, platform)
        val host = Host().apply { beforePrepare = { prepared.countDown(); finish.await(3000) } }
        val session = LocalParticipationSession(host, platform)
        assertTrue(session.start(true)); ready(session)
        repeat(2) { phrase(session); idle(session) }; phrase(session)
        assertTrue(prepared.await(2000)); session.resetStream(); finish.countDown(); idle(session)
        assertEquals(0, host.commits); assertTrue(host.prepared!!.all { it == 0f })
        assertTrue(session.diagnostics().contains("\"enrollmentMs\":0"))
        session.stop(); stopped(session)
    }
    @Test fun stopWhilePreparingProfileCannotPersistBiometrics() {
        val platform = testPlatform(); val prepared = Latch(1, platform); val finish = Latch(1, platform)
        val host = Host().apply { beforePrepare = { prepared.countDown(); finish.await(3000) } }
        val session = LocalParticipationSession(host, platform)
        assertTrue(session.start(true)); ready(session)
        repeat(2) { phrase(session); idle(session) }; phrase(session)
        assertTrue(prepared.await(2000)); session.stop(); finish.countDown(); stopped(session)
        assertEquals(0, host.commits); assertTrue(host.prepared!!.all { it == 0f })
        assertTrue(session.diagnostics().contains("\"profileSaved\":false"))
    }
}
