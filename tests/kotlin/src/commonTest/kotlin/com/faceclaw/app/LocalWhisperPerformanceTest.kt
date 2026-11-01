package com.faceclaw.app

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Run configuration and window policies of the local Whisper route (benchmark candidate). */
class LocalWhisperPerformanceTest {
    private fun pcm(level: Int = 8) = ByteArray(1600).also { bytes ->
        repeat(800) { i ->
            val value = if (i % 2 == 0) level else -level
            bytes[i * 2] = value.toByte(); bytes[i * 2 + 1] = (value shr 8).toByte()
        }
    }
    /** Chunk whose samples encode its own index, so window contents can be traced back to capture time. */
    private fun indexed(index: Int) = ByteArray(1600).also { bytes ->
        repeat(800) { i ->
            val value = if (i % 2 == 0) index + 1 else -(index + 1)
            bytes[i * 2] = value.toByte(); bytes[i * 2 + 1] = (value shr 8).toByte()
        }
    }
    private fun firstChunkIndex(window: ShortArray): Int = window[0] - 1
    private fun waitFor(session: LocalTranscriptSession, field: String, value: String) {
        val condition = testPlatform().createCondition()
        repeat(400) {
            if (session.diagnostics().contains("\"$field\":$value")) return
            condition.withLock { condition.awaitMs(10) }
        }
        error("worker did not reach $field=$value: ${session.diagnostics()}")
    }
    private fun metric(session: LocalTranscriptSession, field: String): Long =
        Regex("\"$field\":(\\d+)").find(session.diagnostics())!!.groupValues[1].toLong()

    /** (startMs, endMs, outcome) of every attempt still in the ring, oldest first. */
    private fun attempts(timings: String): List<Triple<Long, Long, Long>> =
        Regex("""\[(\d+),(\d+),\d+,(\d+)]""").findAll(timings)
            .map { Triple(it.groupValues[1].toLong(), it.groupValues[2].toLong(), it.groupValues[3].toLong()) }.toList()

    @Test fun defaultsUseFourThreadsForEveryModelAndOnlyTheMeasuredGridIsAccepted() {
        // Base promoted from 1 to 4 threads; small and medium unchanged. CPU, default padding.
        assertEquals(LocalWhisperPerformance(4), LocalWhisperPerformance.defaultFor("whisper-base-es"))
        assertEquals("threads=4;provider=cpu;tail=default", LocalWhisperPerformance.defaultFor("whisper-base-es")!!.wire)
        assertEquals(LocalWhisperPerformance(4), LocalWhisperPerformance.defaultFor("whisper-small-es"))
        assertEquals(LocalWhisperPerformance(4), LocalWhisperPerformance.defaultFor("whisper-medium-es"))
        assertNull(LocalWhisperPerformance.defaultFor("whisper-large"))
        assertEquals("threads=4;provider=cpu;tail=default", LocalWhisperPerformance.defaultFor("whisper-small-es")!!.wire)
        for (threads in listOf(1, 2, 4, 6)) assertNotNull(LocalWhisperPerformance.validated(threads, "cpu", 0))
        for (threads in listOf(0, 3, 5, 8, -1)) assertNull(LocalWhisperPerformance.validated(threads, "cpu", 0))
        assertEquals("threads=2;provider=xnnpack;tail=300", LocalWhisperPerformance.validated(2, "xnnpack", 300)!!.wire)
        // Not Google Tensor backends (QNN is Qualcomm) and NNAPI is deprecated: never accepted here.
        for (provider in listOf("nnapi", "qnn", "gpu", "tpu", "", "CPU")) assertNull(LocalWhisperPerformance.validated(4, provider, 0))
        for (tail in listOf(-1, 1, 99, 1001, 3000)) assertNull(LocalWhisperPerformance.validated(4, "cpu", tail))
        assertNotNull(LocalWhisperPerformance.validated(4, "cpu", 100)); assertNotNull(LocalWhisperPerformance.validated(4, "cpu", 1000))
    }

