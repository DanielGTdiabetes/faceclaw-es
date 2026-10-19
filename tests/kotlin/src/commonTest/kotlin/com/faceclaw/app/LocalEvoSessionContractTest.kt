package com.faceclaw.app

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Contract v3 on the phone: session voices, word alignment, loss counters and window context. */
class LocalEvoSessionContractTest {
    private val audio = FloatArray(96000)
    private fun decoded(text: String, words: List<LocalTimedWord>, intervals: List<LocalVoiceInterval>) =
        LocalDecodedText(text, "es", diarization = LocalDiarization(true, audio.size, words, intervals, identity = true))
    private fun w(text: String, start: Long, end: Long) = LocalTimedWord(text, start, end)
    private fun span(local: String, start: Long, end: Long, relation: String, id: String?, state: String? = "confirmado") =
        LocalVoiceInterval(local, start, end, relation, id, state)

    @Test fun distinctForeignSessionVoicesKeepDistinctLabelsAndUnknownCarriesNoSpeaker() {
        val mapper = LocalEvoSpeakerAttributor()
        val turns = mapper.attributeDiarized(audio, decoded("uno dos tres cuatro",
            listOf(w("uno", 100, 900), w("dos", 1100, 1900), w("tres", 2100, 2900), w("cuatro", 3100, 3900)),
            listOf(span("v3-0", 0, 1000, "otro", "h2"), span("v3-1", 1000, 2000, "otro", "h3"),
                span("v3-0", 2000, 3000, "portador", "h1"), span("v3-2", 3000, 4000, "desconocido", "h4", "pendiente"))))
        assertEquals(listOf("voz-1" to "otro", "voz-2" to "otro", "portador" to "portador", null to "desconocido"),
            turns.map { it.label.speaker to it.label.relation })
        assertEquals(2, mapper.voices)
        // Same session voice in a later window keeps its label even with another local V3 number.
        val later = mapper.attributeDiarized(audio, decoded("cinco", listOf(w("cinco", 100, 900)),
            listOf(span("v3-5", 0, 1000, "otro", "h3"))))
        assertEquals("voz-2", later.single().label.speaker)
        val report = mapper.report()!!
        assertEquals("ok", report.status); assertEquals(1, report.other)
    }

    @Test fun wordCrossingFragmentsOfOneVoiceKeepsItButTwoVoicesStayUnknown() {
        val mapper = LocalEvoSpeakerAttributor()
        val same = mapper.attributeDiarized(audio, decoded("hola", listOf(w("hola", 900, 1300)),
            listOf(span("v3-0", 0, 1000, "portador", "h1"), span("v3-0", 1000, 2000, "portador", "h1"))))
        assertEquals("portador", same.single().label.relation)
        val mixed = mapper.attributeDiarized(audio, decoded("hola", listOf(w("hola", 900, 1300)),
            listOf(span("v3-0", 0, 1000, "portador", "h1"), span("v3-1", 1000, 2000, "otro", "h2"))))
        assertEquals(LocalSpeakerLabel.UNKNOWN, mixed.single().label)
        assertEquals(mapOf("multiple" to 1), mapper.report()!!.loss)
        val gap = mapper.attributeDiarized(audio, decoded("hola", listOf(w("hola", 900, 1300)),
            listOf(span("v3-0", 0, 1000, "portador", "h1"))))
        assertEquals(LocalSpeakerLabel.UNKNOWN, gap.single().label)
        assertEquals(mapOf("coverage" to 1), mapper.report()!!.loss)
    }

    @Test fun everyLossHasItsOwnReason() {
        val mapper = LocalEvoSpeakerAttributor()
        val base = decoded("hola", listOf(w("hola", 100, 900)), listOf(span("v3-0", 0, 1000, "portador", "h1")))
        val d = base.diarization ?: error("fixture")
        fun reason(value: LocalDecodedText, samples: FloatArray = audio): String {
            assertTrue(mapper.attributeDiarized(samples, value).all { it.label == LocalSpeakerLabel.UNKNOWN })
            return mapper.report()!!.loss.keys.single()
        }
        assertEquals("contract", reason(base.copy(diarization = d.copy(identity = false))))
        assertEquals("samples", reason(base, FloatArray(10)))
        assertEquals("nowords", reason(base.copy(diarization = d.copy(words = emptyList()))))
        assertEquals("text", reason(base.copy(text = "adiós")))
        assertEquals("times", reason(base.copy(diarization = d.copy(words = listOf(w("hola", 900, 100))))))
        assertEquals("contract", reason(base.copy(diarization = d.copy(
            intervals = listOf(span("v3-0", 0, 1000, "portador", "Juan"))))))
        assertEquals("invalid", mapper.report()!!.status)
    }

    @Test fun reportJsonHasOnlyCounters() {
        val json = LocalAttributionReport("ok", 4, 1, 2, 1, 3, mapOf("coverage" to 1, "multiple" to 0)).toJson(7)
        assertEquals("{\"seq\":7,\"status\":\"ok\",\"words\":4,\"portador\":1,\"otro\":2,\"desconocido\":1,\"turns\":3,\"loss\":{\"coverage\":1}}", json)
    }

