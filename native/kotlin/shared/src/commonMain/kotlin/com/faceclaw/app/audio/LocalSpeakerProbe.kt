package com.faceclaw.app

import kotlin.concurrent.Volatile
import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.round
import kotlin.math.sqrt

/**
 * Optional D0 diagnostic for [LocalSpeakerTracker]; nothing runs unless a probe is passed to the tracker.
 *
 * For each attributed window it measures the raw audio (duration, level, clipping, low-energy fraction)
 * and embeds two transformed copies of that same window, compared with the print the tracker uses:
 * - "recortado": leading and trailing low-energy frames removed. Energy only: it does not prove a clean,
 *   single-voice segment, and a mixed window stays mixed;
 * - "nivelado": one global gain, bounded to [MIN_GAIN]..[MAX_GAIN], towards [TARGET_RMS] on active frames.
 * Each print is compared with the saved profile and with the nearest session voice as it was before the
 * window (read only).
 *
 * Only bounded scalar aggregates are kept: no audio, text, prints or per-window rows. Copies and their
 * prints are zeroed after each window. The probe never changes the delivered label, the profile, the
 * session voices or any threshold; a failure is counted and ignored. At most [maxWindows] windows are
 * probed per session (two extra embeddings each); later windows are only counted as omitted.
 */
class LocalSpeakerProbe(private val maxWindows: Int = MAX_WINDOWS) {
    companion object {
        const val MAX_WINDOWS = 64
        /** 20 ms at 16 kHz. */
        const val FRAME = 320
        /** -50 dBFS: a frame under this RMS, or under [RELATIVE_LOW] of the loudest frame, is low-energy. */
        const val FLOOR_RMS = 0.00316
        const val RELATIVE_LOW = 0.1
        const val CLIP = 0.999f
        /** -23 dBFS over the active (not low-energy) frames. */
        const val TARGET_RMS = 0.0708
        const val MIN_GAIN = 0.25
        const val MAX_GAIN = 8.0
        /** Gains closer than this to 0 dB leave the copy as the original: no extra embedding. */
        const val UNCHANGED_GAIN_DB = 0.5
    }

    private class Stat {
        var n = 0L; private var sum = 0.0; private var min = Double.POSITIVE_INFINITY; private var max = Double.NEGATIVE_INFINITY
        fun add(x: Double) { if (!x.isFinite()) return; n++; sum += x; if (x < min) min = x; if (x > max) max = x }
        fun json(): String = if (n == 0L) "{\"n\":0}" else "{\"n\":$n,\"mean\":${r(sum / n)},\"min\":${r(min)},\"max\":${r(max)}}"
    }

    private class Variant(val name: String) {
        var embedded = 0L; var unchanged = 0L; var short = 0L; var failed = 0L
        val profile = Stat(); val profileDelta = Stat(); val nearest = Stat(); val nearestDelta = Stat()
        /** Decision zone against the profile (portador / dudosa / no portador) differs from the current print's. */
        var zoneChanged = 0L; var toWearer = 0L; var fromWearer = 0L
        var groupChanged = 0L
        fun json(): String = "{\"name\":\"$name\",\"embedded\":$embedded,\"unchanged\":$unchanged,\"short\":$short," +
            "\"failed\":$failed,\"profile\":${profile.json()},\"profileDelta\":${profileDelta.json()}," +
            "\"nearest\":${nearest.json()},\"nearestDelta\":${nearestDelta.json()},\"zoneChanged\":$zoneChanged," +
            "\"toWearer\":$toWearer,\"fromWearer\":$fromWearer,\"groupChanged\":$groupChanged}"
    }

    private var status = "activo"
    private var probed = 0L
    private var omitted = 0L
    private var errors = 0L
    private val durationMs = Stat(); private val rmsDb = Stat(); private val activeRmsDb = Stat(); private val peakDb = Stat()
    private val clipFraction = Stat(); private val lowFraction = Stat(); private val trimmedFraction = Stat()
    private val gainDb = Stat(); private val leveledClipFraction = Stat()
    private val currentProfile = Stat(); private val currentNearest = Stat()
    private val trimmed = Variant("recortado")
    private val leveled = Variant("nivelado")

