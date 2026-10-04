package com.faceclaw.app

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class LocalTranscriptWindowsTest {
    // Alternating 8 LSB ~= -72 dBFS, well below the current energy VAD. Synthetic, not human speech.
    private fun pcm(level: Int = 8, constant: Boolean = false) = ByteArray(1600).also { bytes ->
        repeat(800) { i ->
            val value = if (constant || i % 2 == 0) level else -level
            bytes[i * 2] = value.toByte(); bytes[i * 2 + 1] = (value shr 8).toByte()
        }
    }
    private fun waitFor(session: LocalTranscriptSession, field: String, value: String) {
        val condition = testPlatform().createCondition()
        repeat(300) {
            if (session.diagnostics().contains("\"$field\":$value")) return
            condition.withLock { condition.awaitMs(10) }
        }
        error("worker did not reach $field=$value")
    }
    private fun metric(session: LocalTranscriptSession, field: String): Long =
        Regex("\"$field\":(\\d+)").find(session.diagnostics())!!.groupValues[1].toLong()

    @Test fun weakAudioReachesWindowsRegardlessOfVadButNotTheParticipationBuffer() {
        val segments = mutableListOf<ShortArray>()
        val window = LocalTranscriptBuffer { segments.add(it) }
        var gated = 0
        val participation = LocalTranscriptBuffer { gated++; it.fill(0) }
        window.resetMetrics(LocalTranscriptSegmentation.WINDOWS)
        repeat(120) { window.accept(pcm(), "sin actividad"); participation.accept(pcm(), "sin actividad") }
        assertEquals(0, gated); assertEquals(1, segments.size)
        assertEquals(96000, segments[0].size); assertEquals(8.toShort(), segments[0][0])
        assertEquals((-8).toShort(), segments[0][1])
        assertEquals(96000, window.bufferedBytes())
        window.reset(); participation.reset()
        assertEquals(0, window.bufferedBytes())
    }

    @Test fun overlapPreservesBoundarySamplesAndOriginPhasesWithinFixedMemory() {
        val segments = mutableListOf<ShortArray>(); val phases = mutableListOf<Int>()
        val window = LocalTranscriptBuffer(segmentPhase = { phases.add(it) }) { segments.add(it) }
        window.resetMetrics(LocalTranscriptSegmentation.WINDOWS)
        repeat(60) { window.accept(pcm(8), "sin actividad", 1) }
        repeat(60) { window.accept(pcm(16), "sin actividad", 2) }
        repeat(60) { window.accept(pcm(24), "inactivo", 2) }
        assertEquals(listOf(LocalTranscriptPhases.MIXED, 2), phases)
        assertTrue(segments[0].takeLast(48000) == segments[1].take(48000))
        assertEquals(24.toShort(), segments[1][48000])
        assertEquals(96000, window.bufferedBytes())
        window.reset(); assertEquals(0, window.bufferedBytes())
    }

    @Test fun silenceDcAndStuckClippingNeverDecodeAndModeCanReturnToVad() {
        var calls = 0
        val window = LocalTranscriptBuffer { calls++; it.fill(0) }
        for (level in listOf(0, 800, 32767)) {
            window.resetMetrics(LocalTranscriptSegmentation.WINDOWS)
            repeat(220) { window.accept(pcm(level, true), "posible voz") }
            assertEquals(0, calls)
            assertTrue(window.diagnostics().contains("\"constantWindows\":2"))
        }
        window.resetMetrics()
        repeat(220) { window.accept(pcm(), "sin actividad") }
        assertEquals(0, calls)
        assertEquals(6400, window.bufferedBytes())
    }

    @Test fun malformedChunkOrGapErasesOverlapAndDoesNotFlushPartialText() {
        var calls = 0
        val window = LocalTranscriptBuffer { calls++; it.fill(0) }
        window.resetMetrics(LocalTranscriptSegmentation.WINDOWS)
        repeat(119) { window.accept(pcm(), "sin actividad") }
        window.accept(ByteArray(1599), "sin actividad")
        assertEquals(0, calls); assertEquals(0, window.bufferedBytes())
        repeat(120) { window.accept(pcm(), "sin actividad") }
        assertEquals(1, calls)
        window.reset()
        repeat(100) { window.accept(pcm(), "sin actividad") }
        assertEquals(1, calls)
        window.reset(); assertEquals(0, window.bufferedBytes())
    }

    @Test fun slowWorkerDropsWindowsAndOffInvalidatesLateResultAndErasesInput() {
        val platform = testPlatform(); val entered = Latch(1, platform); val finish = Latch(1, platform)
        var calls = 0; var deliveries = 0; var retained: FloatArray? = null
        val session = LocalTranscriptSession(object : LocalTranscriptHost {
            override val dispatcher = CallbackDispatcher { it() }
            override fun loadDecoder(language: LocalTranscriptLanguage): LocalTranscriptDecoder {
                assertEquals(LocalTranscriptLanguage.ES, language)
                return object : LocalTranscriptDecoder {
                    override fun decode(samples: FloatArray): LocalDecodedText {
                        retained = samples; calls++; entered.countDown(); finish.await(4000)
                        return localDecodedText("Texto sintético", "", language)
                    }
                    override fun release() {}
                }
            }
        }, platform)
        session.setListener(object : FaceclawLocalTranscriptListener {
            override fun onText(text: String, language: String) { deliveries++ }
        })
        assertTrue(session.start(LocalTranscriptLanguage.ES, LocalTranscriptSegmentation.WINDOWS))
        waitFor(session, "status", "\"listo\"")
        assertFalse(session.start(LocalTranscriptLanguage.AUTO))
        repeat(120) { session.acceptPcm(pcm(), "sin actividad") }
        assertTrue(entered.await(2000))
        repeat(1000) { session.acceptPcm(pcm(), "sin actividad") }
        assertEquals(16L, metric(session, "dropped")); assertEquals(1, calls)
        assertTrue(metric(session, "inputBufferedBytes") <= 832000)
        session.stop(); assertFalse(session.start())
        finish.countDown(); waitFor(session, "worker", "false")
        assertEquals(0, deliveries); assertEquals(0L, metric(session, "inputBufferedBytes"))
        assertTrue(retained!!.all { it == 0f })
        assertEquals(1L, metric(session, "invalidatedDecodes"))
    }

    @Test fun queuedWindowResultIsDiscardedOnGapStopOrDeadline() {
        for (reason in listOf("gap", "off", "deadline")) {
            val real = testPlatform()
            val clock = object : ProtocolPlatform by real {
                @Volatile var now = 1000L
                override fun elapsedRealtimeMs(): Long = now
            }
            val queued = Latch(1, real); var callback: (() -> Unit)? = null; var delivered = 0
            val session = LocalTranscriptSession(object : LocalTranscriptHost {
                override val dispatcher = CallbackDispatcher { callback = it; queued.countDown() }
                override fun loadDecoder(language: LocalTranscriptLanguage) = object : LocalTranscriptDecoder {
                    override fun decode(samples: FloatArray) = LocalDecodedText("Texto sintético", "es", true)
                    override fun release() {}
                }
            }, clock)
            session.setListener(object : FaceclawLocalTranscriptListener {
                override fun onText(text: String, language: String) { delivered++ }
            })
            session.start(LocalTranscriptLanguage.ES, LocalTranscriptSegmentation.WINDOWS)
            waitFor(session, "status", "\"listo\"")
            repeat(120) { session.acceptPcm(pcm(), "sin actividad") }
            assertTrue(queued.await(2000))
            when (reason) { "gap" -> session.resetStream(); "off" -> session.stop(); else -> clock.now = 121000 }
            callback!!(); session.stop(); waitFor(session, "worker", "false")
            assertEquals(0, delivered, reason); assertEquals(0L, metric(session, "inputBufferedBytes"), reason)
            assertEquals(1L, metric(session, "deliveryDiscarded"), reason)
        }
    }

    @Test fun textOverlapIsConservativeAndKeepsNewContentFromOtherVoices() {
        assertEquals("el domingo?", localWindowNovelText("¿Cuándo empieza la carrera", "La carrera el domingo?"))
        assertEquals("Sí, sí", localWindowNovelText("Sí", "Sí, sí")) // No single-word deletion.
        assertEquals("otra respuesta", localWindowNovelText("primera pregunta", "otra respuesta"))
        assertEquals("", localWindowNovelText("Vamos a casa", "a casa"))
    }

    @Test fun tolerantOverlapSkipsWordsCutAtWindowEdgesOnlyWithThreeWordEvidence() {
        // Leading word cut at the start of the new window.
        assertEquals("y luego al cine", localWindowNovelText("mañana vamos a comer juntos",
            "ana vamos a comer juntos y luego al cine"))
        // Trailing word cut at the end of the previous window.
        assertEquals("juntos y luego al cine", localWindowNovelText("mañana vamos a comer jun",
            "mañana vamos a comer juntos y luego al cine"))
        // Two-word coincidence after a skip is not enough evidence: keep everything.
        assertEquals("ah de la casa nueva", localWindowNovelText("la puerta de la", "ah de la casa nueva"))
        // A different speaker answering is never trimmed.
        assertEquals("sí, a las ocho", localWindowNovelText("¿quedamos mañana?", "sí, a las ocho"))
    }

    @Test fun windowResultsMergeOnlyAfterAnAdjacentDeliveredResultAndNotAcrossReset() {
        val platform = testPlatform(); val texts = mutableListOf<String>()
        val outputs = listOf("La carrera empieza", "carrera empieza el domingo", "el domingo por la tarde",
            "por la tarde volvemos", "tarde volvemos a casa")
        var call = 0
        val session = LocalTranscriptSession(object : LocalTranscriptHost {
            override val dispatcher = CallbackDispatcher { it() }
            override fun loadDecoder(language: LocalTranscriptLanguage) = object : LocalTranscriptDecoder {
                override fun decode(samples: FloatArray) = LocalDecodedText(outputs[call++], "es", true)
                override fun release() {}
            }
        }, platform)
        session.setListener(object : FaceclawLocalTranscriptListener {
            override fun onText(text: String, language: String) { texts.add(text) }
        })
        session.start(LocalTranscriptLanguage.ES, LocalTranscriptSegmentation.WINDOWS)
        waitFor(session, "status", "\"listo\"")
        repeat(120) { session.acceptPcm(pcm(), "sin actividad") }; waitFor(session, "busy", "false")
        repeat(100) { session.acceptPcm(pcm(), "sin actividad") }; waitFor(session, "busy", "false")
        session.resetStream()
        repeat(120) { session.acceptPcm(pcm(), "sin actividad") }; waitFor(session, "busy", "false")
        // One skipped constant window breaks continuity even if its previous overlap held signal.
        repeat(220) { session.acceptPcm(pcm(0, true), "sin actividad") }; waitFor(session, "busy", "false")
        repeat(60) { session.acceptPcm(pcm(), "sin actividad") }; waitFor(session, "busy", "false")
        session.stop(); waitFor(session, "worker", "false")
        assertEquals(listOf("La carrera empieza", "el domingo", "el domingo por la tarde", "volvemos", "tarde volvemos a casa"), texts)
        assertFalse(session.diagnostics().contains("domingo"))
    }
}
