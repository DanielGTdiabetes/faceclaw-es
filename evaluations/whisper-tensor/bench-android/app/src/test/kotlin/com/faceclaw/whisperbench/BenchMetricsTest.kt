package com.faceclaw.whisperbench

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class BenchMetricsTest {
    @Suppress("UNCHECKED_CAST")
    private fun vectors(): Map<String, Any?> =
        MiniJson(File(System.getProperty("metricVectors")!!).readText(Charsets.UTF_8)).parse() as Map<String, Any?>

    @Suppress("UNCHECKED_CAST")
    @Test fun sharedVectorsMatchThePcImplementation() {
        val v = vectors()
        for (case in v["normalize"] as List<Map<String, Any?>>) assertEquals(case["out"], BenchMetrics.normalize(case["in"] as String))
        for (case in v["errors"] as List<Map<String, Any?>>) {
            val got = BenchMetrics.errors(case["ref"] as String, case["hyp"] as String)
            val fields = mapOf("wordErrors" to got.wordErrors, "refWords" to got.refWords, "charErrors" to got.charErrors,
                "deletions" to got.deletions, "insertions" to got.insertions, "substitutions" to got.substitutions,
                "hypWords" to got.hypWords)
            for ((key, value) in case["expect"] as Map<String, Any?>) assertEquals((value as Double).toInt(), fields[key], "$case $key")
        }
        for (case in v["percentile"] as List<Map<String, Any?>>) {
            val values = (case["values"] as List<Any?>).map { (it as Double).toLong() }
            assertEquals((case["expect"] as Double).toLong(), BenchMetrics.percentile(values, case["fraction"] as Double))
        }
    }

    @Test fun coverageUnionAndPacingAreExact() {
        val windows = listOf(longArrayOf(0, 6000), longArrayOf(3000, 9000), longArrayOf(12000, 18000))
        assertEquals(15000, BenchMetrics.covered(windows, 0, 20000))
        assertEquals(2000, BenchMetrics.covered(windows, 10000, 14000))
        assertEquals(1_000_000_000L + 3 * 50_000_000L, BenchMetrics.dueNanos(1_000_000_000L, 3))
        assertEquals("\"a,b\"", BenchMetrics.csvField("a,b")); assertEquals("x", BenchMetrics.csvField("x"))
    }

    /**
     * Snapshot in LocalTranscriptSession.decodeTimings() format (asserted against the real session in
     * LocalWhisperPerformanceTest): ring of the last 256 attempts, window i = [3i, 3i+6) s.
     */
    private fun snapshot(total: Int, decodeMs: (Int) -> Long = { 800L + it % 7 }, outcome: (Int) -> Int = { 0 }): String {
        val first = maxOf(0, total - 256)
        return (first until total).joinToString(",", "{\"total\":$total,\"first\":$first,\"windows\":[", "]}") {
            "[${it * 3000L},${it * 3000L + 6000},${decodeMs(it)},${outcome(it)}]"
        }
    }

    // 19 min of looped speech (1140 s) take 380 windows of the 6/3 policy, the last one ending in the noise tail.
    private val speechEndMs = 1_140_000L

    @Test fun nineteenMinutesCollectedIncrementallyKeepWholeRunMetrics() {
        val collector = BenchMetrics.DecodeTimingCollector()
        for (total in 10..380 step 10) collector.ingest(snapshot(total)) // One poll per 30 s, as BenchRunner does.
        assertTrue(collector.complete); assertNull(collector.invalidReason)
        assertEquals(380L, collector.total)
        assertEquals(speechEndMs, collector.coveredMs(0, speechEndMs))
        assertEquals(BenchMetrics.percentile((0 until 380).map { 800L + it % 7 }, 0.95), collector.okPercentile(0.95))
    }

    @Test fun aSingleFinalSnapshotOfALongRunWithholdsMetricsInsteadOfReportingTheTail() {
        // Codex example: the last 256 windows alone cover 67.37 % of a fully decoded 19 min run.
        val tail = snapshot(380)
        val bounds = Regex("""\[(\d+),(\d+),\d+,\d+]""").findAll(tail)
            .map { longArrayOf(it.groupValues[1].toLong(), it.groupValues[2].toLong()) }.toList()
        assertEquals(67.37, 100.0 * BenchMetrics.covered(bounds, 0, speechEndMs) / speechEndMs, 0.005)
        val collector = BenchMetrics.DecodeTimingCollector()
        collector.ingest(tail)
        assertFalse(collector.complete)
        assertEquals("timing ring truncated: collected 256 of 380 decoder attempts", collector.invalidReason)
        assertNull(collector.coveredMs(0, speechEndMs)); assertNull(collector.okPercentile(0.5)); assertNull(collector.okPercentile(0.95))
    }

    @Test fun aPollGapMarksTheRunIncompleteAndInconsistentSnapshotsAreRejected() {
        val gap = BenchMetrics.DecodeTimingCollector()
        gap.ingest(snapshot(100)); gap.ingest(snapshot(400)) // Attempts 100..143 left the ring between polls.
        assertFalse(gap.complete); assertNull(gap.okPercentile(0.5))
        assertEquals("timing ring truncated: collected 356 of 400 decoder attempts", gap.invalidReason)
        val collector = BenchMetrics.DecodeTimingCollector()
        collector.ingest(snapshot(100))
        assertFailsWith<IllegalStateException> { collector.ingest("{\"total\":99,\"first\":0,\"windows\":[]}") }
    }

    @Test fun failedAndInvalidatedAttemptsAreTimedButNeverCoveredOrInPercentiles() {
        // Window [0,6) s fails (1), [3,9) s is invalidated by OFF/reset (2), [6,12) s succeeds (0).
        val collector = BenchMetrics.DecodeTimingCollector()
        collector.ingest(snapshot(3, decodeMs = { listOf(5000L, 4000L, 900L)[it] }, outcome = { listOf(1, 2, 0)[it] }))
        assertTrue(collector.complete)
        assertEquals(1, collector.outcomeCount(0)); assertEquals(1, collector.outcomeCount(1)); assertEquals(1, collector.outcomeCount(2))
        assertEquals(6000L, collector.coveredMs(0, 12000))
        assertEquals(900L, collector.okPercentile(0.95))
        assertEquals(5000L, collector.notOkMaxMs())
    }
}