    @Volatile
    private var snapshot = render()

    /** Scalars only; safe to read from any thread. */
    fun json(): String = snapshot

    /**
     * Called by the tracker with the raw window, the normalized print it is about to use, the profile and
     * the session voices' centroids. None of them is modified. [embed] returns a normalized print or null.
     */
    fun observe(samples: FloatArray, current: FloatArray, profile: FloatArray?, groups: List<FloatArray>,
        embed: (FloatArray) -> FloatArray?) {
        if (status != "activo") return
        if (probed >= maxWindows) { omitted++; snapshot = render(); return }
        probed++
        try {
            measure(samples, current, profile, groups, embed)
        } catch (_: Throwable) {
            errors++
        } finally {
            snapshot = render()
        }
    }

    /** End of the tracker's session: later windows are ignored, the aggregates stay readable. */
    fun close() {
        status = "cerrado"; snapshot = render()
    }

    private fun measure(samples: FloatArray, current: FloatArray, profile: FloatArray?, groups: List<FloatArray>,
        embed: (FloatArray) -> FloatArray?) {
        val frames = (samples.size + FRAME - 1) / FRAME
        if (frames == 0) return
        val frameRms = DoubleArray(frames)
        var energy = 0.0; var peak = 0.0; var clipped = 0
        for (f in 0 until frames) {
            var sum = 0.0
            val end = minOf(samples.size, (f + 1) * FRAME)
            for (i in f * FRAME until end) {
                val x = samples[i].toDouble(); sum += x * x
                val a = abs(x); if (a > peak) peak = a
                if (a >= CLIP) clipped++
            }
            energy += sum
            frameRms[f] = sqrt(sum / (end - f * FRAME))
        }
        val low = maxOf(FLOOR_RMS, (frameRms.maxOrNull() ?: 0.0) * RELATIVE_LOW)
        var lowFrames = 0; var activeEnergy = 0.0; var activeSamples = 0
        for (f in 0 until frames) {
            if (frameRms[f] < low) lowFrames++
            else {
                val n = minOf(samples.size, (f + 1) * FRAME) - f * FRAME
                activeEnergy += frameRms[f] * frameRms[f] * n; activeSamples += n
            }
        }
        durationMs.add(samples.size / 16.0)
        rmsDb.add(db(sqrt(energy / samples.size))); peakDb.add(db(peak))
        if (activeSamples > 0) activeRmsDb.add(db(sqrt(activeEnergy / activeSamples)))
        clipFraction.add(clipped.toDouble() / samples.size); lowFraction.add(lowFrames.toDouble() / frames)

        val baseProfile = profile?.let { VoicePrint.dot(it, current) }
        val baseGroup = nearest(groups, current)
        baseProfile?.let { currentProfile.add(it) }
        baseGroup?.let { currentNearest.add(it.second) }

        // Trimmed copy: only the low-energy extremes go; the inside of the window is untouched.
        var first = 0; while (first < frames && frameRms[first] < low) first++
        var last = frames - 1; while (last >= first && frameRms[last] < low) last--
        if (first > last) trimmed.short++
        else {
            val start = first * FRAME; val end = minOf(samples.size, (last + 1) * FRAME)
            trimmedFraction.add(1.0 - (end - start).toDouble() / samples.size)
            when {
                start == 0 && end == samples.size -> trimmed.unchanged++
                end - start < LocalSpeakerTracker.MIN_VOICED -> trimmed.short++
                else -> compare(trimmed, samples.copyOfRange(start, end), baseProfile, baseGroup, profile, groups, embed)
            }
        }
        frameRms.fill(0.0)

        // Leveled copy: one bounded gain for the whole window, measured on its active frames.
        if (activeSamples == 0) { leveled.short++; return }
        val gain = (TARGET_RMS / sqrt(activeEnergy / activeSamples)).coerceIn(MIN_GAIN, MAX_GAIN)
        val gainInDb = db(gain)
        gainDb.add(gainInDb)
        if (abs(gainInDb) < UNCHANGED_GAIN_DB) { leveled.unchanged++; return }
        var saturated = 0
        val copy = FloatArray(samples.size) {
            val y = samples[it] * gain.toFloat()
            if (abs(y) >= CLIP) saturated++
            y.coerceIn(-1f, 1f)
        }
        leveledClipFraction.add(saturated.toDouble() / samples.size)
        compare(leveled, copy, baseProfile, baseGroup, profile, groups, embed)
    }

