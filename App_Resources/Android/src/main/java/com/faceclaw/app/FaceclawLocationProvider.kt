package com.faceclaw.app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.location.LocationRequest
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log

import androidx.core.content.ContextCompat

import java.util.concurrent.Executor

/**
 * One-shot location lookup for Weather and the assistant. A recent precise cached fix is
 * returned at once; otherwise the fused (Android 12+), GPS and network providers are asked in
 * parallel and the lookup stops at the first precise fix, accepts a street-level one after a few
 * seconds and returns the best available at the deadline. LocationLookupCore owns those
 * decisions and their limits. With only approximate permission GPS is skipped and the first
 * coarse fix is returned.
 *
 * Callbacks are delivered on the main thread.
 */
class FaceclawLocationProvider(context: Context) {
    companion object {
        private const val TAG = "FaceclawLocation"

        /** Age via the monotonic clock, so a wall-clock change can't make an old fix look fresh. */
        private fun ageMs(location: Location): Long {
            val nanos = location.elapsedRealtimeNanos
            if (nanos > 0L) {
                return (SystemClock.elapsedRealtimeNanos() - nanos) / 1_000_000L
            }
            return if (location.time > 0L) System.currentTimeMillis() - location.time else -1L
        }

        private fun sample(location: Location): LocationSample<Location> =
            LocationSample(location, if (location.hasAccuracy()) location.accuracy else -1f, ageMs(location))
    }

    /** One provider request; [cancel] stops it without reporting a result. */
    private inner class ProviderRequest(val provider: String) {
        val signal = CancellationSignal()
        var legacyListener: LocationListener? = null

        fun cancel() {
            signal.cancel()
            val legacy = legacyListener ?: return
            legacyListener = null
            try {
                locationManager!!.removeUpdates(legacy)
            } catch (ignored: Throwable) {
            }
        }
    }

    private val context: Context = context.applicationContext
    private val locationManager: LocationManager? =
        this.context.getSystemService(Context.LOCATION_SERVICE) as LocationManager?
    private val mainHandler = Handler(Looper.getMainLooper())
    private val mainExecutor = Executor { command -> mainHandler.post(command) }
    private val relaxTimer = Runnable { onTimer(relax = true) }
    private val deadlineTimer = Runnable { onTimer(relax = false) }

    private var listener: FaceclawLocationListener? = null
    private var core: LocationLookupCore<Location>? = null
    private val requests = ArrayList<ProviderRequest>()
    private var noProviders = false
    private var startedAt = 0L

    fun setListener(listener: FaceclawLocationListener?) {
        this.listener = listener
    }

    fun start() {
        mainHandler.post { startOnMainThread() }
    }

    fun cancel() {
        mainHandler.post { stop() }
    }

    private fun startOnMainThread() {
        if (core != null) {
            return
        }
        val manager = locationManager
        if (manager == null) {
            deliverError("Android location service is unavailable.")
            return
        }
        val precise = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        if (!precise && ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) !=
            PackageManager.PERMISSION_GRANTED) {
            deliverError("Location permission is required.")
            return
        }

        val lookup = LocationLookupCore<Location>(precise)
        val providers = chooseProviders(manager, precise)
        core = lookup
        noProviders = providers.isEmpty()
        startedAt = SystemClock.elapsedRealtime()

