package com.faceclaw.app

import android.content.Context
import android.content.Intent
import android.media.AudioFormat
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.RecognitionSupport
import android.speech.RecognitionSupportCallback
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit

/** Public on-device API, external G2 PCM only. No default/cloud recognizer or phone AudioRecord. */
@android.annotation.TargetApi(33)
class FaceclawSystemTranscriber(context: Context) {
    companion object {
        @JvmStatic fun isAvailable(context: Context): Boolean = Build.VERSION.SDK_INT >= 33 &&
            Build.BRAND.equals("google", ignoreCase = true) && Build.MODEL.startsWith("Pixel") &&
            SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
    }
    private val app = context.applicationContext
    private val handler = Handler(Looper.getMainLooper())
    private val queue = ArrayBlockingQueue<ByteArray>(20)
    private val lock = Any()
    @Volatile private var active = false
    @Volatile private var ready = false
    @Volatile private var worker = false
    @Volatile private var generation = 0
    @Volatile private var status = "inactivo"
    private var recognizer: SpeechRecognizer? = null
    private var reader: ParcelFileDescriptor? = null
    private var writer: ParcelFileDescriptor? = null
    private var listener: FaceclawLocalTranscriptListener? = null
    private var deadline = 0L
    private var chunks = 0L
    private var delivered = 0L
    private var dropped = 0L
    private var lastSegmentMs = 0L
    private var errors = 0L
    private var liveError = ""

    fun setListener(value: FaceclawLocalTranscriptListener?) { listener = value }
    fun start(language: String, modelId: String, maxMs: Long): Boolean {
        if (Looper.myLooper() != Looper.getMainLooper() || active || worker || modelId != "android-system" ||
            language != "es" || !isAvailable(app)) return false
        deadline = SystemClock.elapsedRealtime() + maxMs.coerceIn(1, 86_400_000)
        synchronized(lock) { chunks = 0; delivered = 0; dropped = 0; lastSegmentMs = 0; errors = 0; liveError = "" }
        active = true
        openStream()
        return active
    }
    private fun openStream() {
        if (!active || worker) return
        ready = false; status = "cargando"
        val token = ++generation
        try {
            val pipe = ParcelFileDescriptor.createPipe(); reader = pipe[0]; writer = pipe[1]
            val request = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-ES")
                .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
                .putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, pipe[0])
                .putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, 1)
                .putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
                .putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, 16000)
                .putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION, RecognizerIntent.EXTRA_AUDIO_SOURCE)
            val speech = SpeechRecognizer.createOnDeviceSpeechRecognizer(app); recognizer = speech
            speech.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {
                    if (active && generation == token) { ready = true; status = "listo" }
                }
                override fun onError(error: Int) { if (active && generation == token) fail("reconocimiento-$error") }
                override fun onSegmentResults(results: Bundle) { publish(token, results) }
                override fun onResults(results: Bundle?) {
                    if (!active || generation != token) return
                    if (results != null) publish(token, results)
                    // A non-segmented completion cannot silently switch to the phone microphone.
                    fail("sesion-no-continua")
                }
                override fun onEndOfSegmentedSession() { if (active && generation == token) fail("flujo-finalizado") }
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onPartialResults(partialResults: Bundle?) {}
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
            // Refuse missing Spanish instead of downloading a model or falling back to a cloud engine.
            speech.checkRecognitionSupport(request, app.mainExecutor, object : RecognitionSupportCallback {
                override fun onSupportResult(support: RecognitionSupport) {
                    if (!active || generation != token) return
                    if (!support.installedOnDeviceLanguages.any { it.equals("es-ES", ignoreCase = true) }) {
                        fail("espanol-no-instalado"); return
                    }
                    try { startWriter(token, pipe[1]); speech.startListening(request) }
                    catch (_: Exception) { fail("inicio-fallido") }
                }
                override fun onError(error: Int) { if (active && generation == token) fail("compatibilidad-$error") }
            })
            handler.postDelayed({ if (active && generation == token && !ready) fail("inicio-agotado") }, 10000)
        } catch (_: Exception) { fail("motor-no-disponible") }
    }
    private fun startWriter(token: Int, descriptor: ParcelFileDescriptor) {
        worker = true
        Thread({
            try {
                ParcelFileDescriptor.AutoCloseOutputStream(descriptor).use { output ->
                    while (active && generation == token && SystemClock.elapsedRealtime() < deadline) {
                        val bytes = queue.poll(100, TimeUnit.MILLISECONDS) ?: continue
                        try { if (active && generation == token) output.write(bytes) } finally { bytes.fill(0) }
                    }
                }
            } catch (_: Exception) { handler.post { if (active && generation == token) fail("audio-fallido") } }
            finally { worker = false }
        }, "FaceclawSystemPcm").apply { isDaemon = true; start() }
    }
    fun acceptPcm(pcm: ByteArray?, vadState: String) {
        if (!active || !ready || pcm == null || pcm.size != 1600) return
        if (SystemClock.elapsedRealtime() >= deadline) { fail("plazo-agotado"); return }
        val copy = pcm.copyOf()
        if (!queue.offer(copy)) {
            copy.fill(0); synchronized(lock) { dropped++ }; fail("cola-llena"); return
        }
        synchronized(lock) { chunks++ }
    }
    private fun publish(token: Int, results: Bundle) {
        if (!active || !ready || token != generation || SystemClock.elapsedRealtime() >= deadline) return
        val text = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
        val accepted = acceptedLocalText(LocalDecodedText(text, "es", forced = true))
        if (accepted.isEmpty()) return
        val bounds = synchronized(lock) {
            val end = chunks * 50
            if (end <= lastSegmentMs) return
            val start = lastSegmentMs; lastSegmentMs = end; delivered++
            Pair(start, end)
        }
        listener?.onSegment(accepted, "es", bounds.first, bounds.second)
    }
    private fun closeStream() {
        ready = false; generation++
        recognizer?.cancel(); recognizer?.destroy(); recognizer = null
        try { reader?.close() } catch (_: Exception) {}; reader = null
        try { writer?.close() } catch (_: Exception) {}; writer = null
        while (true) (queue.poll() ?: break).fill(0)
    }
    fun resetStream() {
        if (!active) return
        closeStream(); status = "cargando"
        synchronized(lock) { lastSegmentMs = chunks * 50 }
        val token = generation
        fun reopen(left: Int) {
            if (!active || token != generation) return
            if (!worker) openStream()
            else if (left > 0) handler.postDelayed({ reopen(left - 1) }, 100)
            else fail("cierre-agotado")
        }
        reopen(20)
    }
    fun stop() { active = false; closeStream(); status = "inactivo" }
    private fun fail(reason: String) {
        synchronized(lock) { errors++; liveError = reason }
        active = false; closeStream(); status = "error"
    }
    fun setPhase(phase: Int) {} // No phase attribution is claimed for system recognition.
    fun diagnostics(): String = synchronized(lock) {
        "{\"enabled\":$active,\"status\":\"$status\",\"engine\":\"pixel-system\",\"worker\":$worker," +
        "\"busy\":$worker,\"inputBufferedBytes\":${queue.size * 1600},\"accepted\":$delivered," +
        "\"abstentions\":0,\"dropped\":$dropped,\"systemPcmMs\":${chunks * 50}," +
        "\"systemErrors\":$errors,\"systemError\":\"$liveError\"}"
    }
}
