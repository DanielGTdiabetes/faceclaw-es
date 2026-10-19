package com.faceclaw.app

/** Handles encrypted bytes only. Each replacement must be atomic on the same filesystem. */
interface LocalProfileFiles {
    fun exists(name: String): Boolean
    fun read(name: String): ByteArray
    fun writeSynced(name: String, bytes: ByteArray)
    fun replace(from: String, to: String)
    fun remove(name: String)
}
class LocalProfileArchive(private val files: LocalProfileFiles) {
    companion object {
        const val ACTIVE = "profile.aes"
        const val PREVIOUS = "profile.previous.aes"
        private const val PENDING = "archive.pending"
    }
    fun hasPrevious(): Boolean = files.exists(PREVIOUS)
    /** Called during worker preparation, before the session may commit its new profile. */
    fun preserveCurrent() { if (files.exists(ACTIVE)) copyAtomic(ACTIVE, PREVIOUS) }
    /** Keeps the archive, so interrupted restoration never destroys the only original copy. */
    fun restore(): Boolean {
        if (!hasPrevious()) return false
        return try { copyAtomic(PREVIOUS, ACTIVE); true } catch (_: Throwable) { false }
    }
    private fun copyAtomic(from: String, to: String) {
        var bytes: ByteArray? = null
        try {
            bytes = files.read(from)
            check(bytes.size in 32..17000)
            files.writeSynced(PENDING, bytes)
            files.replace(PENDING, to)
        } finally { bytes?.fill(0); try { files.remove(PENDING) } catch (_: Throwable) {} }
    }
}
