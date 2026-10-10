package com.faceclaw.app

import android.os.Handler
import android.os.Looper
import android.os.Process
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Independent resident worker; all model operations serialize, cancellation never waits for them. */
class FaceclawGatekeeperRunner {
    companion object {
        init { System.loadLibrary("faceclaw_llama") }
        @JvmStatic private external fun nativeCreate(): Long
        @JvmStatic private external fun nativeSetEpoch(handle: Long, epoch: Long)
        @JvmStatic private external fun nativeRun(handle: Long, epoch: Long, path: String, nCtx: Int,
            nThreads: Int, prompt: String, grammar: String, maxTokens: Int, listener: FaceclawLlamaListener)
        @JvmStatic private external fun nativeFree(handle: Long)
    }

    private val lock = Any()
    private val callbacks = Handler(Looper.myLooper() ?: Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor { runnable ->
        // Default priority: background priority confined the 1.2B model to the little cores (~4.3 s p50).
        Thread({ Process.setThreadPriority(Process.THREAD_PRIORITY_DEFAULT); runnable.run() }, "FaceclawGatekeeper")
    }
    // A control exists BEFORE loading: epochs cancel queued jobs, loading and compute alike.
    private var handle = nativeCreate()
    private var epoch = 0L
    private var closed = false
    @Volatile private var loaded = false

    fun isModelLoaded(): Boolean = loaded

    fun generate(modelPath: String?, nCtx: Int, nThreads: Int, prompt: String?, grammar: String?,
        maxTokens: Int, listener: FaceclawLlamaListener) {
        synchronized(lock) {
            if (closed || handle == 0L || modelPath.isNullOrEmpty() || prompt.isNullOrEmpty() || grammar.isNullOrEmpty()) {
                callbacks.post { listener.onError("Gatekeeper configuration unavailable") }
                return
            }
            val ticket = ++epoch
            val control = handle
            nativeSetEpoch(control, ticket)
            // Submit while holding the short control lock so unload cannot shut down between check/submit.
            executor.execute {
                val terminal = AtomicBoolean(false)
                fun current(): Boolean = synchronized(lock) { !closed && epoch == ticket }
                fun done(reason: String?) {
                    if (terminal.compareAndSet(false, true)) callbacks.post {
                        listener.onDone(if (current()) reason else "cancelled")
                    }
                }
                fun error() {
                    if (terminal.compareAndSet(false, true)) callbacks.post {
                        if (current()) listener.onError("Gatekeeper inference unavailable") else listener.onDone("cancelled")
                    }
                }
                if (!current()) { done("cancelled"); return@execute }
                try {
                    nativeRun(control, ticket, modelPath, nCtx.coerceIn(512, 4096), nThreads.coerceIn(1, 4),
                        prompt, grammar, maxTokens.coerceIn(1, 96), object : FaceclawLlamaListener {
                            override fun onToken(piece: String?) {
                                // Native emits this internal event after model+context initialization.
                                if (piece == null) { loaded = true; return }
                                if (!terminal.get()) callbacks.post { if (current()) listener.onToken(piece) }
                            }
                            override fun onDone(stopReason: String?) { done(stopReason) }
                            override fun onError(message: String?) { error() }
                        })
                } catch (_: Throwable) { loaded = false; error() }
            }
        }
    }

    /** Called directly by explicit-interaction priority, including before native loading begins. */
    fun cancel() = synchronized(lock) {
        if (!closed && handle != 0L) nativeSetEpoch(handle, ++epoch)
    }

    /** Terminal disposal. Free follows all worker jobs; the lock protects concurrent cancel/free. */
    fun unload() = synchronized(lock) {
        if (!closed) {
            closed = true; loaded = false
            if (handle != 0L) nativeSetEpoch(handle, ++epoch)
            executor.execute {
                synchronized(lock) {
                    if (handle != 0L) { nativeFree(handle); handle = 0L }
                }
            }
            executor.shutdown()
        }
    }
}