    @Test fun windowPoliciesAreBoundedAndTheReferenceIsTheProductionSixThree() {
        val reference = LocalTranscriptWindowPolicy.REFERENCE
        assertEquals(LocalTranscriptBuffer.WINDOW_SAMPLES, reference.windowSamples)
        assertEquals(LocalTranscriptBuffer.OVERLAP_SAMPLES, reference.overlapSamples)
        assertFalse(reference.coalesces)
        assertTrue(LocalTranscriptWindowPolicy.ALL.all { LocalTranscriptWindowPolicy.isValid(it) })
        assertEquals(LocalTranscriptWindowPolicy.COALESCE, LocalTranscriptWindowPolicy.byId("coalesce-6-3-max12"))
        assertNull(LocalTranscriptWindowPolicy.byId("vad"))
        for (bad in listOf(
            LocalTranscriptWindowPolicy("hop-equals-window", 96000, 96000, 96000),
            LocalTranscriptWindowPolicy("short-overlap", 96000, 88000, 96000),
            LocalTranscriptWindowPolicy("not-chunked", 96001, 48000, 96001),
            LocalTranscriptWindowPolicy("max-below-window", 96000, 48000, 80000),
            LocalTranscriptWindowPolicy("beyond-whisper", 96000, 48000, 16000 * 30))) {
            assertFalse(LocalTranscriptWindowPolicy.isValid(bad), bad.id)
        }
        val session = LocalTranscriptSession(object : LocalTranscriptHost {
            override val dispatcher = CallbackDispatcher { it() }
            override fun loadDecoder(language: LocalTranscriptLanguage): LocalTranscriptDecoder? = error("must not load")
        }, testPlatform())
        assertFalse(session.start(LocalTranscriptLanguage.ES, LocalTranscriptSegmentation.WINDOWS, 1000,
            LocalTranscriptWindowPolicy("bad", 96000, 96000, 96000)))
        assertFalse(session.isWorkerActive())
    }

    @Test fun coalescingWithAnIdleConsumerProducesExactlyTheReferenceWindows() {
        fun run(policy: LocalTranscriptWindowPolicy): List<List<Short>> {
            val windows = mutableListOf<List<Short>>()
            val buffer = LocalTranscriptBuffer(canSubmit = { true }) { windows.add(it.toList()) }
            buffer.resetMetrics(LocalTranscriptSegmentation.WINDOWS, policy)
            repeat(400) { buffer.accept(indexed(it), "sin actividad") }
            return windows
        }
        val reference = run(LocalTranscriptWindowPolicy.REFERENCE)
        assertEquals(listOf(0, 60, 120, 180, 240), reference.map { firstChunkIndex(it.toShortArray()) })
        assertTrue(reference.all { it.size == 96000 })
        assertEquals(reference, run(LocalTranscriptWindowPolicy.COALESCE))
    }

    @Test fun busyConsumerGrowsOneBoundedWindowWithoutLosingAudioAndDropsOnlyAtTheCeiling() {
        val windows = mutableListOf<ShortArray>()
        var busy = false
        val buffer = LocalTranscriptBuffer(canSubmit = { !busy }) { windows.add(it) }
        buffer.resetMetrics(LocalTranscriptSegmentation.WINDOWS, LocalTranscriptWindowPolicy.COALESCE)
        repeat(120) { buffer.accept(indexed(it), "sin actividad") }
        assertEquals(1, windows.size)
        busy = true
        // Overlap 60 chunks + 90 new = 7.5 s held; no submission, memory bounded by the 12 s ceiling.
        for (i in 120 until 210) buffer.accept(indexed(i), "sin actividad")
        assertEquals(1, windows.size)
        assertEquals(150 * 1600, buffer.bufferedBytes())
        busy = false
        buffer.accept(indexed(210), "sin actividad")
        assertEquals(2, windows.size)
        // Contiguous: starts with the previous window's overlap and ends with the newest chunk.
        assertEquals(60, firstChunkIndex(windows[1])); assertEquals(151 * 800, windows[1].size)
        assertEquals((211).toShort(), windows[1][windows[1].size - 2])
        assertTrue(buffer.diagnostics().contains("\"deferredWindows\":1,\"coalescedWindows\":1,\"maxWindowMs\":7550"))
        // A decoder still busy at the 12 s ceiling: the window is handed over (and dropped by the session).
        busy = true
        for (i in 211 until 211 + 180) buffer.accept(indexed(i), "sin actividad")
        assertEquals(3, windows.size); assertEquals(16000 * 12, windows[2].size)
        assertTrue(buffer.bufferedBytes() <= 16000 * 12 * 2)
        buffer.reset(); assertEquals(0, buffer.bufferedBytes())
    }