        lookup.begin(cachedLocations(manager), providers.size)
        if (lookup.finished) {
            complete(lookup, "cache")
            return
        }
        for (provider in providers) {
            if (!startRequest(manager, provider, lookup)) {
                lookup.onRequestEnded(null)
                if (lookup.finished) {
                    complete(lookup, "start-failed")
                    return
                }
            }
        }
        mainHandler.postDelayed(relaxTimer, LocationLookupCore.RELAX_AFTER_MS)
        mainHandler.postDelayed(deadlineTimer, LocationLookupCore.DEADLINE_MS)
    }

    /** Fused (Android 12+) and GPS give precise fixes; network is the quick fallback. */
    private fun chooseProviders(manager: LocationManager, precise: Boolean): List<String> {
        val candidates = ArrayList<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            candidates.add(LocationManager.FUSED_PROVIDER)
        }
        if (precise) {
            candidates.add(LocationManager.GPS_PROVIDER)
        }
        candidates.add(LocationManager.NETWORK_PROVIDER)
        return candidates.filter { provider ->
            try {
                manager.isProviderEnabled(provider)
            } catch (ignored: Throwable) {
                false
            }
        }
    }

    private fun cachedLocations(manager: LocationManager): List<LocationSample<Location>> {
        val samples = ArrayList<LocationSample<Location>>()
        val providers = try {
            manager.getProviders(true)
        } catch (ignored: Throwable) {
            return samples
        }
        for (provider in providers) {
            try {
                // GPS throws without precise permission; the other providers may still have a fix.
                val location = manager.getLastKnownLocation(provider) ?: continue
                samples.add(sample(location))
            } catch (ignored: Throwable) {
            }
        }
        return samples
    }

    private fun startRequest(manager: LocationManager, provider: String,
                             lookup: LocationLookupCore<Location>): Boolean {
        val request = ProviderRequest(provider)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val locationRequest = LocationRequest.Builder(0L)
                    .setQuality(LocationRequest.QUALITY_HIGH_ACCURACY)
                    .setDurationMillis(LocationLookupCore.DEADLINE_MS)
                    .build()
                manager.getCurrentLocation(provider, locationRequest, request.signal, mainExecutor) { location ->
                    onRequestResult(lookup, request, location)
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                manager.getCurrentLocation(provider, request.signal, mainExecutor) { location ->
                    onRequestResult(lookup, request, location)
                }
            } else {
                val legacy = legacyListener(lookup, request)
                request.legacyListener = legacy
                manager.requestLocationUpdates(provider, 0L, 0f, legacy, Looper.getMainLooper())
            }
        } catch (error: Throwable) {
            Log.w(TAG, "request $provider failed to start: ${error.javaClass.simpleName}")
            request.cancel()
            return false
        }
        requests.add(request)
        return true
    }

    /** Android 7–10: the first update of an ordinary request. All callbacks overridden for API < 30. */
    private fun legacyListener(lookup: LocationLookupCore<Location>, request: ProviderRequest): LocationListener =
        object : LocationListener {
            override fun onLocationChanged(location: Location) {
                onRequestResult(lookup, request, location)
            }

            override fun onProviderDisabled(provider: String) {
                onRequestResult(lookup, request, null)
            }

            override fun onProviderEnabled(provider: String) {
            }

            @Deprecated("Deprecated in Java")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {
            }
        }

    private fun onRequestResult(lookup: LocationLookupCore<Location>, request: ProviderRequest,
                                location: Location?) {
        // A late callback from a cancelled or finished lookup is no longer in the list.
        if (core !== lookup || !requests.remove(request)) {
            return
        }
        request.cancel()
        lookup.onRequestEnded(if (location != null) sample(location) else null)
        if (lookup.finished) {
            complete(lookup, request.provider)
        }
    }

    private fun onTimer(relax: Boolean) {
        val lookup = core ?: return
        if (relax) {
            lookup.onRelax()
        } else {
            lookup.onDeadline()
        }
        if (lookup.finished) {
            complete(lookup, if (relax) "relax" else "deadline")
        }
    }

    private fun complete(lookup: LocationLookupCore<Location>, reason: String) {
        val elapsed = SystemClock.elapsedRealtime() - startedAt
        val chosen = lookup.result
        val withoutProviders = noProviders
        stop()
        if (chosen != null) {
            // Diagnostics only: never log coordinates.
            Log.i(TAG, "fix provider=${chosen.value.provider} accuracy=${chosen.accuracyMeters}m " +
                "age=${chosen.ageMs}ms after=${elapsed}ms via=$reason")
            deliverLocation(chosen.value)
        } else {
            Log.i(TAG, "no fix after=${elapsed}ms via=$reason providers=${!withoutProviders}")
            deliverError(if (withoutProviders) "Turn on Location on your phone, then retry."
                else "Couldn't get your current location. Tap to retry.")
        }
    }

    private fun stop() {
        for (request in requests) {
            request.cancel()
        }
        requests.clear()
        core = null
        mainHandler.removeCallbacks(relaxTimer)
        mainHandler.removeCallbacks(deadlineTimer)
    }

    private fun deliverLocation(location: Location) {
        listener?.onLocation(
            location.latitude,
            location.longitude,
            if (location.hasAccuracy()) location.accuracy else -1f,
            location.time)
    }

    private fun deliverError(message: String) {
        listener?.onError(message)
    }
}
