package com.faceclaw.app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock

import androidx.core.content.ContextCompat

/**
 * Continuous location updates for turn-by-turn navigation. Unlike
 * FaceclawLocationProvider (one-shot, for Weather and the assistant), this streams GPS
 * fixes with bearing and speed until stopped.
 *
 * Callbacks are delivered on the Looper of the thread that constructed the
 * tracker, so a worker isolate receives them on its own thread (the same
 * convention as FaceclawSseRequest).
 *
 * While GPS is cold (indoors, or just switched on) it can take well over the
 * Navigate app's first-fix budget. Until the first live GPS fix arrives, the
 * network provider (Wi-Fi/cell) also streams fixes so a route can start from
 * where the user actually is; it is dropped as soon as GPS takes over. Those
 * are live fixes, not the platform cache, so the stale-seed guard still holds.
 */
class FaceclawLocationTracker(context: Context) : LocationListener {
    companion object {
        /**
         * Only seed from the platform's cached fix when it is this fresh. An older
         * one is likely wherever the phone was last used (for example the previous
         * navigation's destination), and guidance built on it is wrong from the
         * first frame: the route starts there and arrival fires immediately.
         */
        private const val MAX_SEED_AGE_MS = 60L * 1000L

        /** Age via the monotonic clock, so a wall-clock change can't make an old fix look fresh. */
        private fun ageMs(location: Location): Long {
            val ageNanos = SystemClock.elapsedRealtimeNanos() - location.elapsedRealtimeNanos
            return ageNanos / 1_000_000L
        }
    }

    private val context: Context = context.applicationContext
    private val locationManager: LocationManager? =
        this.context.getSystemService(Context.LOCATION_SERVICE) as LocationManager?
    private val callbackHandler: Handler

    private var listener: FaceclawLocationTrackerListener? = null
    private var running = false
    /** True once the primary provider has delivered a live fix (seeds don't count). */
    private var primaryFixSeen = false
    private var warmupActive = false

    /** Network-provider fixes while the primary (GPS) provider warms up. */
    private val warmupListener = object : LocationListener {
        override fun onLocationChanged(location: Location) {
            if (running && warmupActive && !primaryFixSeen) {
                deliverLocation(location)
            }
        }

        // Losing the warm-up provider is not an error: GPS is still running.
        override fun onProviderDisabled(provider: String) {
        }

        override fun onProviderEnabled(provider: String) {
        }

        @Deprecated("Deprecated in Java")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {
        }
    }

    init {
        val looper = Looper.myLooper()
        this.callbackHandler = Handler(looper ?: Looper.getMainLooper())
    }

    fun setListener(listener: FaceclawLocationTrackerListener?) {
        this.listener = listener
    }

    /** Begin streaming fixes at roughly the requested interval. */
    fun start(intervalMs: Long) {
        callbackHandler.post { startOnCallbackThread(intervalMs) }
    }

    fun stop() {
        callbackHandler.post {
            if (!running) {
                return@post
            }
            running = false
            stopWarmup()
            try {
                locationManager!!.removeUpdates(this)
            } catch (ignored: Throwable) {
            }
        }
    }

    private fun startWarmup(primaryProvider: String, intervalMs: Long) {
        val manager = locationManager ?: return
        if (primaryProvider != LocationManager.GPS_PROVIDER) {
            return
        }
        try {
            if (!manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                return
            }
            warmupActive = true
            manager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, Math.max(1000L, intervalMs), 0f,
                warmupListener, callbackHandler.looper)
        } catch (ignored: Throwable) {
            // Best effort: GPS alone still works, just slower to a first fix.
            warmupActive = false
        }
    }

    private fun stopWarmup() {
        if (!warmupActive) {
            return
        }
        warmupActive = false
        try {
            locationManager!!.removeUpdates(warmupListener)
        } catch (ignored: Throwable) {
        }
    }

    private fun startOnCallbackThread(intervalMs: Long) {
        if (running) {
            return
        }
        val manager = locationManager
        if (manager == null) {
            deliverError("Android location service is unavailable.")
            return
        }
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) !=
            PackageManager.PERMISSION_GRANTED) {
            deliverError("Precise location permission is required for navigation.")
            return
        }

        val provider = chooseProvider()
        if (provider == null) {
            deliverError("Turn on Location on your phone, then retry.")
            return
        }

        try {
            running = true
            primaryFixSeen = false
            manager.requestLocationUpdates(provider, Math.max(500L, intervalMs), 0f, this,
                callbackHandler.looper)
            startWarmup(provider, intervalMs)
            // Seed with the freshest cached fix so the UI has a position
            // before the first live fix (GPS cold starts can take a while),
            // but only if it's recent enough to still be where the user is.
            val cached = freshestCachedLocation(provider)
            if (cached != null) {
                deliverLocation(cached)
            }
        } catch (error: SecurityException) {
            running = false
            stopWarmup()
            deliverError("Precise location permission is required for navigation.")
        } catch (error: Throwable) {
            running = false
            stopWarmup()
            deliverError("Unable to start location updates.")
        }
    }

    private fun freshestCachedLocation(primaryProvider: String): Location? {
        var best: Location? = null
        for (provider in arrayOf(primaryProvider, LocationManager.NETWORK_PROVIDER,
                LocationManager.GPS_PROVIDER)) {
            val candidate: Location?
            try {
                candidate = locationManager!!.getLastKnownLocation(provider)
            } catch (ignored: Throwable) {
                continue
            }
            if (candidate == null || ageMs(candidate) > MAX_SEED_AGE_MS) {
                continue
            }
            if (best == null || candidate.elapsedRealtimeNanos > best.elapsedRealtimeNanos) {
                best = candidate
            }
        }
        return best
    }

    private fun chooseProvider(): String? {
        try {
            if (locationManager!!.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                return LocationManager.GPS_PROVIDER
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                return LocationManager.NETWORK_PROVIDER
            }
        } catch (ignored: Throwable) {
        }
        return null
    }

    override fun onLocationChanged(location: Location) {
        if (!primaryFixSeen) {
            primaryFixSeen = true
            stopWarmup()
        }
        deliverLocation(location)
    }

    override fun onProviderDisabled(provider: String) {
        deliverError("Location was turned off on the phone.")
    }

    override fun onProviderEnabled(provider: String) {
    }

    @Deprecated("Deprecated in Java")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {
    }

    private fun deliverLocation(location: Location?) {
        val current = listener
        if (current == null || location == null) {
            return
        }
        current.onLocation(
            location.latitude,
            location.longitude,
            if (location.hasAccuracy()) location.accuracy else -1f,
            if (location.hasBearing()) location.bearing else -1f,
            if (location.hasSpeed()) location.speed else -1f,
            location.time)
    }

    private fun deliverError(message: String) {
        val current = listener
        current?.onError(message)
    }
}