    @Test fun quietVoiceAfterALoudOneReachesTheWindowUntouchedInBothPolicies() {
        // Level test only (not a two-metre speaker): no VAD/energy gate may remove the quiet part.
        for (policy in HOP_POLICIES) {
            val windows = mutableListOf<ShortArray>()
            val buffer = LocalTranscriptBuffer(canSubmit = { true }) { windows.add(it) }
            buffer.resetMetrics(LocalTranscriptSegmentation.WINDOWS, policy)
            repeat(60) { buffer.accept(pcm(12000), "posible voz") }
            repeat(60) { buffer.accept(pcm(3), "sin actividad") }
            assertEquals(1, windows.size, policy.id)
            assertEquals(12000.toShort(), windows[0][0]); assertEquals(3.toShort(), windows[0][96000 - 2])
        }
    }

    /** Fixed-hop policies; the pause policy has its own tests in LocalSpeakerAttributionTest. */
    private val HOP_POLICIES = listOf(LocalTranscriptWindowPolicy.REFERENCE, LocalTranscriptWindowPolicy.COALESCE)

    private class GatedDecoderHost(platform: ProtocolPlatform, private val outputs: List<String> = emptyList()) : LocalTranscriptHost {
        val entered = Latch(1, platform)
        val release = Latch(1, platform)
        val sizes = mutableListOf<Int>()
        var active = 0
        var maxActive = 0
        override val dispatcher = CallbackDispatcher { it() }
        override fun loadDecoder(language: LocalTranscriptLanguage) = object : LocalTranscriptDecoder {
            override val runtime = "threads=4;provider=cpu;tail=default"
            override fun decode(samples: FloatArray): LocalDecodedText {
                active++; maxActive = maxOf(maxActive, active)
                val call = sizes.size
                sizes.add(samples.size)
                if (call == 0) { entered.countDown(); release.await(4000) }
                active--
                return LocalDecodedText(outputs.getOrElse(call) { "texto sintético $call" }, "es", true)
            }
            override fun release() {}
        }
    }

    /** Decoder busy across two hops: reference loses a 3 s gap, coalescing defers and covers it. */
    @Test fun slowDecoderReferenceDropsWindowsWhileCoalescingKeepsCoverage() {
        val results = HOP_POLICIES.associate { policy ->
            val platform = testPlatform()
            val host = GatedDecoderHost(platform)
            val texts = mutableListOf<String>()
            val session = LocalTranscriptSession(host, platform)
            session.setListener(object : FaceclawLocalTranscriptListener {
                override fun onText(text: String, language: String) { texts.add(text) }
            })
            assertTrue(session.start(LocalTranscriptLanguage.ES, LocalTranscriptSegmentation.WINDOWS, 120000, policy))
            waitFor(session, "status", "\"listo\"")
            repeat(120) { session.acceptPcm(pcm(), "sin actividad") }
            assertTrue(host.entered.await(2000))
            repeat(130) { session.acceptPcm(pcm(), "sin actividad") } // 12.5 s of input, decoder still busy.
            host.release.countDown(); waitFor(session, "busy", "false")
            repeat(50) { session.acceptPcm(pcm(), "sin actividad") } // 15 s total.
            waitFor(session, "busy", "false")
            val snapshot = session.diagnostics()
            val timings = session.decodeTimings()
            session.stop(); waitFor(session, "worker", "false")
            assertEquals(1, host.maxActive, policy.id) // Never two inferences at once.
            assertTrue(snapshot.contains("\"runtime\":\"threads=4;provider=cpu;tail=default\""), policy.id)
            assertTrue(snapshot.contains("\"windowedAudioMs\":15000"), policy.id)
            assertFalse(timings.contains("texto"), policy.id)
            val bounds = attempts(timings).map { "${it.first}-${it.second}" }
            assertEquals(if (policy.coalesces) listOf("0-6000", "3000-12550") else listOf("0-6000", "9000-15000"), bounds, policy.id)
            assertTrue(attempts(timings).all { it.third == LocalTranscriptSession.TIMING_OK }, policy.id)
            assertTrue(timings.startsWith("{\"total\":2,\"first\":0,"), policy.id)
            policy.id to Triple(snapshot, host.sizes.toList(), texts.size)
        }
        val (reference, referenceSizes, _) = results.getValue("ref-6-3")
        assertTrue(reference.contains("\"dropped\":2"))
        assertEquals(listOf(96000, 96000), referenceSizes) // [0,6) s and [9,15) s: [6,9) s never decoded.
        assertTrue(reference.contains("\"attemptedAudioMs\":12000,\"coveredAudioMs\":12000"))
        val (coalesce, coalesceSizes, coalesceDeliveries) = results.getValue("coalesce-6-3-max12")
        assertTrue(coalesce.contains("\"dropped\":0"))
        assertEquals(listOf(96000, 191 * 800), coalesceSizes) // [0,6) s and [3,12.55) s.
        assertTrue(coalesce.contains("\"coveredAudioMs\":12550"))
        assertTrue(coalesce.contains("\"deferredWindows\":1,\"coalescedWindows\":1,\"maxWindowMs\":9550"))
        assertEquals(2, coalesceDeliveries)
        assertTrue(coalesce.contains("\"deliveryLatencyCount\":2"))
    }

