package com.faceclaw.app

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * C1 origin attribution. Every test here fails if counters were attributed with the phase that is
 * current when the snapshot is read, or by subtracting snapshots taken at each mark.
 */
class LocalTranscriptPhaseTest {
    private fun pcm(value: Int = 2000): ByteArray = ByteArray(1600).also { bytes ->
        repeat(800) { bytes[it * 2] = value.toByte(); bytes[it * 2 + 1] = (value shr 8).toByte() }
    }

    /** Scripted decoder: each call returns the next output; calls listed in [blocked] wait for [finish]. */
    private class Harness(outputs: List<LocalDecodedText>, blocked: Set<Int> = emptySet(),
        retainCallbacks: Boolean = false, platform: ProtocolPlatform = testPlatform()) {
        val callbacks = mutableListOf<() -> Unit>()
        val texts = mutableListOf<String>()
        val languages = mutableListOf<LocalTranscriptLanguage>()
        val decoding = Latch(1, platform)
        val finish = Latch(1, platform)
        val released = Latch(1, platform)
        var calls = 0
        val session = LocalTranscriptSession(object : LocalTranscriptHost {
            override val dispatcher = CallbackDispatcher { if (retainCallbacks) callbacks.add(it) else it() }
            override fun loadDecoder(language: LocalTranscriptLanguage): LocalTranscriptDecoder {
                languages.add(language)
                return object : LocalTranscriptDecoder {
                    override fun decode(samples: FloatArray): LocalDecodedText {
                        val index = calls++
                        if (index in blocked) { decoding.countDown(); finish.await(2000) }
                        return outputs[index]
                    }
                    override fun release() { released.countDown() }
                }
            }
        }, platform)
        fun listen() = session.setListener(object : FaceclawLocalTranscriptListener {
            override fun onText(text: String, language: String) { texts.add(text) }
        })
        fun runCallbacks() { val pending = callbacks.toList(); callbacks.clear(); pending.forEach { it() } }
    }

    private fun segment(session: LocalTranscriptSession, voicedChunks: Int = 10) {
        repeat(voicedChunks) { session.acceptPcm(pcm(), "posible voz") }
        session.acceptPcm(pcm(0), "sin actividad")
    }

    private fun waitFor(session: LocalTranscriptSession, fragment: String, what: String) {
        val condition = testPlatform().createCondition()
        repeat(300) {
            if (session.diagnostics().contains(fragment)) return
            condition.withLock { condition.awaitMs(10) }
        }
        error("local test: $what")
    }
    private fun waitReady(s: LocalTranscriptSession) = waitFor(s, "\"status\":\"listo\"", "decoder not ready")
    private fun waitNotBusy(s: LocalTranscriptSession) = waitFor(s, "\"busy\":false", "decode did not finish")
    private fun waitStopped(s: LocalTranscriptSession) = waitFor(s, "\"worker\":false", "worker did not finish")

    private fun phase(json: String, name: String): String {
        val start = json.indexOf("{\"phase\":\"$name\"")
        require(start >= 0) { "missing phase $name" }
        return json.substring(start, json.indexOf('}', start) + 1)
    }
    private fun metric(json: String, name: String): Long =
        Regex("\"$name\":(\\d+)").find(json)?.groupValues?.get(1)?.toLong() ?: error("missing metric $name")
    private fun assertMetrics(json: String, expected: Map<String, Long>, label: String) {
        for ((name, value) in expected) assertEquals(value, metric(json, name), "$label.$name")
    }

    @Test fun k1InferenceFinishingInTheNextPhaseCountsInItsOrigin() {
        val h = Harness(listOf(LocalDecodedText("hola", "es")), blocked = setOf(0), retainCallbacks = true)
        h.listen(); assertTrue(h.session.start()); waitReady(h.session)
        h.session.setPhase(1)
        segment(h.session)
        assertTrue(h.decoding.await(2000))
        h.session.setPhase(2)
        h.finish.countDown(); waitNotBusy(h.session)
        h.runCallbacks()
        val report = h.session.diagnostics()
        assertMetrics(phase(report, "otra-persona"), mapOf("decodeCalls" to 1L, "accepted" to 1L,
            "delivered" to 1L, "deliveredChars" to 4L, "submittedAudioMs" to 550L), "otra-persona")
        assertMetrics(phase(report, "yo"), mapOf("decodeCalls" to 0L, "accepted" to 0L, "delivered" to 0L,
            "deliveredChars" to 0L, "submittedAudioMs" to 0L, "pcmAudioMs" to 0L), "yo")
        assertEquals(listOf("hola"), h.texts)
        h.session.stop(); assertTrue(h.released.await(2000)); waitStopped(h.session)
    }

