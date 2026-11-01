package com.faceclaw.app

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class FingerprintedVerificationCacheTest {
    @Test
    fun avoidsRepeatVerificationUntilFileFingerprintChangesOrIsInvalidated() {
        val cache = FingerprintedVerificationCache<String>(testPlatform())
        var calls = 0
        assertTrue(cache.verify("medium:100:10") { calls++; true })
        assertTrue(cache.verify("medium:100:10") { calls++; false })
        assertEquals(1, calls, "same files must not rehash for the acquire after presence checking")

        assertFalse(cache.verify("medium:100:11") { calls++; false })
        assertEquals(2, calls, "replacement fingerprint must be verified again")

        cache.invalidate()
        assertTrue(cache.verify("medium:100:11") { calls++; true })
        assertEquals(3, calls, "an explicit downloader invalidation also forces verification")
    }
}