    @Test fun coalescedWindowTextIsDedupedAgainstTheAdjacentDeliveryButNotAcrossReset() {
        val platform = testPlatform()
        val host = GatedDecoderHost(platform, listOf("La carrera empieza", "carrera empieza el domingo por la tarde",
            "volvemos a casa"))
        val texts = mutableListOf<String>()
        val session = LocalTranscriptSession(host, platform)
        session.setListener(object : FaceclawLocalTranscriptListener {
            override fun onText(text: String, language: String) { texts.add(text) }
        })
        session.start(LocalTranscriptLanguage.ES, LocalTranscriptSegmentation.WINDOWS, 120000, LocalTranscriptWindowPolicy.COALESCE)
        waitFor(session, "status", "\"listo\"")
        repeat(120) { session.acceptPcm(pcm(), "sin actividad") }
        assertTrue(host.entered.await(2000))
        repeat(90) { session.acceptPcm(pcm(), "sin actividad") }
        host.release.countDown(); waitFor(session, "busy", "false")
        session.acceptPcm(pcm(), "sin actividad"); waitFor(session, "busy", "false") // 7.55 s coalesced window.
        session.resetStream()
        repeat(120) { session.acceptPcm(pcm(), "sin actividad") }; waitFor(session, "busy", "false")
        session.stop(); waitFor(session, "worker", "false")
        assertEquals(listOf("La carrera empieza", "el domingo por la tarde", "volvemos a casa"), texts)
    }

    @Test fun offDuringJniWithDeferredAudioErasesEverythingAndRejectsTheLateResult() {
        for (reason in listOf("off", "reset")) {
            val platform = testPlatform()
            val host = GatedDecoderHost(platform)
            var deliveries = 0
            val session = LocalTranscriptSession(host, platform)
            session.setListener(object : FaceclawLocalTranscriptListener {
                override fun onText(text: String, language: String) { deliveries++ }
            })
            session.start(LocalTranscriptLanguage.ES, LocalTranscriptSegmentation.WINDOWS, 120000, LocalTranscriptWindowPolicy.COALESCE)
            waitFor(session, "status", "\"listo\"")
            repeat(120) { session.acceptPcm(pcm(), "sin actividad") }
            assertTrue(host.entered.await(2000))
            repeat(100) { session.acceptPcm(pcm(), "sin actividad") } // Deferred window held in RAM.
            assertTrue(metric(session, "inputBufferedBytes") > 96000 * 2, reason)
            if (reason == "off") session.stop() else session.resetStream()
            // Only the in-flight JNI input remains until the call returns.
            assertTrue(metric(session, "inputBufferedBytes") <= 96000 * 6, reason)
            host.release.countDown(); waitFor(session, "busy", "false")
            if (reason == "reset") { session.stop() }
            waitFor(session, "worker", "false")
            assertEquals(0, deliveries, reason)
            assertEquals(0L, metric(session, "inputBufferedBytes"), reason)
            assertEquals(1L, metric(session, "invalidatedDecodes"), reason)
            assertEquals(1, host.sizes.size, reason) // The deferred audio was erased, never decoded.
        }
    }

    /** Decoder whose call number `n` throws when `fails(n)`; otherwise returns `output(n)`. */
    private class ScriptedDecoderHost(private val fails: (Int) -> Boolean,
        private val output: (Int) -> LocalDecodedText = { LocalDecodedText("texto sintético $it", "es", true) }) : LocalTranscriptHost {
        var calls = 0
        override val dispatcher = CallbackDispatcher { it() }
        override fun loadDecoder(language: LocalTranscriptLanguage) = object : LocalTranscriptDecoder {
            override fun decode(samples: FloatArray): LocalDecodedText {
                val call = calls++
                if (fails(call)) error("synthetic decoder failure")
                return output(call)
            }
            override fun release() {}
        }
    }

