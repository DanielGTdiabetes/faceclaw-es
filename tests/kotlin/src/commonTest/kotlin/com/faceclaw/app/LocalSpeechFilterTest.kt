package com.faceclaw.app

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class LocalSpeechFilterTest {
    @Test fun rejectedAudioNeverRunsWhisperAndIsErasedAfterTheWindow() {
        val platform = testPlatform()
        val loaded = Latch(1, platform)
        val checked = Latch(1, platform)
        var input: FloatArray? = null
        var decodes = 0
        val session = LocalTranscriptSession(object : LocalTranscriptHost {
            override val dispatcher = CallbackDispatcher { it() }
            override fun loadDecoder(language: LocalTranscriptLanguage): LocalTranscriptDecoder {
                loaded.countDown()
                return object : LocalTranscriptDecoder {
                    override fun hasSpeech(samples: FloatArray): Boolean {
                        input = samples; checked.countDown(); return false
                    }
                    override fun decode(samples: FloatArray): LocalDecodedText {
                        decodes++; return LocalDecodedText("false text", "es")
                    }
                    override fun release() {}
                }
            }
        }, platform)
        assertTrue(session.start(LocalTranscriptLanguage.AUTO, LocalTranscriptSegmentation.WINDOWS, 120000))
        assertTrue(loaded.await(2000))
        val wait = platform.createCondition()
        repeat(300) {
            if (!session.diagnostics().contains("\"status\":\"listo\"")) wait.withLock { wait.awaitMs(10) }
        }
        val pcm = ByteArray(1600).also { bytes -> repeat(800) { i ->
            val value = if (i % 2 == 0) 100 else -100
            bytes[i * 2] = value.toByte(); bytes[i * 2 + 1] = (value shr 8).toByte()
        } }
        repeat(120) { session.acceptPcm(pcm, "sin actividad") }
        assertTrue(checked.await(2000))
        session.stop()
        repeat(300) { if (session.isWorkerActive()) wait.withLock { wait.awaitMs(10) } }
        assertEquals(0, decodes)
        assertTrue(input!!.all { it == 0f })
        assertTrue(session.diagnostics().contains("\"decodeCalls\":0"))
    }
    @Test fun quantitiesAndShortNegationsRemainContextButForeignLanguageDoesNot() {
        assertEquals("42", acceptedLocalText(LocalDecodedText("42", "es")))
        assertEquals("No", acceptedLocalText(LocalDecodedText("No", "ca")))
        assertEquals("", acceptedLocalText(LocalDecodedText("bonjour demain", "fr")))
        assertEquals("", acceptedLocalText(LocalDecodedText("...", "es")))
    }
}