    @Test fun k2DelayedCallbackOverwrittenSlotIsDiscardedInItsOwnPhase() {
        val h = Harness(listOf(LocalDecodedText("hola", "es"), LocalDecodedText("adiós", "es")), retainCallbacks = true)
        h.listen(); assertTrue(h.session.start()); waitReady(h.session)
        h.session.setPhase(1); segment(h.session); waitNotBusy(h.session)
        h.session.setPhase(2); segment(h.session); waitNotBusy(h.session)
        h.runCallbacks()
        val report = h.session.diagnostics()
        assertMetrics(phase(report, "otra-persona"), mapOf("accepted" to 1L, "delivered" to 0L, "deliveryDiscarded" to 1L), "otra-persona")
        assertMetrics(phase(report, "yo"), mapOf("accepted" to 1L, "delivered" to 1L, "deliveredChars" to 5L, "deliveryDiscarded" to 0L), "yo")
        assertEquals(listOf("adiós"), h.texts)
        assertEquals(metric(report, "accepted"), metric(report, "delivered") + metric(report, "deliveryDiscarded"))
        h.session.stop(); assertTrue(h.released.await(2000)); waitStopped(h.session)
    }

    @Test fun k2VariantBlockedSecondDecodeAndBusyDropKeepTheirPhases() {
        val h = Harness(listOf(LocalDecodedText("hola", "es"), LocalDecodedText("adiós", "es")),
            blocked = setOf(1), retainCallbacks = true)
        h.listen(); assertTrue(h.session.start()); waitReady(h.session)
        h.session.setPhase(1); segment(h.session); waitNotBusy(h.session)
        h.session.setPhase(2); segment(h.session); assertTrue(h.decoding.await(2000))
        segment(h.session) // Closes while busy: dropped, attributed to its own phase (yo).
        h.runCallbacks()
        var report = h.session.diagnostics()
        assertMetrics(phase(report, "otra-persona"), mapOf("delivered" to 1L, "dropped" to 0L), "otra-persona")
        assertMetrics(phase(report, "yo"), mapOf("decodeCalls" to 1L, "accepted" to 0L, "delivered" to 0L, "dropped" to 1L), "yo")
        h.finish.countDown(); waitNotBusy(h.session); h.runCallbacks()
        report = h.session.diagnostics()
        assertMetrics(phase(report, "yo"), mapOf("accepted" to 1L, "delivered" to 1L), "yo")
        assertEquals(listOf("hola", "adiós"), h.texts)
        h.session.stop(); assertTrue(h.released.await(2000)); waitStopped(h.session)
    }

    @Test fun k3SegmentOpenAtTheMarkIsMixedIncludingPreRoll() {
        val h = Harness(listOf(LocalDecodedText("una frase", "es")))
        h.listen(); assertTrue(h.session.start()); waitReady(h.session)
        h.session.setPhase(1)
        repeat(4) { h.session.acceptPcm(pcm(0), "sin actividad") } // 200 ms pre-roll in phase 1.
        repeat(8) { h.session.acceptPcm(pcm(), "posible voz") }    // 400 ms in phase 1.
        h.session.setPhase(2)
        repeat(8) { h.session.acceptPcm(pcm(), "posible voz") }    // 400 ms in phase 2.
        repeat(11) { h.session.acceptPcm(pcm(0), "pausa") }        // 550 ms in phase 2.
        h.session.acceptPcm(pcm(0), "sin actividad")               // 50 ms closes it.
        waitNotBusy(h.session)
        val report = h.session.diagnostics()
        assertTrue(report.contains("\"mixedAudioMsByPhase\":[0,600,1000,0,0]"), report)
        assertMetrics(phase(report, "mixta"), mapOf("submittedAudioMs" to 1600L, "decodeCalls" to 1L,
            "accepted" to 1L, "delivered" to 1L), "mixta")
        assertMetrics(phase(report, "otra-persona"), mapOf("submittedAudioMs" to 0L, "decodeCalls" to 0L, "pcmAudioMs" to 600L), "otra-persona")
        assertMetrics(phase(report, "yo"), mapOf("submittedAudioMs" to 0L, "decodeCalls" to 0L, "pcmAudioMs" to 1000L), "yo")
        h.session.stop(); assertTrue(h.released.await(2000)); waitStopped(h.session)
    }

    @Test fun k4OffDuringDrainKeepsAggregatesUntilNextStartWithoutText() {
        val h = Harness(listOf(LocalDecodedText("tarde", "es"), LocalDecodedText("x", "es")), blocked = setOf(0))
        h.listen(); assertTrue(h.session.start()); waitReady(h.session)
        h.session.setPhase(1); segment(h.session); assertTrue(h.decoding.await(2000))
        h.session.stop()
        assertTrue(h.session.diagnostics().contains("\"worker\":true")) // Draining: figures not final yet.
        h.finish.countDown(); assertTrue(h.released.await(2000)); waitStopped(h.session)
        val report = h.session.diagnostics()
        assertMetrics(phase(report, "otra-persona"), mapOf("decodeCalls" to 1L, "invalidatedDecodes" to 1L,
            "accepted" to 0L, "delivered" to 0L), "otra-persona")
        assertTrue(h.texts.isEmpty())
        assertTrue(h.session.start()); waitReady(h.session)
        assertEquals(0L, metric(phase(h.session.diagnostics(), "otra-persona"), "decodeCalls"))
        h.session.stop(); waitStopped(h.session)
    }