    /** Embeds [copy], compares it pairwise with the current print and zeroes the copy and its print. */
    private fun compare(variant: Variant, copy: FloatArray, baseProfile: Double?, baseGroup: Pair<Int, Double>?,
        profile: FloatArray?, groups: List<FloatArray>, embed: (FloatArray) -> FloatArray?) {
        var print: FloatArray? = null
        try {
            print = try { embed(copy) } catch (_: Throwable) { null }
            if (print == null) { variant.failed++; return }
            variant.embedded++
            if (profile != null && baseProfile != null) {
                val similarity = VoicePrint.dot(profile, print)
                variant.profile.add(similarity); variant.profileDelta.add(similarity - baseProfile)
                val before = zone(baseProfile); val after = zone(similarity)
                if (before != after) variant.zoneChanged++
                if (before != 2 && after == 2) variant.toWearer++
                if (before == 2 && after != 2) variant.fromWearer++
            }
            val group = nearest(groups, print)
            if (group != null && baseGroup != null) {
                variant.nearest.add(group.second); variant.nearestDelta.add(group.second - baseGroup.second)
                if (group.first != baseGroup.first) variant.groupChanged++
            }
        } finally {
            copy.fill(0f); print?.fill(0f)
        }
    }

    private fun nearest(groups: List<FloatArray>, print: FloatArray): Pair<Int, Double>? {
        var best: Pair<Int, Double>? = null
        for ((index, centroid) in groups.withIndex()) {
            if (centroid.size != print.size) continue
            val similarity = VoicePrint.dot(centroid, print)
            if (best == null || similarity > best.second) best = index to similarity
        }
        return best
    }

    /** 2 = wearer, 1 = too close to call, 0 = another voice; the tracker's own thresholds. */
    private fun zone(similarity: Double): Int = when {
        similarity >= LocalSpeakerTracker.WEARER_MIN -> 2
        similarity > LocalSpeakerTracker.OTHER_MAX -> 1
        else -> 0
    }

    private fun render(): String =
        "{\"status\":\"$status\",\"windows\":$probed,\"omitted\":$omitted,\"errors\":$errors,\"maxWindows\":$maxWindows," +
            "\"window\":{\"durationMs\":${durationMs.json()},\"rmsDb\":${rmsDb.json()},\"activeRmsDb\":${activeRmsDb.json()}," +
            "\"peakDb\":${peakDb.json()},\"clipFraction\":${clipFraction.json()},\"lowEnergyFraction\":${lowFraction.json()}," +
            "\"trimmedFraction\":${trimmedFraction.json()},\"gainDb\":${gainDb.json()},\"leveledClipFraction\":${leveledClipFraction.json()}}," +
            "\"current\":{\"profile\":${currentProfile.json()},\"nearest\":${currentNearest.json()}}," +
            "\"variants\":[${trimmed.json()},${leveled.json()}],\"note\":\"energia, no prueba voz limpia\"}"
}

private fun db(x: Double): Double = 20 * log10(maxOf(x, 1e-9))
private fun r(x: Double): Double = round(x * 1000) / 1000