    private fun scriptedSession(host: LocalTranscriptHost, language: LocalTranscriptLanguage = LocalTranscriptLanguage.ES,
        deliveries: MutableList<String> = mutableListOf()): LocalTranscriptSession {
        val session = LocalTranscriptSession(host, testPlatform())
        session.setListener(object : FaceclawLocalTranscriptListener {
            override fun onText(text: String, language: String) { deliveries.add(text) }
        })
        assertTrue(session.start(language, LocalTranscriptSegmentation.WINDOWS, 1200000))
        waitFor(session, "status", "\"listo\"")
        return session
    }

    /** First window at 6 s, then one window per 3 s hop, each fully processed before the next closes. */
    private fun feedWindows(session: LocalTranscriptSession, windows: Int) {
        repeat(windows) { index ->
            repeat(if (index == 0) 120 else 60) { session.acceptPcm(pcm(), "sin actividad") }
            waitFor(session, "busy", "false")
        }
    }

    @Test fun failedDecodeIsTimedAsAnAttemptButNeverCountedAsCovered() {
        // Codex reproduction: decoder throws on a 6 s window. Before the fix this reported coveredAudioMs 6000.
        val session = scriptedSession(ScriptedDecoderHost(fails = { true }))
        feedWindows(session, 1)
        val snapshot = session.diagnostics(); val timings = session.decodeTimings()
        session.stop(); waitFor(session, "worker", "false")
        assertTrue(snapshot.contains("\"decodeErrors\":1"))
        assertTrue(snapshot.contains("\"attemptedAudioMs\":6000,\"coveredAudioMs\":0"))
        assertTrue(snapshot.contains("\"accepted\":0"))
        assertEquals(listOf(Triple(0L, 6000L, LocalTranscriptSession.TIMING_FAILED)), attempts(timings))
    }

    @Test fun aLaterSuccessCoversOnlyItsOwnSpanAroundAFailedWindow() {
        // Windows [0,6) [3,9) [6,12) s. Failing the middle one leaves no gap; failing the first leaves [0,3) uncovered.
        for ((failing, covered) in listOf(1 to 12000L, 0 to 9000L)) {
            val session = scriptedSession(ScriptedDecoderHost(fails = { it == failing }))
            feedWindows(session, 3)
            val snapshot = session.diagnostics(); val timings = session.decodeTimings()
            session.stop(); waitFor(session, "worker", "false")
            assertEquals(1L, metric(session, "decodeErrors"), "failing=$failing")
            assertEquals(12000L, metric(session, "attemptedAudioMs"), "failing=$failing")
            assertEquals(covered, metric(session, "coveredAudioMs"), "failing=$failing")
            assertTrue(snapshot.contains("\"windowedAudioMs\":12000"), "failing=$failing")
            assertEquals(List(3) { if (it == failing) LocalTranscriptSession.TIMING_FAILED else LocalTranscriptSession.TIMING_OK },
                attempts(timings).map { it.third }, "failing=$failing")
        }
    }

    @Test fun offOrResetDuringJniIsInvalidatedAndNeverCoveredByTheOldOrNewGeneration() {
        for (reason in listOf("off", "reset")) {
            val platform = testPlatform()
            val host = GatedDecoderHost(platform)
            var deliveries = 0
            val session = LocalTranscriptSession(host, platform)
            session.setListener(object : FaceclawLocalTranscriptListener {
                override fun onText(text: String, language: String) { deliveries++ }
            })
            session.start(LocalTranscriptLanguage.ES, LocalTranscriptSegmentation.WINDOWS, 120000)
            waitFor(session, "status", "\"listo\"")
            repeat(120) { session.acceptPcm(pcm(), "sin actividad") }
            assertTrue(host.entered.await(2000))
            if (reason == "off") session.stop() else session.resetStream()
            host.release.countDown(); waitFor(session, "busy", "false")
            if (reason == "reset") {
                // New generation on the same capture clock: [6,12) s decodes normally and is the only covered span.
                repeat(120) { session.acceptPcm(pcm(), "sin actividad") }; waitFor(session, "busy", "false")
            }
            val snapshot = session.diagnostics(); val timings = session.decodeTimings()
            session.stop(); waitFor(session, "worker", "false")
            assertEquals(1L, metric(session, "invalidatedDecodes"), reason)
            assertEquals(0L, metric(session, "decodeErrors"), reason)
            if (reason == "off") {
                assertEquals(0, deliveries, reason)
                assertTrue(snapshot.contains("\"attemptedAudioMs\":6000,\"coveredAudioMs\":0"), reason)
                assertEquals(listOf(Triple(0L, 6000L, LocalTranscriptSession.TIMING_INVALIDATED)), attempts(timings), reason)
            } else {
                assertEquals(1, deliveries, reason)
                assertTrue(snapshot.contains("\"attemptedAudioMs\":12000,\"coveredAudioMs\":6000"), reason)
                assertEquals(listOf(Triple(0L, 6000L, LocalTranscriptSession.TIMING_INVALIDATED),
                    Triple(6000L, 12000L, LocalTranscriptSession.TIMING_OK)), attempts(timings), reason)
            }
        }
    }

