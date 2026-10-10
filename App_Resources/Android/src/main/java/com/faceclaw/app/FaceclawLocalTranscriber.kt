package com.faceclaw.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import java.io.File

/**
 * Independent local-only Whisper route. No storage, BLE or network client.
 *
 * Explicit base/small/medium selection, verified before JNI, without substitution or automatic downloads.
 * The ASR copy of each window is
 * level-conditioned (LocalAsrConditioner) before decoding; capture, VAD and profile are untouched.
 *
 * Model, runtime knobs (threads/provider/tail padding) and window policy are captured together by one
 * accepted start. A start while a worker is alive is rejected, so a later call can never mutate the
 * active decoder. [start] keeps the production defaults; [startConfigured] exists for benchmarks and
 * diagnostics and accepts only validated values.
 *
 * [startWithSpeakers] closes windows at pauses and labels each one with a session voice: the wearer's
 * saved own-voice profile when present, plus other voices clustered in RAM for this session only.
 */
class FaceclawLocalTranscriber internal constructor(context: Context, private val root: File) {
    constructor(context: Context) : this(context, File(context.applicationContext.filesDir, "faceclaw-voice-asr"))

    private class Config(val model: LocalWhisperModels.Model, val performance: LocalWhisperPerformance)

    private val handler = Handler(Looper.getMainLooper())
    private val appContext = context.applicationContext
    private val selectionLock = Any()
    private var selected = Config(LocalWhisperModels.SMALL, LocalWhisperPerformance(4))

    private val session = LocalTranscriptSession(object : LocalTranscriptHost {
        override val dispatcher = CallbackDispatcher { action -> handler.post { action() } }
        /** `language` comes from the accepted start that owns this worker; it is never re-read later. */
        override fun loadDecoder(language: LocalTranscriptLanguage): LocalTranscriptDecoder? {
            val config = synchronized(selectionLock) { selected }
            // Never substitute a different model during a comparison.
            if (!LocalWhisperModels.verified(root, config.model)) return null
            return LocalWhisperModels.load(root, config.model, language, config.performance)
        }
        override fun loadSpeakerAttributor(): LocalSpeakerAttributor? {
            val decoder = loadOwnVoiceDecoder(appContext) ?: return null
            val profile = try { OwnLocalVoiceStore(appContext).load(decoder.dimension) } catch (_: Throwable) { null }
            return LocalSpeakerTracker(decoder, profile)
        }
    }, conditionAudio = true)
    fun setListener(listener: FaceclawLocalTranscriptListener?) = session.setListener(listener)
    /** "es" forces Spanish for this session only; anything else keeps automatic detection. */
    fun start(language: String, modelId: String, maxMs: Long): Boolean {
        val performance = LocalWhisperPerformance.defaultFor(modelId) ?: return false
        return startWith(language, modelId, maxMs, performance, LocalTranscriptWindowPolicy.REFERENCE)
    }
    /** Production start with speaker attribution: pause-closed windows labelled per session voice. */
    fun startWithSpeakers(language: String, modelId: String, maxMs: Long): Boolean {
        val performance = LocalWhisperPerformance.defaultFor(modelId) ?: return false
        return startWith(language, modelId, maxMs, performance, LocalTranscriptWindowPolicy.PAUSE, speakers = true)
    }
    /**
     * Benchmark/diagnostic start, not wired to the phone UI. `tailPaddingFrames` 0 keeps the runtime
     * default. Returns false for an unknown model or any unmeasured thread count, provider, padding or policy.
     */
    fun startConfigured(language: String, modelId: String, maxMs: Long, threads: Int, provider: String,
        tailPaddingFrames: Int, windowPolicyId: String): Boolean {
        val performance = LocalWhisperPerformance.validated(threads, provider, tailPaddingFrames) ?: return false
        val policy = LocalTranscriptWindowPolicy.byId(windowPolicyId) ?: return false
        return startWith(language, modelId, maxMs, performance, policy)
    }
    private fun startWith(language: String, modelId: String, maxMs: Long, performance: LocalWhisperPerformance,
        policy: LocalTranscriptWindowPolicy, speakers: Boolean = false): Boolean = synchronized(selectionLock) {
        if (session.isWorkerActive()) return false
        val model = LocalWhisperModels.byId(modelId) ?: return false
        selected = Config(model, performance)
        session.start(LocalTranscriptLanguage.fromWire(language), LocalTranscriptSegmentation.WINDOWS, maxMs, policy, speakers)
    }
    fun setPhase(phase: Int) = session.setPhase(phase)
    fun stop() = session.stop()
    fun resetStream() = session.resetStream()
    fun acceptPcm(pcm: ByteArray?, vadState: String) = session.acceptPcm(pcm, vadState)
    fun diagnostics(): String = session.diagnostics()
    /** Benchmark detail: recent window capture bounds and decode times (scalars only). */
    fun decodeTimings(): String = session.decodeTimings()
}
