package com.faceclaw.app

import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * A3: level conditioning applied ONLY to the float copy handed to Whisper. The G2 capture,
 * the VAD and the participation buffer never see these samples.
 *
 * Whisper's log-mel features are not loudness-normalised, so a far voice that arrives at
 * -50 dBFS sits close to the feature floor. This conditioner:
 *  1. removes DC,
 *  2. estimates the noise floor (20th percentile of 20 ms frame RMS),
 *  3. applies a smoothed per-frame gain that lifts active frames towards ~-20 dBFS
 *     (max +30 dB), so a quiet speaker is raised more than a loud one in the same window,
 *  4. keeps frames near the noise floor 12 dB below the threshold gain (downward expander)
 *     so background noise is not pumped up to speech level,
 *  5. never attenuates below unity and scales the window down if any sample would exceed
 *     about -0.5 dBFS (no clipping).
 * It is not a speech detector and cannot add information the microphone did not capture.
 * The returned [Level] holds scalars only (no audio) for aggregate diagnostics.
 */
object LocalAsrConditioner {
    const val FRAME = 320
    const val TARGET_RMS = 0.1f
    const val MAX_GAIN = 31.62f
    const val PEAK_LIMIT = 0.944f
    const val NOISE_MARGIN = 2.5f
    const val EXPANDER = 0.25f
    private const val ATTACK = 0.5f
    private const val RELEASE = 0.15f

    /** Rounded dBFS. `loudDb`: 90th pct frame RMS; `quietActiveDb`: 25th pct of active frames. */
    data class Level(val loudDb: Int, val quietActiveDb: Int, val noiseDb: Int, val activeGainDb: Int, val activeFrames: Int)

    fun db(value: Float): Int = if (value <= 1e-6f) -120 else (20.0 * log10(value.toDouble())).roundToInt()

    private fun percentile(sorted: FloatArray, fraction: Float): Float =
        if (sorted.isEmpty()) 0f else sorted[((sorted.size - 1) * fraction).roundToInt().coerceIn(0, sorted.size - 1)]

    fun condition(samples: FloatArray): Level {
        val frames = samples.size / FRAME
        if (frames == 0) return Level(-120, -120, -120, 0, 0)
        var mean = 0.0
        for (v in samples) mean += v
        mean /= samples.size
        for (i in samples.indices) samples[i] = (samples[i] - mean).toFloat()

        val rms = FloatArray(frames) { f ->
            var sum = 0.0
            for (i in f * FRAME until (f + 1) * FRAME) sum += (samples[i] * samples[i]).toDouble()
            sqrt(sum / FRAME).toFloat()
        }
        val sorted = rms.copyOf().also { it.sort() }
        val noise = maxOf(percentile(sorted, 0.2f), 1e-5f)
        val threshold = noise * NOISE_MARGIN
        val loud = percentile(sorted, 0.9f)
        val active = rms.filter { it >= threshold }.toFloatArray().also { it.sort() }

        var previous = -1f
        var gainSum = 0.0
        val thresholdGain = (TARGET_RMS / threshold).coerceIn(1f, MAX_GAIN)
        for (f in 0 until frames) {
            val desired = if (rms[f] >= threshold) (TARGET_RMS / rms[f]).coerceIn(1f, MAX_GAIN)
                else maxOf(1f, thresholdGain * EXPANDER)
            val start = if (previous < 0f) desired else previous
            val gain = if (previous < 0f) desired
                else previous + (desired - previous) * (if (desired < previous) ATTACK else RELEASE)
            if (rms[f] >= threshold) gainSum += gain
            for (j in 0 until FRAME) {
                val i = f * FRAME + j
                samples[i] *= start + (gain - start) * (j + 1) / FRAME
            }
            previous = gain
        }
        for (i in frames * FRAME until samples.size) samples[i] *= maxOf(previous, 1f)
        var peak = 0f
        for (v in samples) peak = maxOf(peak, abs(v))
        if (peak > PEAK_LIMIT) {
            val scale = PEAK_LIMIT / peak
            for (i in samples.indices) samples[i] *= scale
        }
        val activeGain = if (active.isEmpty()) 1f else (gainSum / active.size).toFloat()
        return Level(db(loud), if (active.isEmpty()) -120 else db(percentile(active, 0.25f)), db(noise),
            db(activeGain), active.size)
    }
}

