package com.faceclaw.app

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class LocalSpeakerAttributionTest {
    private val pause = LocalTranscriptWindowPolicy.PAUSE

    // Alternating +/-level square wave: RMS equals the level. Synthetic, not human speech.
    private fun pcm(level: Int) = ByteArray(1600).also { bytes ->
        repeat(800) { i ->
            val value = if (i % 2 == 0) level else -level
            bytes[i * 2] = value.toByte(); bytes[i * 2 + 1] = (value shr 8).toByte()
        }
    }
    private val loud = 3000   // ~-21 dBFS
    private val quiet = 8     // ~-72 dBFS, below the pause voice level
    private val faint = 120   // ~-49 dBFS: above the pause voice level, below a typical VAD onset

    private fun pauseBuffer(windows: MutableList<ShortArray>, voiced: MutableList<Int> = mutableListOf(),
        canSubmit: () -> Boolean = { true }) =
        LocalTranscriptBuffer(segmentInfo = { voiced.add(it) }, canSubmit = canSubmit) { windows.add(it) }.also {
            it.resetMetrics(LocalTranscriptSegmentation.WINDOWS, pause)
        }

    @Test fun pausePolicyIsValidSelectableAndDistinctFromTheHopPolicies() {
        assertTrue(LocalTranscriptWindowPolicy.isValid(pause))
        assertTrue(pause.closesOnPause)
        assertEquals(pause, LocalTranscriptWindowPolicy.byId("pause-2-12"))
        assertFalse(LocalTranscriptWindowPolicy.REFERENCE.closesOnPause)
        assertEquals(16000, pause.overlapSamples)
    }

    @Test fun aPhraseFollowedByAPauseIsOneWindowWithoutCarryOver() {
        val windows = mutableListOf<ShortArray>(); val voiced = mutableListOf<Int>()
        val buffer = pauseBuffer(windows, voiced)
        repeat(40) { buffer.accept(pcm(quiet), "sin actividad") }          // 2 s of silence before speech
        repeat(60) { buffer.accept(pcm(loud), "posible voz") }             // 3 s phrase
        repeat(7) { buffer.accept(pcm(quiet), "pausa") }
        assertEquals(0, windows.size)                                      // 350 ms: still the same phrase
        buffer.accept(pcm(quiet), "pausa")
        assertEquals(1, windows.size)
        // 0.5 s pre-roll + 3 s phrase + 400 ms quiet tail; the earlier silence was trimmed.
        assertEquals(8000 + 48000 + 6400, windows[0].size)
        assertEquals(quiet.toShort(), windows[0][0]); assertEquals(loud.toShort(), windows[0][8000])
        assertEquals(listOf(48000), voiced)
        assertEquals(0, buffer.bufferedBytes())
        assertTrue(buffer.diagnostics().contains("\"silenceClosures\":1,\"limitClosures\":0"))
        assertTrue(buffer.diagnostics().contains("\"quietSkippedAudioMs\":1500"))
    }

    @Test fun silenceAndVadQuietLowLevelAudioAreNeverDecoded() {
        val windows = mutableListOf<ShortArray>()
        val buffer = pauseBuffer(windows)
        repeat(600) { buffer.accept(pcm(quiet), "sin actividad") }        // 30 s
        assertEquals(0, windows.size)
        assertTrue(buffer.bufferedBytes() <= LocalTranscriptBuffer.PAUSE_PRE_SAMPLES * 2)
    }

    @Test fun faintSpeechTheVadMissesStillReachesAWindow() {
        val windows = mutableListOf<ShortArray>()
        val buffer = pauseBuffer(windows)
        repeat(240) { buffer.accept(pcm(faint), "sin actividad") }        // 12 s, VAD never fires
        assertEquals(1, windows.size)
        assertEquals(16000 * 12, windows[0].size)
        assertEquals(faint.toShort(), windows[0][0])
    }

    @Test fun shortPausesInsideAPhraseDoNotSplitItAndTheLimitKeepsOneSecondOverlap() {
        val windows = mutableListOf<ShortArray>()
        val buffer = pauseBuffer(windows)
        repeat(13) {                                                        // 13 s of speech with 200 ms gaps
            repeat(16) { buffer.accept(pcm(loud), "posible voz") }
            repeat(4) { buffer.accept(pcm(quiet), "pausa") }
        }
        assertEquals(1, windows.size)
        assertEquals(16000 * 12, windows[0].size)
        // The next window starts with the last second of the first one.
        repeat(8) { buffer.accept(pcm(quiet), "sin actividad") }
        assertEquals(2, windows.size)
        assertTrue(windows[0].takeLast(16000) == windows[1].take(16000))
        assertTrue(buffer.diagnostics().contains("\"silenceClosures\":1,\"limitClosures\":1"))
    }

    @Test fun aBusyDecoderDefersThePauseCloseInsteadOfDroppingAudio() {
        val windows = mutableListOf<ShortArray>()
        var idle = false
        val buffer = pauseBuffer(windows) { idle }
        repeat(60) { buffer.accept(pcm(loud), "posible voz") }
        repeat(20) { buffer.accept(pcm(quiet), "sin actividad") }
        assertEquals(0, windows.size)
        repeat(20) { buffer.accept(pcm(loud), "posible voz") }
        idle = true
        repeat(8) { buffer.accept(pcm(quiet), "sin actividad") }
        assertEquals(1, windows.size)
        assertEquals((60 + 20 + 20 + 8) * 800, windows[0].size)
    }

    @Test fun repetitiveWhisperLoopsAreRejectedButNaturalRepetitionIsKept() {
        for (loop in listOf("y luego y luego y luego y luego", "sí sí sí sí sí sí",
            "gracias gracias gracias gracias gracias",
            "vale vale ya ya vale vale ya ya vale vale ya ya vale")) {
            assertTrue(isRepetitiveWhisperText(loop), loop)
            assertEquals(LocalTextRejection.HALLUCINATION, localTextRejection(LocalDecodedText(loop, "es")), loop)
        }
        for (natural in listOf("no, no, no, eso no es así", "sí, sí, sí, ya voy", "muy bien",
            "mañana vamos a la playa y luego comemos en casa de mi madre",
            "Bon dia, com estàs? Molt bé, gràcies.")) {
            assertFalse(isRepetitiveWhisperText(natural), natural)
            assertEquals(LocalTextRejection.NONE, localTextRejection(LocalDecodedText(natural, "es")), natural)
        }
    }

    private class FakeVoices(override val dimension: Int = 3) : LocalVoiceDecoder {
        val queue = ArrayDeque<FloatArray?>()
        var released = false
        override fun embed(samples: FloatArray): FloatArray? = queue.removeFirst()?.copyOf()
        override fun release() { released = true }
    }
    private fun v(vararg x: Float) = floatArrayOf(*x)
    private val second = FloatArray(16000)

    @Test fun trackerSeparatesTheWearerFromSessionVoicesAndAbstainsWhenUnsure() {
        val voices = FakeVoices()
        val tracker = LocalSpeakerTracker(voices, v(1f, 0f, 0f))
        voices.queue.addAll(listOf(v(0.95f, 0.1f, 0f), v(0f, 1f, 0f), v(0f, 0.95f, 0.2f), v(0f, 0f, 1f),
            v(0.7f, 0.7f, 0f), null))
        assertEquals(LocalSpeakerLabel("portador", "portador"), tracker.attribute(second, 16000))
        assertEquals(LocalSpeakerLabel("voz-1", "otro"), tracker.attribute(second, 16000))
        assertEquals(LocalSpeakerLabel("voz-1", "otro"), tracker.attribute(second, 16000))
        assertEquals(LocalSpeakerLabel("voz-2", "otro"), tracker.attribute(second, 16000))
        assertEquals(LocalSpeakerLabel.UNKNOWN, tracker.attribute(second, 16000))   // cos 0.71 with the wearer
        assertEquals(LocalSpeakerLabel.UNKNOWN, tracker.attribute(second, 16000))   // no embedding
        assertEquals(LocalSpeakerLabel.UNKNOWN, tracker.attribute(second, 15999))   // under 1 s of voice
        assertEquals(2, tracker.voices)
        tracker.release()
        assertTrue(voices.released); assertEquals(0, tracker.voices)
    }

    @Test fun withoutAProfileVoicesAreClusteredButNeverCalledTheWearer() {
        val voices = FakeVoices()
        val tracker = LocalSpeakerTracker(voices, null)
        voices.queue.addAll(listOf(v(1f, 0f, 0f), v(0f, 1f, 0f), v(0.98f, 0.05f, 0f)))
        assertEquals(LocalSpeakerLabel("voz-1", "desconocido"), tracker.attribute(second, 16000))
        assertEquals(LocalSpeakerLabel("voz-2", "desconocido"), tracker.attribute(second, 16000))
        assertEquals(LocalSpeakerLabel("voz-1", "desconocido"), tracker.attribute(second, 16000))
    }

    @Test fun sessionVoicesAreBounded() {
        val voices = FakeVoices(dimension = 8)
        val tracker = LocalSpeakerTracker(voices, null)
        repeat(LocalSpeakerTracker.MAX_VOICES + 1) { i -> voices.queue.add(FloatArray(8) { if (it == i) 1f else 0f }) }
        repeat(LocalSpeakerTracker.MAX_VOICES) { assertEquals("voz-${it + 1}", tracker.attribute(second, 16000).speaker) }
        assertNull(tracker.attribute(second, 16000).speaker)
        assertEquals(LocalSpeakerTracker.MAX_VOICES, tracker.voices)
    }

    private class LabelHost(platform: ProtocolPlatform, private val attributor: LocalSpeakerAttributor?) : LocalTranscriptHost {
        val voicedSeen = mutableListOf<Int>()
        override val dispatcher = CallbackDispatcher { it() }
        override fun loadDecoder(language: LocalTranscriptLanguage) = object : LocalTranscriptDecoder {
            override fun decode(samples: FloatArray) = LocalDecodedText("Hola, ¿qué tal?", "es", true)
            override fun release() {}
        }
        override fun loadSpeakerAttributor(): LocalSpeakerAttributor? = attributor?.let { inner ->
            object : LocalSpeakerAttributor by inner {
                override fun attribute(samples: FloatArray, voicedSamples: Int): LocalSpeakerLabel {
                    voicedSeen.add(voicedSamples); return inner.attribute(samples, voicedSamples)
                }
            }
        }
    }

    private fun waitFor(session: LocalTranscriptSession, text: String) {
        val condition = testPlatform().createCondition()
        repeat(300) {
            if (session.diagnostics().contains(text)) return
            condition.withLock { condition.awaitMs(10) }
        }
        error("worker did not reach $text: ${session.diagnostics()}")
    }

    @Test fun aSpeakerSessionDeliversLabelledWindowsAndEraseItsVoicesOnStop() {
        val platform = testPlatform()
        val voices = FakeVoices()
        voices.queue.addAll(listOf(v(1f, 0f, 0f), v(0f, 1f, 0f)))
        val host = LabelHost(platform, LocalSpeakerTracker(voices, v(1f, 0f, 0f)))
        val delivered = Latch(2, platform)
        val labels = mutableListOf<Pair<String, String>>()
        val session = LocalTranscriptSession(host, platform)
        session.setListener(object : FaceclawLocalTranscriptListener {
            override fun onText(text: String, language: String) { error("expected a labelled window") }
            override fun onSpeakerSegment(text: String, language: String, startMs: Long, endMs: Long, speaker: String, relation: String) {
                labels.add(speaker to relation); delivered.countDown()
            }
        })
        assertTrue(session.start(LocalTranscriptLanguage.ES, LocalTranscriptSegmentation.WINDOWS, 120000, pause, speakers = true))
        waitFor(session, "\"status\":\"listo\"")
        waitFor(session, "\"speakers\":{\"status\":\"activo\"")
        repeat(2) {
            repeat(40) { session.acceptPcm(pcm(loud), "posible voz") }
            repeat(8) { session.acceptPcm(pcm(quiet), "sin actividad") }
            waitFor(session, "\"busy\":false")
        }
        assertTrue(delivered.await(2000))
        assertEquals(listOf("portador" to "portador", "voz-1" to "otro"), labels)
        assertEquals(listOf(32000, 32000), host.voicedSeen)
        assertTrue(session.diagnostics().contains("\"voices\":1,\"wearer\":1,\"other\":1,\"clustered\":0,\"unknown\":0,\"errors\":0"))
        session.stop(); waitFor(session, "\"worker\":false")
        assertTrue(voices.released)
    }

    @Test fun speakersNeedAPausePolicyAndAMissingModelKeepsTextAnonymous() {
        val platform = testPlatform()
        val rejected = LocalTranscriptSession(LabelHost(platform, null), platform)
        assertFalse(rejected.start(LocalTranscriptLanguage.ES, LocalTranscriptSegmentation.WINDOWS, 120000,
            LocalTranscriptWindowPolicy.REFERENCE, speakers = true))
        assertFalse(rejected.isWorkerActive())

        val delivered = Latch(1, platform)
        var anonymous = 0
        val session = LocalTranscriptSession(LabelHost(platform, null), platform)
        session.setListener(object : FaceclawLocalTranscriptListener {
            override fun onText(text: String, language: String) { error("expected a window") }
            override fun onSegment(text: String, language: String, startMs: Long, endMs: Long) { anonymous++; delivered.countDown() }
            override fun onSpeakerSegment(text: String, language: String, startMs: Long, endMs: Long, speaker: String, relation: String) {
                error("no attributor: windows stay anonymous")
            }
        })
        assertTrue(session.start(LocalTranscriptLanguage.ES, LocalTranscriptSegmentation.WINDOWS, 120000, pause, speakers = true))
        waitFor(session, "\"speakers\":{\"status\":\"no disponible\"")
        repeat(40) { session.acceptPcm(pcm(loud), "posible voz") }
        repeat(8) { session.acceptPcm(pcm(quiet), "sin actividad") }
        assertTrue(delivered.await(2000)); assertEquals(1, anonymous)
        session.stop(); waitFor(session, "\"worker\":false")
    }
}
