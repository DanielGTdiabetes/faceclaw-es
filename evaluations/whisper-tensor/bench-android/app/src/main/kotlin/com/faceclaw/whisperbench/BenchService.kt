package com.faceclaw.whisperbench

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import android.os.PowerManager
import android.util.Log

/**
 * Runs one benchmark as a foreground service holding a partial wake lock, like Faceclaw's own capture
 * path, so a locked or dozing phone does not freeze the process mid-measurement (observed on the first
 * run: the cached activity process was frozen). The screen state is recorded with every sample.
 */
class BenchService : Service() {
    private var running = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (running || intent == null) return START_NOT_STICKY
        running = true
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("bench", "Whisper bench", NotificationManager.IMPORTANCE_LOW))
        val notification = Notification.Builder(this, "bench").setContentTitle("Faceclaw Whisper bench")
            .setSmallIcon(android.R.drawable.ic_popup_sync).setOngoing(true).build()
        startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        val lock = getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "FaceclawWhisperBench:run")
        lock.acquire(4 * 60 * 60 * 1000L)
        val runner = BenchRunner(this, BenchOptions(intent)) { Log.i("FaceclawWhisperBench", it) }
        Thread({
            try { runner.run() } finally {
                if (lock.isHeld) lock.release()
                stopForeground(STOP_FOREGROUND_REMOVE); stopSelf()
            }
        }, "FaceclawWhisperBench").start()
        return START_NOT_STICKY
    }
}
