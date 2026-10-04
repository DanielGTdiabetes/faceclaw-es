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
            override fun loadDecoder(language: LocalTranscriptLanguage): LocalTranscriptDecoder {
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
        assertEquals(1L, metric(session.diagnostics(), "invalidatedDecodes"))
        assertEquals(0L, metric(session.diagnostics(), "abstentions"))
    }
    @Test fun resetRejectsQueuedUiCallbackAndDecoderRunsOnlyOneSegmentAtOnce() {
        val platform = testPlatform()
        val loaded = Latch(1, platform); val decoded = Latch(1, platform)
        val released = Latch(1, platform); val callbacks = mutableListOf<() -> Unit>()
        val callbackReady = Latch(1, platform)
        val texts = mutableListOf<String>()
        val session = LocalTranscriptSession(object : LocalTranscriptHost {
            override val dispatcher = CallbackDispatcher { callbacks.add(it); callbackReady.countDown() }
            override fun loadDecoder(language: LocalTranscriptLanguage): LocalTranscriptDecoder {
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
            override fun loadDecoder(language: LocalTranscriptLanguage): LocalTranscriptDecoder = object : LocalTranscriptDecoder {
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
            override fun loadDecoder(language: LocalTranscriptLanguage): LocalTranscriptDecoder? = null
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
            override fun loadDecoder(language: LocalTranscriptLanguage): LocalTranscriptDecoder = object : LocalTranscriptDecoder {
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

    private fun metric(json: String, name: String): Long =
        Regex("\"$name\":(\\d+)").find(json)?.groupValues?.get(1)?.toLong() ?: error("missing metric $name")

    @Test fun segmentDiagnosticsDistinguishShortLimitSilenceAndErasedOpenAudio() {
        val buffer = LocalTranscriptBuffer { it.fill(0) }
        repeat(3) { buffer.accept(pcm(), "posible voz") }
        buffer.accept(pcm(0), "sin actividad") // Too short; never submitted to the decoder.
        repeat(160) { buffer.accept(pcm(), "posible voz") } // Exactly 8 s; hard cut.
        speech(buffer); buffer.accept(pcm(0), "sin actividad")
        speech(buffer); buffer.reset() // OFF/stream invalidation discards an open fragment.
        val report = buffer.diagnostics()
        assertEquals(2L, metric(report, "silenceClosures"))
        assertEquals(1L, metric(report, "limitClosures"))
        assertEquals(1L, metric(report, "shortSegments"))
        assertEquals(1L, metric(report, "interruptedSegments"))
        assertEquals(300L, metric(report, "interruptedAudioMs"))
        assertEquals(8350L, metric(report, "submittedAudioMs"))
        assertEquals(0, buffer.bufferedBytes())
        buffer.reset() // Repeated cleanup does not count another interrupted segment.
        assertEquals(1L, metric(buffer.diagnostics(), "interruptedSegments"))
        buffer.resetMetrics()
        assertEquals(0L, metric(buffer.diagnostics(), "submittedAudioMs"))
    }

    @Test fun analysisSeparatesLoadingLanguageFiltersErrorsTimingAndDeliveryWithoutContent() {
        val real = testPlatform()
        val clock = object : ProtocolPlatform by real {
            @Volatile var now = 1000L
            override fun elapsedRealtimeMs(): Long = now
        }
        val loading = Latch(1, real); val loaded = Latch(1, real); val released = Latch(1, real)
        val outputs = listOf(LocalDecodedText("bonjour", "fr"), LocalDecodedText("", "es"),
            LocalDecodedText("[inaudible]", "ca"), LocalDecodedText("palabra privada", "es"),
            LocalDecodedText("Bon dia privat", "ca"))
        var calls = 0
        val session = LocalTranscriptSession(object : LocalTranscriptHost {
            override val dispatcher = CallbackDispatcher { it() }
            override fun loadDecoder(language: LocalTranscriptLanguage): LocalTranscriptDecoder {
                loading.countDown(); loaded.await(2000)
                return object : LocalTranscriptDecoder {
                    override fun decode(samples: FloatArray): LocalDecodedText {
                        clock.now += (calls + 1) * 10L
                        val index = calls++
                        if (index == outputs.size) error("decoder error with private content")
                        return outputs[index]
                    }
                    override fun release() { released.countDown() }
                }
            }
        }, clock)
        val texts = mutableListOf<String>()
        session.setListener(object : FaceclawLocalTranscriptListener {
            override fun onText(text: String, language: String) { texts.add(text) }
        })
        assertTrue(session.start()); assertTrue(loading.await(2000))
        repeat(2) { session.acceptPcm(pcm(), "posible voz") }
        loaded.countDown(); waitReady(session)
        repeat(6) {
            repeat(6) { session.acceptPcm(pcm(), "posible voz") }
            session.acceptPcm(pcm(0), "sin actividad")
            waitNotBusy(session)
        }
        session.stop(); assertTrue(released.await(2000)); waitStopped(session)
        val report = session.diagnostics()
        for ((name, value) in mapOf("pcmAudioMs" to 2200L, "loadingAudioMs" to 100L,
            "submittedAudioMs" to 2100L, "decodedAudioMs" to 2100L, "decodeCalls" to 6L,
            "decodeTotalMs" to 210L, "decodeMaxMs" to 60L, "rejectedLanguage" to 1L,
            "rejectedEmpty" to 1L, "rejectedStructure" to 1L, "decodeErrors" to 1L, "processingErrors" to 0L,
            "languageEs" to 2L, "languageCa" to 2L, "languageOther" to 1L,
            "accepted" to 2L, "delivered" to 2L, "abstentions" to 4L, "dropped" to 0L)) {
            assertEquals(value, metric(report, name), name)
        }
        assertEquals(listOf("palabra privada", "Bon dia privat"), texts)
        assertFalse(report.contains("privat")); assertFalse(report.contains("bonjour"))
        assertFalse(report.contains("decoder error"))
        assertEquals(0L, metric(report, "inputBufferedBytes"))
        assertTrue(session.start()); waitReady(session)
        assertEquals(0L, metric(session.diagnostics(), "decodeCalls"))
        session.stop(); waitStopped(session)
    }
}
