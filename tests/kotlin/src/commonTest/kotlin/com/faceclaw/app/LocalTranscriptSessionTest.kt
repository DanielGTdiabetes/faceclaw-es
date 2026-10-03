package com.faceclaw.app

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class LocalTranscriptSessionTest {
    private fun pcm(value: Int = 2000): ByteArray = ByteArray(1600).also { bytes ->
        repeat(800) { bytes[it * 2] = value.toByte(); bytes[it * 2 + 1] = (value shr 8).toByte() }
    }
    private fun speech(buffer: LocalTranscriptBuffer) { repeat(6) { buffer.accept(pcm(), "posible voz") } }

    @Test fun boundedPreRollDoesNotTranscribeSilenceAndIsErasedOnReset() {
        val segments = mutableListOf<ShortArray>()
        val buffer = LocalTranscriptBuffer { segments.add(it) }
        repeat(1000) { buffer.accept(pcm(0), "sin actividad") }
        assertEquals(LocalTranscriptBuffer.PRE_SAMPLES * 2, buffer.bufferedBytes())
        assertTrue(segments.isEmpty())
        buffer.reset(); assertEquals(0, buffer.bufferedBytes())
    }
    @Test fun preRollSpeechAndPauseCloseOnlyOnVadSilence() {
        val segments = mutableListOf<ShortArray>()
        val buffer = LocalTranscriptBuffer { segments.add(it) }
        repeat(4) { buffer.accept(pcm(123), "candidato") }
        speech(buffer)
        repeat(11) { buffer.accept(pcm(0), "pausa") }
        assertTrue(segments.isEmpty())
        buffer.accept(pcm(0), "sin actividad")
        assertEquals(1, segments.size)
        assertEquals(123.toShort(), segments.single().first())
        assertEquals(0, buffer.bufferedBytes())
    }
    @Test fun shortActivityInvalidChunksAndInterruptionNeverFlushAudio() {
        val segments = mutableListOf<ShortArray>()
        val buffer = LocalTranscriptBuffer { segments.add(it) }
        repeat(3) { buffer.accept(pcm(), "posible voz") }
        buffer.accept(pcm(0), "sin actividad")
        assertTrue(segments.isEmpty())
        speech(buffer); buffer.reset()
        assertTrue(segments.isEmpty()); assertEquals(0, buffer.bufferedBytes())
        speech(buffer); buffer.accept(ByteArray(1599), "posible voz")
        assertTrue(segments.isEmpty()); assertEquals(0, buffer.bufferedBytes())
        speech(buffer); buffer.accept(pcm(), "inactivo")
        assertTrue(segments.isEmpty()); assertEquals(0, buffer.bufferedBytes())
    }
    @Test fun longActivityIsSplitAtEightSecondsWithoutGrowingMemory() {
        val lengths = mutableListOf<Int>()
        val buffer = LocalTranscriptBuffer { lengths.add(it.size); it.fill(0) }
        repeat(400) { buffer.accept(pcm(), "posible voz") }
        assertEquals(listOf(128000, 128000), lengths)
        assertTrue(buffer.bufferedBytes() <= (LocalTranscriptBuffer.MAX_SAMPLES + LocalTranscriptBuffer.PRE_SAMPLES) * 2)
        buffer.reset(); assertEquals(0, buffer.bufferedBytes())
    }
    @Test fun structuralAbstentionPreservesSpanishValencianAndMixedText() {
        for ((text, language) in listOf("¿Dónde estamos?" to "es", "On estem ara?" to "ca", "Ahora anem a casa." to "es")) {
            assertEquals(text, acceptedLocalText(LocalDecodedText(text, language)))
        }
        for ((text, language) in listOf("" to "es", "..." to "ca", "[inaudible]" to "es", "(soroll)" to "ca",
            "bonjour" to "fr", "palabra" to "", "<|nospeech|>" to "es", "a".repeat(601) to "ca", "hola\u0000" to "es")) {
            assertEquals("", acceptedLocalText(LocalDecodedText(text, language)))
        }
    }
    @Test fun stopDuringDecodeRejectsLateTextAndReleasesWithoutBlockingCaller() {
        val platform = testPlatform()
        val loaded = Latch(1, platform); val decoding = Latch(1, platform)
        val finish = Latch(1, platform); val released = Latch(1, platform)
        val texts = mutableListOf<String>()
        val session = LocalTranscriptSession(object : LocalTranscriptHost {
            override val dispatcher = CallbackDispatcher { it() }
            override fun loadDecoder(): LocalTranscriptDecoder {
                loaded.countDown()
                return object : LocalTranscriptDecoder {
                    override fun decode(samples: FloatArray): LocalDecodedText {
                        decoding.countDown(); finish.await(2000)
                        return LocalDecodedText("texto tardío", "es")
                    }
                    override fun release() { released.countDown() }
                }
            }
        }, platform)
        session.setListener(object : FaceclawLocalTranscriptListener {
            override fun onText(text: String, language: String) { texts.add(text) }
        })
        assertTrue(session.start()); assertFalse(session.start()); assertTrue(loaded.await(2000))
        // Loading notification precedes publication of ready; synchronize through polling the scalar state.
        waitReady(session)
        repeat(6) { session.acceptPcm(pcm(), "posible voz") }
        session.acceptPcm(pcm(0), "sin actividad")
        assertTrue(decoding.await(2000))
        session.stop()
        assertFalse(session.start()) // Previous non-interruptible decode is still draining.
        assertTrue(session.diagnostics().contains("\"worker\":true"))
        finish.countDown(); assertTrue(released.await(2000))
        waitStopped(session)
        assertTrue(texts.isEmpty()); assertTrue(session.diagnostics().contains("\"inputBufferedBytes\":0"))
    }
    @Test fun resetRejectsQueuedUiCallbackAndDecoderRunsOnlyOneSegmentAtOnce() {
        val platform = testPlatform()
        val loaded = Latch(1, platform); val decoded = Latch(1, platform)
        val released = Latch(1, platform); val callbacks = mutableListOf<() -> Unit>()
        val callbackReady = Latch(1, platform)
        val texts = mutableListOf<String>()
        val session = LocalTranscriptSession(object : LocalTranscriptHost {
            override val dispatcher = CallbackDispatcher { callbacks.add(it); callbackReady.countDown() }
            override fun loadDecoder(): LocalTranscriptDecoder {
                loaded.countDown()
                return object : LocalTranscriptDecoder {
                    override fun decode(samples: FloatArray): LocalDecodedText {
                        decoded.countDown(); return LocalDecodedText("Bon dia", "ca")
                    }
                    override fun release() { released.countDown() }
                }
            }
        }, platform)
        session.setListener(object : FaceclawLocalTranscriptListener {
            override fun onText(text: String, language: String) { texts.add(text) }
        })
        assertTrue(session.start()); assertTrue(loaded.await(2000)); waitReady(session)
        repeat(6) { session.acceptPcm(pcm(), "posible voz") }
        session.acceptPcm(pcm(0), "sin actividad")
        assertTrue(decoded.await(2000)); assertTrue(callbackReady.await(2000))
        session.resetStream(); callbacks.forEach { it() }
        waitNotBusy(session)
        assertTrue(texts.isEmpty()); assertTrue(session.diagnostics().contains("\"inputBufferedBytes\":0"))
        session.stop(); assertTrue(released.await(2000)); waitStopped(session)
    }
    private fun waitReady(session: LocalTranscriptSession) {
        val condition = testPlatform().createCondition()
        repeat(200) {
            if (session.diagnostics().contains("\"status\":\"listo\"")) return
            condition.withLock { condition.awaitMs(10) }
        }
        error("local test decoder did not become ready")
    }

    @Test fun overloadDropsSegmentsInsteadOfQueuingMoreAudio() {
        val platform = testPlatform()
        val decoding = Latch(1, platform); val finish = Latch(1, platform); val released = Latch(1, platform)
        var calls = 0
        val session = LocalTranscriptSession(object : LocalTranscriptHost {
            override val dispatcher = CallbackDispatcher { it() }
            override fun loadDecoder(): LocalTranscriptDecoder = object : LocalTranscriptDecoder {
                override fun decode(samples: FloatArray): LocalDecodedText {
                    calls++; decoding.countDown(); finish.await(2000); return LocalDecodedText("", "es")
                }
                override fun release() { released.countDown() }
            }
        }, platform)
        assertTrue(session.start()); waitReady(session)
        repeat(6) { session.acceptPcm(pcm(), "posible voz") }; session.acceptPcm(pcm(0), "sin actividad")
        assertTrue(decoding.await(2000))
        repeat(10) {
            repeat(6) { session.acceptPcm(pcm(), "posible voz") }
            session.acceptPcm(pcm(0), "sin actividad")
        }
        assertTrue(session.diagnostics().contains("\"dropped\":10"))
        assertEquals(1, calls)
        session.stop(); finish.countDown(); assertTrue(released.await(2000)); waitStopped(session)
        assertTrue(session.diagnostics().contains("\"inputBufferedBytes\":0"))
    }
    @Test fun missingDecoderExitsSilentlyWithoutRetainingAudio() {
        val session = LocalTranscriptSession(object : LocalTranscriptHost {
            override val dispatcher = CallbackDispatcher { error("no callback is expected") }
            override fun loadDecoder(): LocalTranscriptDecoder? = null
        }, testPlatform())
        assertTrue(session.start()); waitStopped(session)
        assertTrue(session.diagnostics().contains("modelo no disponible"))
        assertTrue(session.diagnostics().contains("\"inputBufferedBytes\":0"))
    }
    @Test fun deadlineRejectsQueuedTextEvenBeforeCoordinatorStopRuns() {
        val real = testPlatform()
        val clock = object : ProtocolPlatform by real {
            @Volatile var now = 1000L
            override fun elapsedRealtimeMs(): Long = now
        }
        val callbackReady = Latch(1, real); val released = Latch(1, real)
        val callbacks = mutableListOf<() -> Unit>(); val texts = mutableListOf<String>()
        val session = LocalTranscriptSession(object : LocalTranscriptHost {
            override val dispatcher = CallbackDispatcher { callbacks.add(it); callbackReady.countDown() }
            override fun loadDecoder(): LocalTranscriptDecoder = object : LocalTranscriptDecoder {
                override fun decode(samples: FloatArray) = LocalDecodedText("Bon dia", "ca")
                override fun release() { released.countDown() }
            }
        }, clock)
        session.setListener(object : FaceclawLocalTranscriptListener {
            override fun onText(text: String, language: String) { texts.add(text) }
        })
        assertTrue(session.start()); waitReady(session)
        repeat(6) { session.acceptPcm(pcm(), "posible voz") }; session.acceptPcm(pcm(0), "sin actividad")
        assertTrue(callbackReady.await(2000)); clock.now = 121000L
        callbacks.forEach { it() }
        assertTrue(texts.isEmpty()); assertTrue(released.await(2000)); waitStopped(session)
        assertTrue(session.diagnostics().contains("\"inputBufferedBytes\":0"))
    }
    private fun waitStopped(session: LocalTranscriptSession) {
        val condition = testPlatform().createCondition()
        repeat(200) {
            if (session.diagnostics().contains("\"worker\":false")) return
            condition.withLock { condition.awaitMs(10) }
        }
        error("local test worker did not finish")
    }
    private fun waitNotBusy(session: LocalTranscriptSession) {
        val condition = testPlatform().createCondition()
        repeat(200) {
            if (session.diagnostics().contains("\"busy\":false")) return
            condition.withLock { condition.awaitMs(10) }
        }
        error("local test decode did not finish")
    }
}
