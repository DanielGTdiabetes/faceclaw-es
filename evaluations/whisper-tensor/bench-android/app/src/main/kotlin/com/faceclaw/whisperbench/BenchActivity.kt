package com.faceclaw.whisperbench

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.WindowManager
import android.widget.TextView

/**
 * Hands the launch intent (see evaluations/whisper-tensor/README.md) to [BenchService], which runs the
 * benchmark in the foreground with a partial wake lock. Progress goes to logcat tag FaceclawWhisperBench
 * and to <external files>/results/<runId>/status.txt. `--es keepScreenOn true` keeps the display on while
 * this activity is visible.
 */
class BenchActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(TextView(this).apply {
            textSize = 16f; setPadding(32, 64, 32, 32)
            text = "Faceclaw Whisper bench: ${intent.getStringExtra("mode") ?: "info"} (logcat FaceclawWhisperBench)"
        })
        if (intent.getStringExtra("keepScreenOn") == "true") window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (savedInstanceState == null) startForegroundService(Intent(intent).setClass(this, BenchService::class.java))
    }
}