    @Test fun k5ResetStopListenerlessAndDeadlineDiscardsAreCountedOnce() {
        // Reset with a queued publication.
        var h = Harness(listOf(LocalDecodedText("hola", "es")), retainCallbacks = true)
        h.listen(); assertTrue(h.session.start()); waitReady(h.session)
        h.session.setPhase(1); segment(h.session); waitNotBusy(h.session)
        h.session.resetStream(); h.runCallbacks()
        var report = h.session.diagnostics()
        assertMetrics(phase(report, "otra-persona"), mapOf("accepted" to 1L, "delivered" to 0L, "deliveryDiscarded" to 1L), "reset")
        assertTrue(h.texts.isEmpty())
        h.session.stop(); waitStopped(h.session)
        assertEquals(1L, metric(phase(h.session.diagnostics(), "otra-persona"), "deliveryDiscarded"), "stop/finally must not recount")

        // Stop with a queued publication; the worker finally must not count it again.
        h = Harness(listOf(LocalDecodedText("hola", "es")), retainCallbacks = true)
        h.listen(); assertTrue(h.session.start()); waitReady(h.session)
        h.session.setPhase(2); segment(h.session); waitNotBusy(h.session)
        h.session.stop(); waitStopped(h.session); h.runCallbacks()
        report = h.session.diagnostics()
        assertMetrics(phase(report, "yo"), mapOf("accepted" to 1L, "delivered" to 0L, "deliveryDiscarded" to 1L), "stop")

        // Consumption without listener is not a delivery.
        h = Harness(listOf(LocalDecodedText("hola", "es")))
        assertTrue(h.session.start()); waitReady(h.session)
        h.session.setPhase(3); segment(h.session); waitNotBusy(h.session)
        report = h.session.diagnostics()
        assertMetrics(phase(report, "referencia"), mapOf("accepted" to 1L, "delivered" to 0L, "deliveryDiscarded" to 1L), "no listener")
        h.session.stop(); waitStopped(h.session)
    }

    @Test fun k5DeadlineInNextJobDiscardsPendingResultOnce() {
        val real = testPlatform()
        val clock = object : ProtocolPlatform by real {
            @Volatile var now = 1000L
            override fun elapsedRealtimeMs(): Long = now
        }
        val h = Harness(listOf(LocalDecodedText("hola", "es")), retainCallbacks = true, platform = clock)
        h.listen(); assertTrue(h.session.start()); waitReady(h.session)
        h.session.setPhase(1); segment(h.session); waitNotBusy(h.session)
        clock.now = 122000L // Worker notices the deadline in nextJob() with the result still queued.
        waitStopped(h.session); h.runCallbacks()
        val report = h.session.diagnostics()
        assertMetrics(phase(report, "otra-persona"), mapOf("accepted" to 1L, "delivered" to 0L, "deliveryDiscarded" to 1L), "deadline")
        assertTrue(h.texts.isEmpty())
    }

    @Test fun k6ForcedSpanishCountsForcedLabelsAndRejectsOtherExplicitLanguagesIncludingCa() {
        val outputs = listOf("", "es", "en", "ca").map { localDecodedText("hola", it, LocalTranscriptLanguage.ES) }
        val h = Harness(outputs)
        h.listen(); assertTrue(h.session.start(LocalTranscriptLanguage.ES)); waitReady(h.session)
        repeat(4) { segment(h.session); waitNotBusy(h.session) }
        val report = h.session.diagnostics()
        assertMetrics(report, mapOf("languageForced" to 2L, "forcedMismatch" to 2L, "rejectedLanguage" to 2L,
            "languageEs" to 0L, "languageCa" to 0L, "languageOther" to 0L, "accepted" to 2L, "delivered" to 2L), "forced")
        assertTrue(report.contains("\"languageMode\":\"es\""))
        assertEquals(listOf("hola", "hola"), h.texts)
        assertEquals(listOf(LocalTranscriptLanguage.ES), h.languages)
        h.session.stop(); waitStopped(h.session)
    }

