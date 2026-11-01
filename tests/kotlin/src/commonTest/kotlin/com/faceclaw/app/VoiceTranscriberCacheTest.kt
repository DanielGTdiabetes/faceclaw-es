package com.faceclaw.app

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class VoiceTranscriberCacheTest {
    private class Model(val id: Int) : OfflineTranscriber {
        var releases = 0
        override fun recognize(samples: FloatArray, count: Int): String = "model-$id:$count"
        override fun release() { releases++ }
    }
    private class Fixture {
        val models = mutableListOf<Model>()
        val cache = VoiceTranscriberCache(load = { Model(models.size).also { models.add(it) } }, platform = testPlatform())
    }

    @Test fun chatReusesModelButEachUtteranceHasItsOwnSamples() {
        val f = Fixture()
        f.cache.setRetain(true)
        val first = f.cache.acquire(VoiceModelKind.WHISPER_SMALL)
        assertEquals("model-0:10", first.recognize(FloatArray(10), 10))
        first.release()
        val second = f.cache.acquire(VoiceModelKind.WHISPER_SMALL)
        assertEquals("model-0:20", second.recognize(FloatArray(20), 20))
        second.release()
        assertEquals(1, f.models.size)
        assertEquals(0, f.models[0].releases)
        f.cache.setRetain(false)
        assertEquals(1, f.models[0].releases)
    }

    @Test fun ordinaryCaptureDoesNotRetainAndReleaseIsIdempotent() {
        val f = Fixture()
        val first = f.cache.acquire(VoiceModelKind.WHISPER)
        first.release(); first.release()
        f.cache.acquire(VoiceModelKind.WHISPER).release()
        assertEquals(2, f.models.size)
        assertEquals(listOf(1, 1), f.models.map { it.releases })
    }

    @Test fun closeDuringDecodeDefersDestructionAndCannotPopulateAReopenedChat() {
        val f = Fixture()
        f.cache.setRetain(true)
        val old = f.cache.acquire(VoiceModelKind.WHISPER_SMALL)
        f.cache.setRetain(false)
        assertEquals(0, f.models[0].releases)
        f.cache.setRetain(true)
        assertEquals("model-0:5", old.recognize(FloatArray(5), 5))
        old.release()
        assertEquals(1, f.models[0].releases)
        f.cache.acquire(VoiceModelKind.WHISPER_SMALL).release()
        assertEquals(2, f.models.size)
        f.cache.setRetain(false)
    }

    @Test fun changingModelDisposesOldModelAndDoesNotReuseBusyRecognizers() {
        val f = Fixture()
        f.cache.setRetain(true)
        f.cache.acquire(VoiceModelKind.WHISPER).release()
        val small = f.cache.acquire(VoiceModelKind.WHISPER_SMALL)
        assertEquals(1, f.models[0].releases)
        val other = f.cache.acquire(VoiceModelKind.WHISPER_SMALL)
        assertEquals(3, f.models.size)
        small.release(); other.release()
        assertEquals(1, f.models[2].releases)
        f.cache.setRetain(false)
        assertEquals(listOf(1, 1, 1), f.models.map { it.releases })
    }

    @Test fun lateLeaseFromDifferentModelCannotReplaceSelectedModel() {
        val f = Fixture()
        f.cache.setRetain(true)
        val old = f.cache.acquire(VoiceModelKind.WHISPER)
        val small = f.cache.acquire(VoiceModelKind.WHISPER_SMALL)
        old.release(); small.release()
        assertEquals(1, f.models[0].releases)
        f.cache.acquire(VoiceModelKind.WHISPER_SMALL).release()
        assertEquals(2, f.models.size)
        f.cache.setRetain(false)
    }

    @Test fun failedLoadCanRetryWithoutPoisoningTheCache() {
        var attempts = 0
        val model = Model(0)
        val cache = VoiceTranscriberCache(load = {
            attempts++
            if (attempts == 1) error("failed")
            model
        }, platform = testPlatform())
        cache.setRetain(true)
        assertFailsWith<IllegalStateException> { cache.acquire(VoiceModelKind.WHISPER) }
        cache.acquire(VoiceModelKind.WHISPER).release()
        cache.acquire(VoiceModelKind.WHISPER).release()
        assertEquals(2, attempts)
        cache.setRetain(false)
        assertEquals(1, model.releases)
    }
}