/** Spanish Whisper boilerplate typically produced on noise or silence (YouTube subtitle credits). */
fun isKnownWhisperHallucination(text: String): Boolean {
    val t = text.lowercase().replace(Regex("[^\\p{L}\\p{N} .]"), " ").replace(Regex("\\s+"), " ").trim()
    if (t.isEmpty()) return false
    if (t.contains("amara.org") || t.contains("amara org")) return true
    if (t.contains("subtítulos realizados por") || t.contains("subtítulos por la comunidad")) return true
    if (t.contains("suscríbete") || t.contains("suscribete")) return true
    return t.removeSuffix(".").trim() in setOf("gracias por ver", "gracias por ver el video", "gracias por ver el vídeo",
        "música", "musica", "aplausos", "risas")
}

/**
 * Whisper decoding loops ("y luego y luego y luego…", one word repeated many times, a sentence repeated).
 * Stand-in for the reference implementation's compression-ratio check (>2.4), which needs zlib.
 * Tuned to keep natural repetitions such as "no, no, no" or "sí, sí, sí":
 *  - one word repeated 5+ times in a row,
 *  - an n-gram of 2..6 words repeated 3+ times in a row,
 *  - 12+ words with fewer than 35 % distinct (a long low-information text).
 */
fun isRepetitiveWhisperText(text: String): Boolean {
    val words = Regex("[\\p{L}\\p{N}]+").findAll(text.lowercase()).map { it.value }.toList()
    if (words.size < 5) return false
    var run = 1
    for (i in 1 until words.size) {
        run = if (words[i] == words[i - 1]) run + 1 else 1
        if (run >= 5) return true
    }
    for (n in 2..6) {
        for (start in 0..words.size - n * 3) {
            val unit = words.subList(start, start + n)
            var repeats = 1
            while (start + (repeats + 1) * n <= words.size &&
                words.subList(start + repeats * n, start + (repeats + 1) * n) == unit) repeats++
            if (repeats >= 3) return true
        }
    }
    return words.size >= 12 && words.toSet().size < words.size * 0.35
}

/** Aggregate histogram of window levels. Scalars only, reset per session. */
class LocalAsrLevelStats {
    companion object {
        /** Bucket lower bounds in dBFS: <-60, -60, -50, -40, -30, >=-20. */
        val EDGES = intArrayOf(-60, -50, -40, -30, -20)
    }
    private val loud = LongArray(EDGES.size + 1)
    private val quiet = LongArray(EDGES.size + 1)
    private var windows = 0L
    private var gainDbSum = 0L
    private var gainDbMax = 0
    private var noiseDbSum = 0L

    private fun bucket(db: Int): Int { var b = 0; while (b < EDGES.size && db >= EDGES[b]) b++; return b }

    fun add(level: LocalAsrConditioner.Level) {
        windows++
        loud[bucket(level.loudDb)]++
        if (level.activeFrames > 0) quiet[bucket(level.quietActiveDb)]++
        gainDbSum += level.activeGainDb; gainDbMax = maxOf(gainDbMax, level.activeGainDb)
        noiseDbSum += level.noiseDb
    }

    fun reset() { loud.fill(0); quiet.fill(0); windows = 0; gainDbSum = 0; gainDbMax = 0; noiseDbSum = 0 }

    fun json(): String = "\"levels\":{\"windows\":$windows," +
        "\"bucketsDbfs\":\"<-60,-60,-50,-40,-30,>=-20\"," +
        "\"loudWindows\":[${loud.joinToString(",")}],\"quietActiveWindows\":[${quiet.joinToString(",")}]," +
        "\"avgNoiseDb\":${if (windows == 0L) 0 else noiseDbSum / windows}," +
        "\"avgGainDb\":${if (windows == 0L) 0 else gainDbSum / windows},\"maxGainDb\":$gainDbMax}"
}
