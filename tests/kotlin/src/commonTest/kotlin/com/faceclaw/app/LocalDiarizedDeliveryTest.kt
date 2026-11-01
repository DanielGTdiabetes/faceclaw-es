package com.faceclaw.app

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class LocalDiarizedDeliveryTest {
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
    private fun run(stopAfterFirst: Boolean): List<Pair<String, String>> {
        val platform = testPlatform()
        val delivered = Latch(if (stopAfterFirst) 1 else 2, platform)
        val host = object : LocalTranscriptHost {
            override val dispatcher = CallbackDispatcher { it() }
            override fun loadDecoder(language: LocalTranscriptLanguage) = object : LocalTranscriptDecoder {
                override fun decode(samples: FloatArray) = LocalDecodedText("Hola mundo", "es",
                    diarization = LocalDiarization(true, samples.size))
                override fun release() {}
            }
            override fun loadSpeakerAttributor() = object : LocalSpeakerAttributor {
                override val voices = 1
                override fun attribute(samples: FloatArray, voicedSamples: Int): LocalSpeakerLabel =
                    error("Must not use whole-window identity")
                override fun attributeDiarized(samples: FloatArray, decoded: LocalDecodedText) = listOf(
                    LocalSpeakerTurn("Hola", 100, 1500, LocalSpeakerLabel("portador", "portador"), 0, 4),
                    LocalSpeakerTurn("mundo", 2000, 3500, LocalSpeakerLabel("voz-1", "otro"), 5, 10))
                override fun release() {}
            }
        }
        val session = LocalTranscriptSession(host, platform)
        val texts = mutableListOf<Pair<String, String>>()
        session.setListener(object : FaceclawLocalTranscriptListener {
            override fun onText(text: String, language: String) { error("Expected timed speaker turns") }
            override fun onSpeakerSegment(text: String, language: String, startMs: Long, endMs: Long,
                speaker: String, relation: String) {
                assertTrue(endMs > startMs)
                texts.add(text to relation)
                if (stopAfterFirst) session.stop()
                delivered.countDown()
            }
        })
        assertTrue(session.start(LocalTranscriptLanguage.ES, LocalTranscriptSegmentation.WINDOWS, 120000,
            LocalTranscriptWindowPolicy.PAUSE, speakers = true))
        waitFor(session, "\"status\":\"listo\"")
        repeat(80) { session.acceptPcm(pcm(3000), "posible voz") }
        repeat(8) { session.acceptPcm(pcm(0), "sin actividad") }
        assertTrue(delivered.await(2000))
        session.stop(); waitFor(session, "\"worker\":false")
        return texts
    }
    @Test fun twoVoicesInOneWindowAreDeliveredAsTwoAlignedTurns() {
        assertEquals(listOf("Hola" to "portador", "mundo" to "otro"), run(false))
    }
    @Test fun offDuringFirstCallbackPreventsTheSecondTurnFromEscaping() {
        assertEquals(listOf("Hola" to "portador"), run(true))
    }
}
