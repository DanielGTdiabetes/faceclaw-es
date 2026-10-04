package com.faceclaw.app

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class LocalAsrConditionerTest {
    private fun tone(amplitude: Float, samples: Int = 96000, freq: Double = 220.0) =
        FloatArray(samples) { (amplitude * sin(2 * PI * freq * it / 16000)).toFloat() }

    /** Deterministic pseudo-noise, no platform RNG. */
    private fun noise(amplitude: Float, samples: Int = 96000): FloatArray {
        var state = 12345L
        return FloatArray(samples) {
            state = (state * 1103515245L + 12345L) and 0x7fffffffL
            amplitude * ((state % 2001L) - 1000L) / 1000f
        }
    }

    private fun rms(samples: FloatArray, from: Int = 0, to: Int = samples.size): Float {
        var sum = 0.0
        for (i in from until to) sum += (samples[i] * samples[i]).toDouble()
        return sqrt(sum / (to - from)).toFloat()
    }

    @Test fun quietSpeechLikeSignalIsLiftedTowardsTargetWithoutClipping() {
        // -50 dBFS-ish tone bursts over a -70 dBFS floor: a far voice.
        val floor = noise(0.0003f)
        val burst = tone(0.0045f)
        val window = FloatArray(96000) { if ((it / 16000) % 2 == 0) floor[it] + burst[it] else floor[it] }
        val before = rms(window, 0, 16000)
        val level = LocalAsrConditioner.condition(window)
        val after = rms(window, 4000, 16000)
        assertTrue(after > before * 10, "gain too small: $before -> $after")
        assertTrue(window.all { abs(it) <= LocalAsrConditioner.PEAK_LIMIT + 1e-4f })
        assertTrue(level.activeGainDb in 20..30, "gain dB ${level.activeGainDb}")
        assertTrue(level.loudDb in -55..-40, "loud dB ${level.loudDb}")
    }

    @Test fun quietSpeakerIsRaisedMoreThanLoudSpeakerInTheSameWindow() {
        val loud = tone(0.1f, freq = 180.0)
        val quiet = tone(0.004f, freq = 300.0)
        val floor = noise(0.0002f)
        // 0-2 s loud speaker, 2-4 s silence, 4-6 s quiet speaker.
        val window = FloatArray(96000) { floor[it] + when (it / 32000) { 0 -> loud[it]; 2 -> quiet[it]; else -> 0f } }
        val loudBefore = rms(window, 8000, 30000); val quietBefore = rms(window, 72000, 94000)
        LocalAsrConditioner.condition(window)
        val loudAfter = rms(window, 8000, 30000); val quietAfter = rms(window, 72000, 94000)
        assertTrue(quietAfter / quietBefore > 4 * (loudAfter / loudBefore),
            "quiet gain ${quietAfter / quietBefore} vs loud gain ${loudAfter / loudBefore}")
        assertTrue(quietAfter > loudAfter * 0.2f, "quiet speaker still far below loud one")
    }

    @Test fun noiseOnlyWindowIsNotPumpedToSpeechLevel() {
        val window = noise(0.0005f)
        LocalAsrConditioner.condition(window)
        // Expander keeps a noise-only window well below the -20 dBFS speech target.
        assertTrue(rms(window) < LocalAsrConditioner.TARGET_RMS * 0.3f, "noise rms ${rms(window)}")
    }

    @Test fun loudSignalIsNeverAttenuatedBelowUnityExceptPeakLimit() {
        val window = tone(0.3f)
        val before = rms(window)
        LocalAsrConditioner.condition(window)
        assertTrue(abs(rms(window) - before) / before < 0.05f)
        val hot = tone(0.99f)
        LocalAsrConditioner.condition(hot)
        assertTrue(hot.all { abs(it) <= LocalAsrConditioner.PEAK_LIMIT + 1e-4f })
    }

    @Test fun silenceAndDcStayInert() {
        val zero = FloatArray(96000)
        val level = LocalAsrConditioner.condition(zero)
        assertTrue(zero.all { it == 0f }); assertEquals(0, level.activeFrames)
        val dc = FloatArray(96000) { 0.2f }
        LocalAsrConditioner.condition(dc)
        assertTrue(dc.all { abs(it) < 1e-5f })
    }

    @Test fun levelStatsAreScalarHistogramsAndReset() {
        val stats = LocalAsrLevelStats()
        stats.add(LocalAsrConditioner.Level(-45, -55, -70, 24, 100))
        stats.add(LocalAsrConditioner.Level(-25, -38, -60, 6, 100))
        stats.add(LocalAsrConditioner.Level(-90, -120, -90, 0, 0))
        val json = stats.json()
        assertTrue(json.contains("\"windows\":3"), json)
        assertTrue(json.contains("\"loudWindows\":[1,0,0,1,1,0]"), json)
        assertTrue(json.contains("\"quietActiveWindows\":[0,1,0,1,0,0]"), json)
        assertTrue(json.contains("\"maxGainDb\":24"), json)
        stats.reset()
        assertTrue(stats.json().contains("\"windows\":0"))
    }

    @Test fun knownSpanishWhisperBoilerplateIsRejectedButNormalSpeechIsNot() {
        for (text in listOf("Subtítulos realizados por la comunidad de Amara.org", "¡Suscríbete al canal!",
            "Gracias por ver el video.", "Música")) {
            assertTrue(isKnownWhisperHallucination(text), text)
            assertEquals(LocalTextRejection.HALLUCINATION,
                localTextRejection(LocalDecodedText(text, "es", forced = true)), text)
        }
        for (text in listOf("Gracias, nos vemos mañana", "¿Has visto el vídeo que te mandé?", "La música estaba alta")) {
            assertFalse(isKnownWhisperHallucination(text), text)
        }
    }

    @Test fun sessionReportsEngineConditioningAndLevelsWithoutText() {
        val received = mutableListOf<FloatArray>()
        val host = object : LocalTranscriptHost {
            override val dispatcher = CallbackDispatcher { it() }
            override fun loadDecoder(language: LocalTranscriptLanguage) = object : LocalTranscriptDecoder {
                override val engine = "whisper-test"
                override fun decode(samples: FloatArray): LocalDecodedText {
                    received.add(samples.copyOf()); return LocalDecodedText("hola qué tal", "es", forced = true)
                }
                override fun release() {}
            }
        }
        val session = LocalTranscriptSession(host, testPlatform(), conditionAudio = true)
        assertTrue(session.start(LocalTranscriptLanguage.ES, LocalTranscriptSegmentation.WINDOWS))
        val condition = testPlatform().createCondition()
        var waits = 0
        while (!session.diagnostics().contains("\"status\":\"listo\"") && waits++ < 300) condition.withLock { condition.awaitMs(10) }
        // 6 s of weak syllable-like bursts (~-50 dBFS, 0.5 s on/off) as PCM16 chunks.
        val tone = tone(0.004f).also { t -> for (i in t.indices) if ((i / 8000) % 2 == 1) t[i] = 0f }
        repeat(120) { chunk ->
            val pcm = ByteArray(1600)
            repeat(800) { i ->
                val v = (tone[chunk * 800 + i] * 32767).toInt()
                pcm[i * 2] = v.toByte(); pcm[i * 2 + 1] = (v shr 8).toByte()
            }
            session.acceptPcm(pcm, "sin actividad")
        }
        waits = 0
        while (!(received.isNotEmpty() && session.diagnostics().contains("\"busy\":false")) && waits++ < 300) {
            condition.withLock { condition.awaitMs(10) }
        }
        val diag = session.diagnostics()
        assertEquals(1, received.size)
        assertTrue(rms(received[0]) > 0.03f, "decoder saw unconditioned audio: ${rms(received[0])}")
        assertTrue(diag.contains("\"engine\":\"whisper-test\""), diag)
        assertTrue(diag.contains("\"conditioned\":true"), diag)
        assertTrue(diag.contains("\"levels\":{\"windows\":1"), diag)
        assertFalse(diag.contains("hola"))
        session.stop()
    }
}
