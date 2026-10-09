package com.faceclaw.whisperbench

import java.text.Normalizer
import kotlin.math.ceil

/**
 * Pure metrics, identical to evaluations/whisper-tensor/pc-reference/bench_metrics.py and checked
 * against metric_vectors.json by BenchMetricsTest.
 */
object BenchMetrics {
    data class Errors(val refWords: Int, val wordErrors: Int, val substitutions: Int, val deletions: Int,
        val insertions: Int, val refChars: Int, val charErrors: Int, val hypWords: Int)

    fun normalize(text: String): String {
        val lower = Normalizer.normalize(text, Normalizer.Form.NFC).lowercase()
        val spaced = buildString { lower.forEach { append(if (it.isLetterOrDigit()) it else ' ') } }
        return spaced.split(' ').filter { it.isNotEmpty() }.joinToString(" ")
    }

    /** Levenshtein distance and (substitutions, deletions, insertions) of one optimal alignment. */
    fun <T> editDistance(ref: List<T>, hyp: List<T>): IntArray {
        val cost = Array(ref.size + 1) { IntArray(hyp.size + 1) }
        for (i in 0..ref.size) cost[i][0] = i
        for (j in 0..hyp.size) cost[0][j] = j
        for (i in 1..ref.size) for (j in 1..hyp.size) {
            val same = ref[i - 1] == hyp[j - 1]
            cost[i][j] = minOf(cost[i - 1][j - 1] + if (same) 0 else 1, cost[i - 1][j] + 1, cost[i][j - 1] + 1)
        }
        var i = ref.size; var j = hyp.size; var subs = 0; var dels = 0; var ins = 0
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && cost[i][j] == cost[i - 1][j - 1] + if (ref[i - 1] == hyp[j - 1]) 0 else 1) {
                if (ref[i - 1] != hyp[j - 1]) subs++
                i--; j--
            } else if (i > 0 && cost[i][j] == cost[i - 1][j] + 1) { dels++; i-- } else { ins++; j-- }
        }
        return intArrayOf(cost[ref.size][hyp.size], subs, dels, ins)
    }

    fun errors(reference: String, hypothesis: String): Errors {
        val ref = normalize(reference); val hyp = normalize(hypothesis)
        val refWords = if (ref.isEmpty()) emptyList() else ref.split(' ')
        val hypWords = if (hyp.isEmpty()) emptyList() else hyp.split(' ')
        val words = editDistance(refWords, hypWords)
        val chars = editDistance(ref.toList(), hyp.toList())
        return Errors(refWords.size, words[0], words[1], words[2], words[3], ref.length, chars[0], hypWords.size)
    }

    /** Nearest-rank percentile; null for no values. */
    fun percentile(values: List<Long>, fraction: Double): Long? {
        if (values.isEmpty()) return null
        val ordered = values.sorted()
        val rank = maxOf(1, ceil(fraction * ordered.size).toInt())
        return ordered[rank - 1]
    }

    /** Union length of [start, end) intervals clipped to [from, to). */
    fun covered(intervals: List<LongArray>, from: Long, to: Long): Long {
        var total = 0L; var end = from
        for (interval in intervals.sortedBy { it[0] }) {
            val start = maxOf(interval[0], end); val stop = minOf(interval[1], to)
            if (stop > start) { total += stop - start; end = stop }
        }
        return total
    }

    /** Fixed-rate schedule for real-time replay: chunk `index` is due at start + index * 50 ms. */
    fun dueNanos(startNanos: Long, index: Long): Long = startNanos + index * 50_000_000L

    fun csvField(value: Any?): String {
        val text = value?.toString() ?: ""
        return if (text.any { it == ',' || it == '"' || it == '\n' }) "\"" + text.replace("\"", "\"\"") + "\"" else text
    }
}
