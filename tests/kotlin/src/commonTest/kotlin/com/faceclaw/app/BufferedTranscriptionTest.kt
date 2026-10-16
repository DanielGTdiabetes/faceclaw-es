package com.faceclaw.app

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.assertFailsWith

class BufferedTranscriptionTest {
    private val rate = VoiceCaptureSession.SAMPLE_RATE

    /** S16LE bytes of [seconds] of constant [amplitude] (full scale = 32767). */
    private fun tone(seconds: Double, amplitude: Int): ByteArray {
        val samples = ShortArray((seconds * rate).toInt()) { amplitude.toShort() }
        return AudioSegmentation.pcm16ToLittleEndian(samples, 0, samples.size)
    }

    @Test
    fun shortUtteranceIsOneNormalizedDecode() {
        val calls = mutableListOf<Int>()
        var peak = 0f
        val text = BufferedTranscription.transcribe(tone(2.0, 3000), true) { samples, count ->
            calls += count
            peak = AudioSegmentation.peakAmplitude(samples, count)
            " hola "
        }
        assertEquals("hola", text)
        assertEquals(listOf(2 * rate), calls)
        assertTrue(peak > 0.8f, "normalized like the live transcript: $peak")
    }

    @Test
    fun longUtteranceIsSplitIntoModelSizedSegmentsAndJoined() {
        val calls = mutableListOf<Int>()
        val text = BufferedTranscription.transcribe(tone(20.0, 3000), true) { _, count ->
            calls += count
            if (calls.size == 2) ", p2" else "p${calls.size}"
        }
        assertTrue(calls.size >= 3, "$calls")
        assertTrue(calls.all { it <= VoiceCaptureSession.TRANSCRIPT_SEGMENT_MAX_SAMPLES }, "$calls")
        assertEquals(20 * rate, calls.sum())
        // Leading punctuation attaches to the previous piece, as in the live transcript.
        assertEquals((listOf("p1, p2") + (3..calls.size).map { "p$it" }).joinToString(" "), text)
    }

    @Test
    fun whisperSkipsNearSilenceAndRejectsIncompleteOrOverlongInput() {
        var calls = 0
        assertEquals("", BufferedTranscription.transcribe(tone(3.0, 50), true) { _, _ -> calls++; "alucinación" })
        assertEquals(0, calls)
        assertEquals("", BufferedTranscription.transcribe(ByteArray(0), true) { _, _ -> "x" })
        var decoded = 0
        assertFailsWith<IllegalArgumentException> {
            BufferedTranscription.transcribe(tone(40.0, 3000), true) { _, _ -> error("must not decode a prefix") }
        }
        assertFailsWith<IllegalArgumentException> {
            BufferedTranscription.transcribe(ByteArray(3), true) { _, _ -> error("incomplete sample") }
        }
        BufferedTranscription.transcribe(tone(30.0, 3000), true) { _, count -> decoded += count; "" }
        assertEquals(BufferedTranscription.MAX_SAMPLES, decoded)
    }
}