    @Test fun forcedNormalizationAndSharedFilterAreTestableWithoutTheDevice() {
        assertEquals("es", normalizeForcedLanguage(""))
        assertEquals("es", normalizeForcedLanguage(null))
        assertEquals("es", normalizeForcedLanguage(" es "))
        assertEquals("en", normalizeForcedLanguage("en"))
        assertEquals("ca", normalizeForcedLanguage("ca"))
        val forced = { raw: String -> localDecodedText("Bon dia", raw, LocalTranscriptLanguage.ES) }
        assertEquals(LocalTextRejection.NONE, localTextRejection(forced("")))
        assertEquals(LocalTextRejection.NONE, localTextRejection(forced("es")))
        assertEquals(LocalTextRejection.LANGUAGE, localTextRejection(forced("en")))
        assertEquals(LocalTextRejection.LANGUAGE, localTextRejection(forced("ca")))
        // Automatic mode keeps the previous filter: es/ca accepted, empty or other rejected, never forced.
        val auto = { raw: String -> localDecodedText("Bon dia", raw, LocalTranscriptLanguage.AUTO) }
        assertFalse(auto("ca").forced)
        assertEquals(LocalTextRejection.NONE, localTextRejection(auto("ca")))
        assertEquals(LocalTextRejection.NONE, localTextRejection(auto("es")))
        assertEquals(LocalTextRejection.LANGUAGE, localTextRejection(auto("")))
        assertEquals(LocalTextRejection.LANGUAGE, localTextRejection(auto("en")))
    }

    @Test fun rejectedStartWhileLoadingCannotChangeTheLoadingWorkerLanguage() {
        val platform = testPlatform()
        val loading = Latch(1, platform); val proceed = Latch(1, platform)
        val languages = mutableListOf<LocalTranscriptLanguage>()
        val session = LocalTranscriptSession(object : LocalTranscriptHost {
            override val dispatcher = CallbackDispatcher { it() }
            override fun loadDecoder(language: LocalTranscriptLanguage): LocalTranscriptDecoder {
                languages.add(language); loading.countDown(); proceed.await(2000)
                return object : LocalTranscriptDecoder {
                    override fun decode(samples: FloatArray) = LocalDecodedText("", "es")
                    override fun release() {}
                }
            }
        }, platform)
        assertTrue(session.start(LocalTranscriptLanguage.AUTO)); assertTrue(loading.await(2000))
        assertFalse(session.start(LocalTranscriptLanguage.ES))
        assertTrue(session.diagnostics().contains("\"languageMode\":\"auto\""))
        proceed.countDown(); waitReady(session)
        assertEquals(listOf(LocalTranscriptLanguage.AUTO), languages)
        session.stop(); waitStopped(session)
        assertTrue(session.start(LocalTranscriptLanguage.ES)); waitReady(session)
        assertEquals(listOf(LocalTranscriptLanguage.AUTO, LocalTranscriptLanguage.ES), languages)
        assertTrue(session.diagnostics().contains("\"languageMode\":\"es\""))
        session.stop(); waitStopped(session)
    }

    @Test fun invalidPhaseIsIgnoredAndDiagnosticsCarryNoText() {
        val h = Harness(listOf(LocalDecodedText("zanahoria secreta", "es")))
        h.listen(); assertTrue(h.session.start()); waitReady(h.session)
        h.session.setPhase(2); h.session.setPhase(9); h.session.setPhase(-1)
        segment(h.session); waitNotBusy(h.session)
        val report = h.session.diagnostics()
        assertEquals(1L, metric(phase(report, "yo"), "delivered"))
        assertFalse(report.contains("zanahoria"))
        assertEquals(listOf("zanahoria secreta"), h.texts)
        h.session.stop(); waitStopped(h.session)
    }

    @Test fun bufferPhaseCountersMatchTotalsAndDefaultPhaseKeepsParticipationBehaviour() {
        val buffer = LocalTranscriptBuffer { it.fill(0) }
        repeat(3) { buffer.accept(pcm(), "posible voz") }
        buffer.accept(pcm(0), "sin actividad") // short, default phase 0
        repeat(6) { buffer.accept(pcm(), "posible voz", 1) }
        buffer.accept(pcm(0), "sin actividad", 1)
        repeat(6) { buffer.accept(pcm(), "posible voz", 2) }
        buffer.reset() // interrupted in phase 2
        assertEquals(1L, metric(buffer.phaseDiagnostics(0), "shortSegments"))
        assertEquals(1L, metric(buffer.phaseDiagnostics(1), "silenceClosures"))
        assertEquals(350L, metric(buffer.phaseDiagnostics(1), "submittedAudioMs"))
        assertEquals(1L, metric(buffer.phaseDiagnostics(2), "interruptedSegments"))
        assertEquals(300L, metric(buffer.phaseDiagnostics(2), "interruptedAudioMs"))
        assertEquals(350L, metric(buffer.diagnostics(), "submittedAudioMs"))
        assertEquals(1L, metric(buffer.diagnostics(), "interruptedSegments"))
    }
}
