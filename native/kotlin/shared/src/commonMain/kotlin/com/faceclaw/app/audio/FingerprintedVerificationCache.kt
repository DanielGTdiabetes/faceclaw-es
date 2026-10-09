package com.faceclaw.app

/**
 * Keeps an expensive verification result only while the caller's immutable
 * fingerprint is unchanged. A replacement must produce a different
 * fingerprint; callers can also invalidate explicitly when their downloader
 * knows it has replaced files.
 */
class FingerprintedVerificationCache<T>(platform: ProtocolPlatform = protocolPlatform()) {
    private val lock = platform.createLock()
    private var hasEntry = false
    private var cachedFingerprint: T? = null
    private var cachedResult = false

    fun verify(fingerprint: T, verifier: () -> Boolean): Boolean = lock.withLock {
        if (hasEntry && cachedFingerprint == fingerprint) return cachedResult
        val result = verifier()
        cachedFingerprint = fingerprint
        cachedResult = result
        hasEntry = true
        result
    }

    fun invalidate() = lock.withLock {
        hasEntry = false
        cachedFingerprint = null
        cachedResult = false
    }
}
