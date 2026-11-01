package com.faceclaw.app

import kotlin.test.Test
import kotlin.test.assertTrue
import kotlin.test.assertFalse
import kotlin.test.assertContentEquals
import kotlin.test.assertFails

class LocalProfileArchiveTest {
    private class Files : LocalProfileFiles {
        val data = mutableMapOf<String, ByteArray>()
        var failWrite = false
        var failReplace = false
        var lastRead: ByteArray? = null
        override fun exists(name: String) = data.containsKey(name)
        override fun read(name: String): ByteArray = data.getValue(name).copyOf().also { lastRead = it }
        override fun writeSynced(name: String, bytes: ByteArray) {
            if (failWrite) error("disk full")
            data[name] = bytes.copyOf()
        }
        override fun replace(from: String, to: String) {
            if (failReplace) error("rename failed")
            data[to] = data.remove(from) ?: error("missing temporary")
        }
        override fun remove(name: String) { data.remove(name) }
    }
    @Test fun originalSurvivesPreparationCancellationAndNewCommit() {
        val files = Files(); val old = ByteArray(80) { 7 }; val new = ByteArray(80) { 9 }
        files.data[LocalProfileArchive.ACTIVE] = old.copyOf()
        val archive = LocalProfileArchive(files); archive.preserveCurrent()
        assertContentEquals(old, files.data[LocalProfileArchive.ACTIVE])
        assertContentEquals(old, files.data[LocalProfileArchive.PREVIOUS])
        assertTrue(files.lastRead!!.all { it == 0.toByte() })
        files.data[LocalProfileArchive.ACTIVE] = new
        assertTrue(archive.restore())
        assertContentEquals(old, files.data[LocalProfileArchive.ACTIVE])
        assertContentEquals(old, files.data[LocalProfileArchive.PREVIOUS])
    }
    @Test fun failedPreservationLeavesBothProfilesIntact() {
        for (writeFailure in listOf(true, false)) {
            val files = Files(); val active = ByteArray(80) { 1 }; val previous = ByteArray(80) { 2 }
            files.data[LocalProfileArchive.ACTIVE] = active.copyOf(); files.data[LocalProfileArchive.PREVIOUS] = previous.copyOf()
            files.failWrite = writeFailure; files.failReplace = !writeFailure
            assertFails { LocalProfileArchive(files).preserveCurrent() }
            assertContentEquals(active, files.data[LocalProfileArchive.ACTIVE])
            assertContentEquals(previous, files.data[LocalProfileArchive.PREVIOUS])
            assertFalse(files.exists("archive.pending")); assertTrue(files.lastRead!!.all { it == 0.toByte() })
        }
    }
    @Test fun failedRestoreNeverRemovesOriginalArchiveOrActive() {
        val files = Files(); val active = ByteArray(80) { 1 }; val previous = ByteArray(80) { 2 }
        files.data[LocalProfileArchive.ACTIVE] = active.copyOf(); files.data[LocalProfileArchive.PREVIOUS] = previous.copyOf()
        files.failReplace = true
        assertFalse(LocalProfileArchive(files).restore())
        assertContentEquals(active, files.data[LocalProfileArchive.ACTIVE]); assertContentEquals(previous, files.data[LocalProfileArchive.PREVIOUS])
        files.failReplace = false
        assertTrue(LocalProfileArchive(files).restore())
        assertContentEquals(previous, files.data[LocalProfileArchive.ACTIVE])
    }
    @Test fun firstEnrollmentDoesNotInventAnArchive() {
        val files = Files(); val archive = LocalProfileArchive(files)
        archive.preserveCurrent(); assertFalse(archive.hasPrevious()); assertFalse(archive.restore()); assertTrue(files.data.isEmpty())
    }
    @Test fun truncatedArchiveCannotReplaceActiveProfile() {
        val files = Files(); val active = ByteArray(80) { 1 }
        files.data[LocalProfileArchive.ACTIVE] = active.copyOf(); files.data[LocalProfileArchive.PREVIOUS] = ByteArray(4)
        assertFalse(LocalProfileArchive(files).restore()); assertContentEquals(active, files.data[LocalProfileArchive.ACTIVE])
    }
}