    @Test fun aLanguageRejectionIsProcessedAudioNotADecoderFailure() {
        val deliveries = mutableListOf<String>()
        val host = ScriptedDecoderHost(fails = { false }, output = { LocalDecodedText("this is english text", "en") })
        val session = scriptedSession(host, LocalTranscriptLanguage.AUTO, deliveries)
        feedWindows(session, 1)
        val snapshot = session.diagnostics(); val timings = session.decodeTimings()
        session.stop(); waitFor(session, "worker", "false")
        assertTrue(snapshot.contains("\"rejectedLanguage\":1"))
        assertTrue(snapshot.contains("\"decodeErrors\":0"))
        assertTrue(snapshot.contains("\"accepted\":0"))
        assertTrue(snapshot.contains("\"attemptedAudioMs\":6000,\"coveredAudioMs\":6000"))
        assertEquals(emptyList(), deliveries)
        assertEquals(listOf(Triple(0L, 6000L, LocalTranscriptSession.TIMING_OK)), attempts(timings))
    }

    @Test fun moreThan256WindowsKeepWholeRunCountersAndFlagTheTruncatedRing() {
        // Codex reproduction: 257 decodes left 256 ring entries starting at 3 s. The ring stays bounded;
        // `first` now says it is truncated, coverage counters still describe the whole run, and polling
        // the ring before it wraps recovers every attempt (what the benchmark does).
        val session = scriptedSession(ScriptedDecoderHost(fails = { false }))
        val collected = HashMap<Long, Triple<Long, Long, Long>>()
        fun poll() {
            val timings = session.decodeTimings()
            val first = Regex("\"first\":(\\d+)").find(timings)!!.groupValues[1].toLong()
            attempts(timings).forEachIndexed { index, attempt -> collected[first + index] = attempt }
        }
        feedWindows(session, 1)
        repeat(256) { hop ->
            repeat(60) { session.acceptPcm(pcm(), "sin actividad") }
            waitFor(session, "busy", "false")
            if (hop % 100 == 99) poll()
        }
        poll()
        val snapshot = session.diagnostics(); val timings = session.decodeTimings()
        session.stop(); waitFor(session, "worker", "false")
        assertTrue(timings.startsWith("{\"total\":257,\"first\":1,"))
        assertEquals(LocalTranscriptSession.TIMING_SLOTS, attempts(timings).size)
        assertEquals(3000L, attempts(timings).first().first)
        // 6 s + 256 hops of 3 s = 774 s, all decoded: whole-run counters are not limited by the ring.
        assertTrue(snapshot.contains("\"windowedAudioMs\":774000,\"attemptedAudioMs\":774000,\"coveredAudioMs\":774000"))
        assertEquals(257, collected.size)
        assertEquals((0L until 257L).map { Triple(it * 3000, it * 3000 + 6000, LocalTranscriptSession.TIMING_OK) },
            (0L until 257L).map { collected.getValue(it) })
    }

    @Test fun productionStartStillUsesTheReferencePolicy() {
        val platform = testPlatform()
        val session = LocalTranscriptSession(GatedDecoderHost(platform).also { it.release.countDown() }, platform)
        assertTrue(session.start(LocalTranscriptLanguage.ES, LocalTranscriptSegmentation.WINDOWS))
        waitFor(session, "status", "\"listo\"")
        assertTrue(session.diagnostics().contains("\"windowPolicy\":\"ref-6-3\""))
        session.stop(); waitFor(session, "worker", "false")
    }
}