    @Test fun v2AnswersKeepTheOldSingleForeignLabel() {
        val mapper = LocalEvoSpeakerAttributor()
        val turns = mapper.attributeDiarized(audio, decoded("uno dos", listOf(w("uno", 100, 900), w("dos", 1100, 1900)),
            listOf(span("v3-0", 0, 1000, "otro", null, null), span("v3-1", 1000, 2000, "otro", null, null))))
        assertEquals(listOf("voz-1"), turns.map { it.label.speaker })
        assertEquals(1, mapper.voices)
    }

    // -- window context ---------------------------------------------------------------------------------
    private fun waitFor(session: LocalTranscriptSession, value: String) {
        val lock = testPlatform().createCondition()
        repeat(300) {
            if (session.diagnostics().contains(value)) return
            lock.withLock { lock.awaitMs(10) }
        }
        error("Session did not reach $value")
    }
    private fun pcm(value: Int) = ByteArray(1600).also { bytes ->
        repeat(800) { i ->
            val x = if (i % 2 == 0) value else -value
            bytes[i * 2] = x.toByte(); bytes[i * 2 + 1] = (x shr 8).toByte()
        }
    }

    private class Recorder : LocalTranscriptDecoder {
        val windows = mutableListOf<Pair<LocalWindowContext?, Int>>()
        override fun decode(samples: FloatArray) = error("the session must pass the window context")
        override fun decode(samples: FloatArray, window: LocalWindowContext?): LocalDecodedText {
            windows.add(window to samples.size)
            return LocalDecodedText("Hola mundo", "es", diarization = LocalDiarization(true, samples.size,
                listOf(LocalTimedWord("Hola", 100, 600), LocalTimedWord("mundo", 700, 1200)),
                listOf(LocalVoiceInterval("v3-0", 0, 1300, "portador", "h1", "provisional")), identity = true))
        }
        override fun release() {}
    }

    private fun session(speakers: Boolean): Triple<LocalTranscriptSession, Recorder, Latch> {
        val platform = testPlatform()
        val recorder = Recorder()
        val delivered = Latch(2, platform)
        val host = object : LocalTranscriptHost {
            override val dispatcher = CallbackDispatcher { it() }
            override fun loadDecoder(language: LocalTranscriptLanguage) = recorder
            override fun loadSpeakerAttributor(): LocalSpeakerAttributor = LocalEvoSpeakerAttributor()
        }
        val session = LocalTranscriptSession(host, platform)
        session.setListener(object : FaceclawLocalTranscriptListener {
            override fun onText(text: String, language: String) { delivered.countDown() }
            override fun onSegment(text: String, language: String, startMs: Long, endMs: Long) { delivered.countDown() }
            override fun onSpeakerSegment(text: String, language: String, startMs: Long, endMs: Long,
                speaker: String, relation: String) { delivered.countDown() }
        })
        assertTrue(session.start(LocalTranscriptLanguage.ES, LocalTranscriptSegmentation.WINDOWS, 120000,
            LocalTranscriptWindowPolicy.PAUSE, speakers = speakers))
        waitFor(session, "\"status\":\"listo\"")
        return Triple(session, recorder, delivered)
    }

    private fun speak(session: LocalTranscriptSession) {
        repeat(40) { session.acceptPcm(pcm(3000), "posible voz") }
        repeat(8) { session.acceptPcm(pcm(0), "sin actividad") }
        waitFor(session, "\"busy\":false")
    }

    @Test fun windowsCarryOneEphemeralSessionSequenceCaptureTimesAndThePreviousReport() {
        val (session, recorder, _) = session(speakers = true)
        speak(session); speak(session)
        val (first, firstSize) = recorder.windows[0]; val (second, _) = recorder.windows[1]
        first!!; second!!
        assertTrue(Regex("^[0-9a-f]{32}$").matches(first.sessionId))
        assertEquals(first.sessionId, second.sessionId)
        assertEquals(listOf(1L, 2L), listOf(first.seq, second.seq))
        assertEquals(firstSize * 1000L / 16000, first.endMs - first.startMs)
        assertTrue(second.startMs >= first.endMs)
        assertTrue(first.voices); assertNull(first.report)
        assertTrue(second.report!!.startsWith("{\"seq\":1,\"status\":\"ok\",\"words\":2,\"portador\":2"))
        session.resetStream(); speak(session)
        val third = recorder.windows[2].first!!
        assertNotEquals(first.sessionId, third.sessionId)
        assertEquals(1L, third.seq); assertNull(third.report)
        session.stop(); waitFor(session, "\"worker\":false")
    }

    @Test fun voicesOffIsReportedWithoutAttribution() {
        val (session, recorder, _) = session(speakers = false)
        speak(session); speak(session)
        val second = recorder.windows[1].first!!
        assertEquals(false, second.voices)
        assertTrue(second.report!!.contains("\"status\":\"off\""))
        session.stop(); waitFor(session, "\"worker\":false")
    }
}
