package com.faceclaw.whisperbench

import android.app.Activity
import android.os.Bundle
import android.util.Log
import android.view.WindowManager
import android.widget.TextView

/**
 * Starts one benchmark run from the launch intent (see evaluations/whisper-tensor/README.md) on a
 * background thread. Progress goes to the screen and to logcat tag FaceclawWhisperBench; results go to
 * <external files>/results/<runId>/. `--es keepScreenOn true` keeps the display on for comparable runs.
 */
class BenchActivity : Activity() {
    private var started = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val view = TextView(this).apply { textSize = 16f; setPadding(32, 64, 32, 32) }
        setContentView(view)
        if (started || savedInstanceState != null) return
        started = true
        val options = BenchOptions(intent)
        if (intent.getStringExtra("keepScreenOn") == "true") window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val runner = BenchRunner(this, options) { message ->
            Log.i("FaceclawWhisperBench", message)
            runOnUiThread { view.text = message }
        }
        Thread({ runner.run() }, "FaceclawWhisperBench").start()
    }
}
