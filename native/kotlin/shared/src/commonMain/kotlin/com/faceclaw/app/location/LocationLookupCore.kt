package com.faceclaw.app

import kotlin.jvm.JvmField

/** One position candidate: [value] is the platform fix, the rest is what the lookup compares. */
class LocationSample<T>(
    @JvmField val value: T,
    /** Estimated horizontal accuracy in metres; negative when the platform gave none. */
    @JvmField val accuracyMeters: Float,
    /** Age when sampled, measured on a monotonic clock where the platform allows it. */
    @JvmField val ageMs: Long,
)

/**
 * Decisions of the one-shot phone location lookup behind the assistant's
 * `location.get_current` and Weather. The platform adapter owns the OS requests and the
 * two timers and feeds their outcomes in; after every call it checks [finished] and
 * returns [result] (null means no position at all).
 *
 * - A cached fix no older than [FRESH_MS] is returned at once when it is within
 *   [PRECISE_ACCURACY_M], or whatever its accuracy when only approximate permission is held
 *   (a new request could not do better).
 * - Otherwise every usable provider is queried at once. The first live fix within
 *   [PRECISE_ACCURACY_M] wins. After [RELAX_AFTER_MS] the best fresh fix within
 *   [ACCEPTABLE_ACCURACY_M] is enough. At [DEADLINE_MS], or once every request has ended, the
 *   most accurate fresh fix wins, then the newest cache up to [MAX_CACHE_MS]. Old fixes keep
 *   their real age: callers report them as stale rather than as current.
 */
class LocationLookupCore<T>(private val precisePermission: Boolean) {
    companion object {
        /** Matches location.get_current's `is_stale` limit. */
        const val FRESH_MS = 2L * 60L * 1000L
        const val MAX_CACHE_MS = 24L * 60L * 60L * 1000L
        /** Typical of a GPS or Wi-Fi-assisted fused fix; enough to stop waiting. */
        const val PRECISE_ACCURACY_M = 20f
        /** Street-level; accepted once [RELAX_AFTER_MS] has passed without a precise fix. */
        const val ACCEPTABLE_ACCURACY_M = 100f
        const val RELAX_AFTER_MS = 3_000L
        const val DEADLINE_MS = 7_000L
    }

    private var cached: LocationSample<T>? = null
    private var best: LocationSample<T>? = null
    private var pending = 0
    private var relaxed = false

    var finished = false
        private set
    var result: LocationSample<T>? = null
        private set

    /**
     * Start with the platform's cached fixes and the number of requests the adapter is about to
     * make. A request that fails to start must still be reported through [onRequestEnded].
     */
    fun begin(caches: List<LocationSample<T>>, requests: Int) {
        if (finished) return
        val usable = caches.filter { it.ageMs in 0L..MAX_CACHE_MS }
        cached = mostAccurate(usable.filter { it.ageMs <= FRESH_MS }) ?: usable.minByOrNull { it.ageMs }
        val fresh = cached?.takeIf { it.ageMs <= FRESH_MS }
        if (fresh != null && goodEnough(fresh, PRECISE_ACCURACY_M)) {
            finish(fresh)
            return
        }
        pending = maxOf(0, requests)
        if (pending == 0) finish(fallback())
    }

    /** One request ended, with its fix or with null when it failed, was refused or timed out. */
    fun onRequestEnded(sample: LocationSample<T>?) {
        if (finished) return
        if (pending > 0) pending--
        if (sample != null && sample.ageMs in 0L..FRESH_MS) {
            val current = best
            if (current == null || moreAccurate(sample, current)) best = sample
            if (goodEnough(sample, if (relaxed) ACCEPTABLE_ACCURACY_M else PRECISE_ACCURACY_M)) {
                finish(sample)
                return
            }
        }
        if (pending == 0) finish(fallback())
    }

    /** [RELAX_AFTER_MS] has passed. */
    fun onRelax() {
        if (finished) return
        relaxed = true
        val candidate = bestFresh()
        if (candidate != null && goodEnough(candidate, ACCEPTABLE_ACCURACY_M)) finish(candidate)
    }

    /** [DEADLINE_MS] has passed. */
    fun onDeadline() {
        if (!finished) finish(fallback())
    }

    private fun goodEnough(sample: LocationSample<T>, limitMeters: Float): Boolean =
        !precisePermission || (sample.accuracyMeters >= 0f && sample.accuracyMeters <= limitMeters)

    private fun bestFresh(): LocationSample<T>? =
        mostAccurate(listOfNotNull(best, cached?.takeIf { it.ageMs <= FRESH_MS }))

    private fun fallback(): LocationSample<T>? = bestFresh() ?: cached

    private fun mostAccurate(samples: List<LocationSample<T>>): LocationSample<T>? {
        var chosen: LocationSample<T>? = null
        for (sample in samples) {
            if (chosen == null || moreAccurate(sample, chosen)) chosen = sample
        }
        return chosen
    }

    /** Smaller accuracy radius wins (unknown counts as worst); ties go to the newer fix. */
    private fun moreAccurate(a: LocationSample<T>, b: LocationSample<T>): Boolean {
        val ra = rank(a)
        val rb = rank(b)
        return ra < rb || (ra == rb && a.ageMs < b.ageMs)
    }

    private fun rank(sample: LocationSample<T>): Float =
        if (sample.accuracyMeters >= 0f) sample.accuracyMeters else Float.MAX_VALUE

    private fun finish(sample: LocationSample<T>?) {
        finished = true
        result = sample
    }
}
