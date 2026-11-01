package com.faceclaw.app

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class LocationLookupCoreTest {
    private fun fix(name: String, accuracy: Float, ageMs: Long = 0L) = LocationSample(name, accuracy, ageMs)

    private fun precise() = LocationLookupCore<String>(precisePermission = true)

    @Test
    fun recentPreciseCacheIsReturnedWithoutRequests() {
        val core = precise()
        core.begin(listOf(fix("old-network", 900f, 30_000L), fix("gps-cache", 8f, 90_000L)), requests = 3)
        assertTrue(core.finished)
        assertEquals("gps-cache", core.result?.value)
    }

    @Test
    fun recentImpreciseCacheStillQueriesProviders() {
        val core = precise()
        core.begin(listOf(fix("network-cache", 400f, 10_000L)), requests = 2)
        assertFalse(core.finished)
    }

    @Test
    fun cacheOlderThanTwoMinutesIsNeverReturnedAtOnce() {
        val core = precise()
        core.begin(listOf(fix("gps-cache", 5f, LocationLookupCore.FRESH_MS + 1L)), requests = 1)
        assertFalse(core.finished)
    }

    @Test
    fun firstPreciseLiveFixWinsEvenBeforeSlowerProviders() {
        val core = precise()
        core.begin(emptyList(), requests = 3)
        core.onRequestEnded(fix("network", 600f))
        assertFalse(core.finished, "a coarse network fix must not end the wait for GPS")
        core.onRequestEnded(fix("fused", 6f))
        assertTrue(core.finished)
        assertEquals("fused", core.result?.value)
    }

    @Test
    fun afterRelaxAStreetLevelFixIsEnough() {
        val core = precise()
        core.begin(emptyList(), requests = 3)
        core.onRequestEnded(fix("network", 60f))
        assertFalse(core.finished)
        core.onRelax()
        assertTrue(core.finished)
        assertEquals("network", core.result?.value)
    }

    @Test
    fun afterRelaxALaterStreetLevelFixEndsTheLookup() {
        val core = precise()
        core.begin(emptyList(), requests = 3)
        core.onRelax()
        assertFalse(core.finished)
        core.onRequestEnded(fix("network", 1500f))
        assertFalse(core.finished)
        core.onRequestEnded(fix("fused", 45f))
        assertTrue(core.finished)
        assertEquals("fused", core.result?.value)
    }

    @Test
    fun deadlineReturnsTheMostAccurateFreshFix() {
        val core = precise()
        core.begin(listOf(fix("network-cache", 150f, 60_000L)), requests = 3)
        core.onRequestEnded(fix("network", 900f))
        core.onRelax()
        assertFalse(core.finished)
        core.onDeadline()
        assertEquals("network-cache", core.result?.value, "a fresher fix is not better than a more accurate recent one")
    }

    @Test
    fun freshImpreciseFixBeatsStaleCache() {
        val core = precise()
        core.begin(listOf(fix("gps-cache", 5f, 10L * 60_000L)), requests = 2)
        core.onRequestEnded(fix("network", 1200f))
        core.onDeadline()
        assertEquals("network", core.result?.value)
    }

    @Test
    fun allRequestsEndingWithoutFixFallsBackToNewestCache() {
        val core = precise()
        core.begin(listOf(fix("older", 10f, 3L * 3_600_000L), fix("newer", 30f, 20L * 60_000L)), requests = 2)
        core.onRequestEnded(null)
        assertFalse(core.finished)
        core.onRequestEnded(null)
        assertTrue(core.finished)
        assertEquals("newer", core.result?.value)
    }

    @Test
    fun cacheOlderThanADayIsNotAFallback() {
        val core = precise()
        core.begin(listOf(fix("ancient", 5f, LocationLookupCore.MAX_CACHE_MS + 1L)), requests = 1)
        core.onDeadline()
        assertTrue(core.finished)
        assertNull(core.result)
    }

    @Test
    fun noProvidersFinishesImmediatelyWithCacheOrNothing() {
        val withCache = precise()
        withCache.begin(listOf(fix("cache", 50f, 30L * 60_000L)), requests = 0)
        assertEquals("cache", withCache.result?.value)

        val empty = precise()
        empty.begin(emptyList(), requests = 0)
        assertTrue(empty.finished)
        assertNull(empty.result)
    }

    @Test
    fun approximatePermissionTakesFirstCoarseFixOrRecentCache() {
        val cached = LocationLookupCore<String>(precisePermission = false)
        cached.begin(listOf(fix("coarse-cache", 2000f, 60_000L)), requests = 2)
        assertEquals("coarse-cache", cached.result?.value)

        val live = LocationLookupCore<String>(precisePermission = false)
        live.begin(emptyList(), requests = 2)
        live.onRequestEnded(fix("coarse", 2000f))
        assertTrue(live.finished)
        assertEquals("coarse", live.result?.value)
    }

    @Test
    fun unknownAccuracyIsNeverPreciseAndRanksLast() {
        val core = precise()
        core.begin(listOf(fix("no-accuracy-cache", -1f, 1_000L)), requests = 2)
        assertFalse(core.finished)
        core.onRequestEnded(fix("no-accuracy", -1f))
        core.onRelax()
        assertFalse(core.finished)
        core.onRequestEnded(fix("network", 500f))
        assertTrue(core.finished)
        assertEquals("network", core.result?.value)
    }

    @Test
    fun negativeAgesAndLateEventsAreIgnored() {
        val core = precise()
        core.begin(listOf(fix("future", 3f, -5_000L)), requests = 1)
        assertFalse(core.finished, "a fix from the future is not a usable cache")
        core.onRequestEnded(fix("gps", 4f))
        assertEquals("gps", core.result?.value)
        core.onRequestEnded(fix("late", 1f))
        core.onDeadline()
        assertEquals("gps", core.result?.value)
    }
}
