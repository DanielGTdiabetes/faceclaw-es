package com.faceclaw.whisperbench

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals

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