/** org.json is stubbed in local unit tests; this reads the shared vectors (objects, arrays, strings, numbers). */
class MiniJson(private val text: String) {
    private var at = 0

    fun parse(): Any? = value()

    private fun skip() { while (at < text.length && text[at].isWhitespace()) at++ }

    private fun value(): Any? {
        skip()
        return when (text[at]) {
            '{' -> objectValue()
            '[' -> arrayValue()
            '"' -> string()
            't' -> { at += 4; true }
            'f' -> { at += 5; false }
            'n' -> { at += 4; null }
            else -> {
                val start = at
                while (at < text.length && (text[at].isDigit() || text[at] in "+-.eE")) at++
                text.substring(start, at).toDouble()
            }
        }
    }

    private fun objectValue(): Map<String, Any?> {
        val map = LinkedHashMap<String, Any?>()
        at++; skip()
        if (text[at] == '}') { at++; return map }
        do {
            skip(); val key = string(); skip(); at++ // ':'
            map[key] = value(); skip()
        } while (text[at++] == ',')
        return map
    }

    private fun arrayValue(): List<Any?> {
        val list = ArrayList<Any?>()
        at++; skip()
        if (text[at] == ']') { at++; return list }
        do { list.add(value()); skip() } while (text[at++] == ',')
        return list
    }

    private fun string(): String {
        val out = StringBuilder(); at++
        while (text[at] != '"') {
            if (text[at] == '\\') {
                at++
                when (text[at]) {
                    'n' -> out.append('\n'); 't' -> out.append('\t')
                    'u' -> { out.append(text.substring(at + 1, at + 5).toInt(16).toChar()); at += 4 }
                    else -> out.append(text[at])
                }
            } else out.append(text[at])
            at++
        }
        at++
        return out.toString()
    }
}
