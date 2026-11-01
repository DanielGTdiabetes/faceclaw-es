package com.faceclaw.app

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class LocalSpeakerProbeTest {
    /** Records every input and print; [print] chooses the print from the audio it is given. */
    private class Voices(val print: (FloatArray) -> FloatArray?) : LocalVoiceDecoder {
        override val dimension = 3
        val inputs = mutableListOf<FloatArray>()
        val prints = mutableListOf<FloatArray>()
        override fun embed(samples: FloatArray): FloatArray? {
            inputs.add(samples)
            return print(samples)?.also { prints.add(it) }
        }
        override fun release() {}
    }

    // Synthetic: constant-magnitude alternating samples, not speech.
    private fun window(silenceS: Double, loudS: Double, level: Float, tailS: Double = silenceS): FloatArray {
        val lead = (silenceS * 16000).toInt(); val body = (loudS * 16000).toInt(); val tail = (tailS * 16000).toInt()
        return FloatArray(lead + body + tail) { i ->
            if (i in lead until lead + body) (if (i % 2 == 0) level else -level) else 0f
        }
    }
    private fun peak(x: FloatArray) = x.maxOf { abs(it) }

    /** Full-length windows at their original level look like the wearer; any transformed copy does not. */
    private fun bySignal(fullSize: Int, level: Float) = Voices { s ->
        when {
            s.size != fullSize -> floatArrayOf(0.6f, 0.8f, 0f)
            abs(peak(s) - level) > 1e-4f -> floatArrayOf(0f, 1f, 0f)
            else -> floatArrayOf(1f, 0f, 0f)
        }
    }

    @Test fun theProbeComparesTrimmedAndLeveledCopiesWithoutChangingTheLabel() {
        val samples = window(0.5, 1.5, 0.3f)
        val original = samples.copyOf()
        val probe = LocalSpeakerProbe()
        val voices = bySignal(samples.size, 0.3f)
        val tracker = LocalSpeakerTracker(voices, floatArrayOf(1f, 0f, 0f), probe)

        assertEquals(LocalSpeakerLabel("portador", "portador"), tracker.attribute(samples, 24000))
        assertEquals(3, voices.inputs.size)                       // current print + two copies
        assertTrue(samples.contentEquals(original))               // the raw window is never modified
        assertTrue(voices.inputs[1].all { it == 0f } && voices.inputs[2].all { it == 0f })  // copies erased
        assertTrue(voices.prints.drop(1).all { p -> p.all { it == 0f } })                   // their prints too
        assertEquals(24000, voices.inputs[1].size)                // trimmed copy: only the 1.5 s of signal

        val json = probe.json()
        assertTrue(json.contains("\"status\":\"activo\",\"windows\":1,\"omitted\":0,\"errors\":0"), json)
        assertTrue(json.contains("\"lowEnergyFraction\":{\"n\":1,\"mean\":0.4,"), json)
        assertTrue(json.contains("\"trimmedFraction\":{\"n\":1,\"mean\":0.4,"), json)
        assertTrue(json.contains("\"current\":{\"profile\":{\"n\":1,\"mean\":1.0,"), json)
        // Both copies leave the wearer zone: cos 0.6 (float, just above OTHER_MAX: too close to call) and cos 0.
        assertTrue(json.contains("{\"name\":\"recortado\",\"embedded\":1,\"unchanged\":0,\"short\":0,\"failed\":0," +
            "\"profile\":{\"n\":1,\"mean\":0.6,"), json)
        assertTrue(json.contains("\"zoneChanged\":1,\"toWearer\":0,\"fromWearer\":1,\"groupChanged\":0},{\"name\":\"nivelado\",\"embedded\":1"), json)
        // -23 dBFS target over -10.5 dBFS active frames would need -12.5 dB: bounded at MIN_GAIN, no saturation.
        assertTrue(json.contains("\"gainDb\":{\"n\":1,\"mean\":-12.041,"), json)
        assertTrue(json.contains("\"leveledClipFraction\":{\"n\":1,\"mean\":0.0,"), json)
        assertTrue(json.contains("\"note\":\"energia, no prueba voz limpia\""))
    }

    @Test fun labelsAndSessionVoicesAreIdenticalWithAndWithoutTheProbe() {
        val windows = listOf(window(0.3, 1.2, 0.3f), window(0.0, 2.0, 0.02f), window(0.4, 1.1, 0.5f, 0.0),
            window(0.2, 1.4, 0.3f), window(0.6, 1.0, 0.01f))
        // The print depends on the level and length, so every transformed copy prints differently.
        fun voices() = Voices { s ->
            val p = peak(s).toDouble()
            floatArrayOf((p * 3).toFloat(), (s.size / 32000.0).toFloat(), if (p > 0.1) 0.2f else 1f)
        }
        val plain = voices(); val probed = voices()
        val off = LocalSpeakerTracker(plain, floatArrayOf(0.7f, 0.7f, 0.1f))
        val probe = LocalSpeakerProbe()
        val on = LocalSpeakerTracker(probed, floatArrayOf(0.7f, 0.7f, 0.1f), probe)
        for (w in windows) {
            assertEquals(off.attribute(w.copyOf(), 16000), on.attribute(w.copyOf(), 16000))
            assertEquals(off.voices, on.voices)
        }
        assertEquals(windows.size, plain.inputs.size)             // OFF: one embedding per window, as before
        assertTrue(probed.inputs.size in windows.size + 1..windows.size * 3)
        assertTrue(probe.json().contains("\"windows\":5,"))
    }

    @Test fun failingEmbeddingsAreCountedAndNeverChangeTheLabel() {
        val samples = window(0.5, 1.5, 0.3f)
        var calls = 0
        val voices = Voices { _ ->
            calls++
            when (calls) { 1 -> floatArrayOf(1f, 0f, 0f); 2 -> throw IllegalStateException("model"); else -> null }
        }
        val probe = LocalSpeakerProbe()
        val tracker = LocalSpeakerTracker(voices, floatArrayOf(1f, 0f, 0f), probe)
        assertEquals(LocalSpeakerLabel("portador", "portador"), tracker.attribute(samples, 24000))
        val json = probe.json()
        assertTrue(json.contains("{\"name\":\"recortado\",\"embedded\":0,\"unchanged\":0,\"short\":0,\"failed\":1"), json)
        assertTrue(json.contains("{\"name\":\"nivelado\",\"embedded\":0,\"unchanged\":0,\"short\":0,\"failed\":1"), json)
        assertTrue(voices.inputs.drop(1).all { input -> input.all { it == 0f } })
    }

    @Test fun windowsThatNeedNoCopyOrAreTooShortAfterTrimmingSkipTheExtraEmbedding() {
        // Already at about -23 dBFS and without low-energy extremes: both copies would equal the window.
        val steady = window(0.0, 1.5, 0.0708f)
        val voices = Voices { floatArrayOf(1f, 0f, 0f) }
        val probe = LocalSpeakerProbe()
        val tracker = LocalSpeakerTracker(voices, null, probe)
        tracker.attribute(steady, 24000)
        assertEquals(1, voices.inputs.size)
        // 0.8 s of signal inside 2.8 s: under MIN_VOICED once trimmed, so only the leveled copy is embedded.
        tracker.attribute(window(1.0, 0.8, 0.3f), 16000)
        assertEquals(3, voices.inputs.size)
        val json = probe.json()
        assertTrue(json.contains("{\"name\":\"recortado\",\"embedded\":0,\"unchanged\":1,\"short\":1,"), json)
        assertTrue(json.contains("{\"name\":\"nivelado\",\"embedded\":1,\"unchanged\":1,\"short\":0,"), json)
        // Without a profile only the nearest session voice is compared (voz-1 existed for the second window).
        assertTrue(json.contains("\"current\":{\"profile\":{\"n\":0},\"nearest\":{\"n\":1,"), json)
    }

    @Test fun theProbeIsBoundedKeepsNoRowsAndStopsWithTheSession() {
        val voices = Voices { floatArrayOf(1f, 0f, 0f) }
        val probe = LocalSpeakerProbe(maxWindows = 2)
        val tracker = LocalSpeakerTracker(voices, floatArrayOf(1f, 0f, 0f), probe)
        repeat(2) { tracker.attribute(window(0.5, 1.5, 0.3f), 24000) }
        val afterTwo = probe.json()
        repeat(40) { tracker.attribute(window(0.5, 1.5, 0.3f), 24000) }
        assertEquals(2 * 3 + 40, voices.inputs.size)              // omitted windows add no embedding
        val afterMany = probe.json()
        assertTrue(afterMany.contains("\"windows\":2,\"omitted\":40,"), afterMany)
        assertTrue(afterMany.length - afterTwo.length < 8)       // aggregates only, no per-window rows
        tracker.release()
        assertTrue(probe.json().startsWith("{\"status\":\"cerrado\",\"windows\":2,\"omitted\":40,"))
        probe.observe(window(0.5, 1.5, 0.3f), floatArrayOf(1f, 0f, 0f), null, emptyList()) { error("closed") }
        assertTrue(probe.json().contains("\"windows\":2,\"omitted\":40,"))
    }
}
