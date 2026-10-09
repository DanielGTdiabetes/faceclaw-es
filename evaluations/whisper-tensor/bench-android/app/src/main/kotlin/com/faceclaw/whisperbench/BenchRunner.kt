package com.faceclaw.whisperbench

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.Debug
import android.os.PowerManager
import android.os.Process
import android.os.SystemClock
import com.faceclaw.app.FaceclawLocalTranscriber
import com.faceclaw.app.FaceclawLocalTranscriptListener
import com.faceclaw.app.LocalAsrConditioner
import com.faceclaw.app.LocalTextRejection
import com.faceclaw.app.LocalTranscriptDecoder
import com.faceclaw.app.LocalTranscriptLanguage
import com.faceclaw.app.LocalTranscriptWindowPolicy
import com.faceclaw.app.LocalWhisperModels
import com.faceclaw.app.LocalWhisperPerformance
import com.faceclaw.app.localTextRejection
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.Collections

/** Options from `adb shell am start ... --es key value`; every list is comma separated. */
class BenchOptions(private val intent: Intent) {
    private fun s(key: String, default: String) = intent.getStringExtra(key)?.takeIf { it.isNotBlank() } ?: default
    private fun list(key: String, default: String) = s(key, default).split(',').map { it.trim() }.filter { it.isNotEmpty() }
    val mode = s("mode", "info")
    val models = list("models", "whisper-small-es")
    val threads = list("threads", "1,2,4,6").map { it.toInt() }
    val providers = list("providers", "cpu")
    val tails = list("tails", "0").map { it.toInt() }
    val policies = list("policies", "ref-6-3")
    val conditioning = list("conditioning", "on")
    val language = s("language", "auto")
    val segmentMs = s("segmentMs", "6000").toInt()
    val repeat = s("repeat", "3").toInt()
    val warmup = s("warmup", "2").toInt()
    val kinds = list("kinds", if (mode == "corpus") "speech,silence,noise" else "stream")
    val fixtures = list("fixtures", "")
    val minutes = s("minutes", "10").toDouble()
    val rounds = s("rounds", "1").toInt()
    val cooldownSec = s("cooldownSec", "30").toInt()
    val recordText = s("recordText", "true") == "true"
    val runId = s("runId", "run-" + System.currentTimeMillis())
}

class BenchRunner(private val context: Context, private val options: BenchOptions, private val status: (String) -> Unit) {
    private val root = context.getExternalFilesDir(null)!!
    private val modelsRoot = File(root, "models")
    private val corpusDir = File(root, "corpus")
    val outDir = File(root, "results/${options.runId}")
    private val power = context.getSystemService(PowerManager::class.java)
    private val activity = context.getSystemService(ActivityManager::class.java)

    private class Fixture(val id: String, val kind: String, val language: String, val reference: String,
        val pcm: ShortArray, val speech: List<LongArray>)

    fun run() {
        outDir.mkdirs()
        File(outDir, "status.txt").writeText("running")
        val result = JSONObject()
        result.put("kind", "pixel-bench (real decoder on device)")
        result.put("options", JSONObject().apply {
            put("mode", options.mode); put("models", JSONArray(options.models)); put("threads", JSONArray(options.threads))
            put("providers", JSONArray(options.providers)); put("tails", JSONArray(options.tails))
            put("policies", JSONArray(options.policies)); put("conditioning", JSONArray(options.conditioning))
            put("language", options.language); put("segmentMs", options.segmentMs); put("repeat", options.repeat)
            put("warmup", options.warmup); put("kinds", JSONArray(options.kinds)); put("minutes", options.minutes)
            put("rounds", options.rounds); put("cooldownSec", options.cooldownSec); put("recordText", options.recordText)
        })
        result.put("device", deviceInfo())
        try {
            if (options.mode != "info") result.put("corpusManifestSha256", sha256(File(corpusDir, "manifest.json")))
            val corpus = if (options.mode == "info") emptyList() else loadCorpus()
            when (options.mode) {
                "info" -> Unit
                "corpus" -> result.put("cases", corpusMode(corpus))
                "realtime" -> result.put("cases", realtimeMode(corpus, sustainedMs = 0L))
                "sustained" -> result.put("cases", realtimeMode(corpus, sustainedMs = (options.minutes * 60_000).toLong()))
                else -> error("unknown mode ${options.mode}")
            }
            result.put("deviceAfter", thermal())
            File(outDir, "run.json").writeText(result.toString(1))
            File(outDir, "status.txt").writeText("done")
            status("DONE ${outDir.absolutePath}")
        } catch (failure: Throwable) {
            result.put("error", failure.toString())
            File(outDir, "run.json").writeText(result.toString(1))
            File(outDir, "status.txt").writeText("error: $failure")
            status("ERROR $failure")
        }
    }

    // ---------------------------------------------------------------- inputs

    private fun loadCorpus(): List<Fixture> {
        val manifest = JSONObject(File(corpusDir, "manifest.json").readText())
        val fixtures = manifest.getJSONArray("fixtures")
        return (0 until fixtures.length()).map { fixtures.getJSONObject(it) }.filter { item ->
            item.getString("kind") in options.kinds && (options.fixtures.isEmpty() || item.getString("id") in options.fixtures)
        }.map { item ->
            val file = File(corpusDir, item.getString("file"))
            check(sha256(file) == item.getString("sha256")) { "corpus hash mismatch ${item.getString("id")}" }
            val bytes = file.readBytes()
            val pcm = ShortArray(bytes.size / 2) { ((bytes[it * 2].toInt() and 255) or (bytes[it * 2 + 1].toInt() shl 8)).toShort() }
            val segments = item.optJSONArray("segments")
            val speech = if (segments == null) {
                if (item.getString("kind") == "speech") listOf(longArrayOf(0, pcm.size / 16L)) else emptyList()
            } else (0 until segments.length()).map { longArrayOf(segments.getJSONObject(it).getLong("startMs"), segments.getJSONObject(it).getLong("endMs")) }
            Fixture(item.getString("id"), item.getString("kind"), item.getString("language"), item.getString("reference"), pcm, speech)
        }.also { check(it.isNotEmpty()) { "no fixture selected" } }
    }

    private fun performances(): List<LocalWhisperPerformance> = options.threads.flatMap { threads ->
        options.providers.flatMap { provider -> options.tails.map { tail ->
            LocalWhisperPerformance.validated(threads, provider, tail) ?: error("invalid threads=$threads provider=$provider tail=$tail")
        } }
    }

    // ---------------------------------------------------------------- corpus mode

    /** Direct decoder calls: verification, load, warm-up and steady inference are timed separately. */
    private fun corpusMode(corpus: List<Fixture>): JSONArray {
        val cases = JSONArray()
        val csv = StringBuilder("model,threads,provider,tail,conditioning,fixture,kind,language,piece,repetition,audioMs,decodeMs,rejection,detected\n")
        val language = LocalTranscriptLanguage.fromWire(options.language)
        for (modelId in options.models) {
            val model = LocalWhisperModels.byId(modelId) ?: error("unknown model $modelId")
            for (performance in performances()) {
                cooldown()
                status("corpus $modelId ${performance.wire}")
                val case = JSONObject().put("model", modelId).put("runtime", performance.wire).put("thermalBefore", thermal())
                val verifyStart = SystemClock.elapsedRealtimeNanos()
                val ok = LocalWhisperModels.verified(modelsRoot, model)
                case.put("verifyMs", ms(verifyStart))
                if (!ok) { cases.put(case.put("error", "model files missing or hash mismatch")); continue }
                val fallbacksBefore = sherpaFallbacks()
                val loadStart = SystemClock.elapsedRealtimeNanos()
                val decoder = LocalWhisperModels.load(modelsRoot, model, language, performance)
                case.put("loadMs", ms(loadStart)).put("memoryAfterLoad", memory())
                case.put("effectiveProvider", effectiveProvider(performance, sherpaFallbacks() - fallbacksBefore))
                try {
                    val warm = corpus.firstOrNull { it.kind == "speech" } ?: corpus.first()
                    val warmups = JSONArray()
                    repeat(options.warmup) {
                        val floats = floats(warm.pcm, 0, minOf(warm.pcm.size, 16000 * 6))
                        val start = SystemClock.elapsedRealtimeNanos(); decoder.decode(floats); warmups.put(ms(start))
                    }
                    case.put("warmupMs", warmups)
                    for (conditioning in options.conditioning) {
                        case.put("conditioning_$conditioning", corpusCase(decoder, corpus, conditioning == "on", modelId, performance, csv))
                    }
                } finally { decoder.release() }
                cases.put(case.put("thermalAfter", thermal()).put("memoryAfter", memory()))
                File(outDir, "corpus-decodes.csv").writeText(csv.toString())
            }
        }
        return cases
    }

    private fun corpusCase(decoder: LocalTranscriptDecoder, corpus: List<Fixture>, conditioned: Boolean, modelId: String,
        performance: LocalWhisperPerformance, csv: StringBuilder): JSONObject {
        val decodeMs = ArrayList<Long>(); var audioMs = 0L
        val rejections = LinkedHashMap<String, Int>()
        val fixtures = JSONArray()
        val totals = HashMap<String, LongArray>() // language -> refWords, wordErrors, refChars, charErrors
        var nonSpeechWords = 0L; var nonSpeechWordsUnfiltered = 0L; var unstable = 0
        for (fixture in corpus) {
            val pieceSamples = if (options.segmentMs <= 0) fixture.pcm.size else options.segmentMs * 16
            val starts = (0 until fixture.pcm.size step pieceSamples).filter { fixture.pcm.size - it >= 16000 || it == 0 }
            val delivered = ArrayList<String>(); val raw = ArrayList<String>(); val causes = JSONArray(); val labels = JSONArray()
            for ((piece, start) in starts.withIndex()) {
                val end = minOf(fixture.pcm.size, start + pieceSamples)
                var first: String? = null
                repeat(options.repeat) { repetition ->
                    val samples = floats(fixture.pcm, start, end)
                    if (conditioned) LocalAsrConditioner.condition(samples)
                    val t0 = SystemClock.elapsedRealtimeNanos()
                    val decoded = decoder.decode(samples)
                    val elapsed = ms(t0)
                    decodeMs.add(elapsed); audioMs += (end - start) / 16
                    val rejection = localTextRejection(decoded)
                    csv.append(listOf(modelId, performance.threads, performance.provider, performance.tailPaddingFrames,
                        if (conditioned) "on" else "off", fixture.id, fixture.kind, fixture.language, piece, repetition,
                        (end - start) / 16, elapsed, rejection, decoded.language).joinToString(",") { BenchMetrics.csvField(it) }).append('\n')
                    if (first == null) {
                        first = decoded.text
                        raw.add(decoded.text.trim()); causes.put(rejection.name); labels.put(decoded.language)
                        rejections[rejection.name] = (rejections[rejection.name] ?: 0) + 1
                        if (rejection == LocalTextRejection.NONE) delivered.add(decoded.text.trim())
                    } else if (first != decoded.text) unstable++
                }
            }
            val hypothesis = delivered.joinToString(" ")
            val errors = BenchMetrics.errors(fixture.reference, hypothesis)
            val unfiltered = BenchMetrics.errors(fixture.reference, raw.joinToString(" "))
            if (fixture.kind == "speech") totals.getOrPut(fixture.language) { LongArray(4) }.let {
                it[0] += errors.refWords.toLong(); it[1] += errors.wordErrors.toLong(); it[2] += errors.refChars.toLong(); it[3] += errors.charErrors.toLong()
            } else { nonSpeechWords += errors.hypWords; nonSpeechWordsUnfiltered += unfiltered.hypWords }
            fixtures.put(JSONObject().put("id", fixture.id).put("kind", fixture.kind).put("language", fixture.language)
                .put("rejections", causes).put("detected", labels).put("refWords", errors.refWords).put("wordErrors", errors.wordErrors)
                .put("insertions", errors.insertions).put("deletions", errors.deletions).put("hypWords", errors.hypWords)
                .put("hypWordsUnfiltered", unfiltered.hypWords).apply { if (options.recordText) put("hypothesis", hypothesis) })
        }
        return JSONObject().put("decodes", decodeMs.size).put("audioMs", audioMs)
            .put("decodeP50Ms", BenchMetrics.percentile(decodeMs, 0.5)).put("decodeP95Ms", BenchMetrics.percentile(decodeMs, 0.95))
            .put("decodeMaxMs", decodeMs.maxOrNull()).put("rtf", if (audioMs == 0L) null else decodeMs.sum().toDouble() / audioMs)
            .put("rejections", JSONObject(rejections as Map<*, *>)).put("unstableRepetitions", unstable)
            .put("wer", JSONObject().apply { totals.forEach { (lang, t) -> put(lang, if (t[0] == 0L) null else t[1].toDouble() / t[0]) } })
            .put("cer", JSONObject().apply { totals.forEach { (lang, t) -> put(lang, if (t[2] == 0L) null else t[3].toDouble() / t[2]) } })
            .put("nonSpeechWordsDelivered", nonSpeechWords).put("nonSpeechWordsUnfiltered", nonSpeechWordsUnfiltered)
            .put("fixtures", fixtures)
    }

    // ---------------------------------------------------------------- real-time replay

    private data class Case(val modelId: String, val performance: LocalWhisperPerformance, val policy: String)

    /**
     * PCM is fed in 50 ms chunks at real time through the production FaceclawLocalTranscriber (same
     * session, worker, conditioner, filters and dedup). 6 s of -65 dBFS noise follow each stream so its last
     * words reach a window; Faceclaw itself never flushes a partial window at OFF. `sustainedMs` > 0 loops
     * the selected streams for that long per block, alternating case order (A B B A ...).
     */
    private fun realtimeMode(corpus: List<Fixture>, sustainedMs: Long): JSONArray {
        // One session per block; Faceclaw caps a manual session at 20 minutes.
        require(sustainedMs <= 19 * 60_000L) { "sustained blocks are limited to 19 minutes" }
        val base = options.models.flatMap { model -> performances().flatMap { perf -> options.policies.map { Case(model, perf, it) } } }
        options.policies.forEach { checkNotNull(LocalTranscriptWindowPolicy.byId(it)) { "unknown policy $it" } }
        val order = (0 until options.rounds).flatMap { if (it % 2 == 0) base else base.reversed() }
        val cases = JSONArray()
        // Empty cells are withheld metrics; timingsInvalidReason says why (never a tail-of-run percentile).
        val csv = StringBuilder("round,model,runtime,policy,stream,audioMs,closures,constantWindows,decodeCalls,dropped,dropPct," +
            "attemptedCoveragePct,coveragePct,speechCoveragePct,decodeErrors,timingsComplete,timingsInvalidReason," +
            "decodeP50Ms,decodeP95Ms,decodeMaxMs,latencyAvgMs,latencyMaxMs,delivered,wer,cer," +
            "rejectedLanguage,rejectedEmpty,rejectedStructure,rejectedHallucination,deliveryDiscarded,stopDrainMs,lateChunks\n")
        val series = StringBuilder("elapsedMs,round,model,runtime,policy,thermalStatus,headroom10s,batteryTempC,batteryCurrentUa,batteryLevel,plugged,pssKb\n")
        for ((round, case) in order.withIndex()) {
            cooldown()
            val streams = if (sustainedMs > 0) listOf(loopStreams(corpus, sustainedMs)) else corpus
            for (stream in streams) {
                status("realtime ${case.modelId} ${case.performance.wire} ${case.policy} ${stream.id}")
                val item = replay(case, stream, round, series)
                cases.put(item)
                csv.append(listOf(round, case.modelId, case.performance.wire, case.policy, stream.id, item.opt("audioMs"),
                    item.opt("closures"), item.opt("constantWindows"), item.opt("decodeCalls"), item.opt("dropped"), item.opt("dropPct"),
                    item.opt("attemptedCoveragePct"), item.opt("coveragePct"), item.opt("speechCoveragePct"), item.opt("decodeErrors"),
                    item.opt("timingsComplete"), item.opt("timingsInvalidReason"), item.opt("decodeP50Ms"), item.opt("decodeP95Ms"),
                    item.opt("decodeMaxMs"), item.opt("latencyAvgMs"), item.opt("latencyMaxMs"), item.opt("delivered"), item.opt("wer"),
                    item.opt("cer"), item.opt("rejectedLanguage"), item.opt("rejectedEmpty"), item.opt("rejectedStructure"),
                    item.opt("rejectedHallucination"), item.opt("deliveryDiscarded"), item.opt("stopDrainMs"), item.opt("lateChunks"))
                    .joinToString(",") { BenchMetrics.csvField(if (it == JSONObject.NULL) null else it) }).append('\n')
                File(outDir, "realtime.csv").writeText(csv.toString())
                if (sustainedMs > 0) File(outDir, "timeseries.csv").writeText(series.toString())
            }
        }
        return cases
    }

    private fun loopStreams(corpus: List<Fixture>, durationMs: Long): Fixture {
        val samples = durationMs * 16
        val pcm = ShortArray(samples.toInt()); val speech = ArrayList<LongArray>(); val refs = ArrayList<String>()
        var at = 0
        while (at < pcm.size) for (fixture in corpus) {
            if (at >= pcm.size) break
            val take = minOf(fixture.pcm.size, pcm.size - at)
            fixture.pcm.copyInto(pcm, at, 0, take)
            fixture.speech.forEach { if (it[0] * 16 < take) speech.add(longArrayOf(at / 16L + it[0], at / 16L + minOf(it[1], take / 16L))) }
            if (take == fixture.pcm.size) refs.add(fixture.reference)
            at += take
        }
        return Fixture("sustained-${durationMs / 60000}min", "sustained", "mixed", refs.joinToString(" "), pcm, speech)
    }

    private fun replay(case: Case, stream: Fixture, round: Int, series: StringBuilder): JSONObject {
        val item = JSONObject().put("round", round).put("model", case.modelId).put("runtime", case.performance.wire)
            .put("policy", case.policy).put("stream", stream.id).put("thermalBefore", thermal()).put("memoryBefore", memory())
        val received = Collections.synchronizedList(ArrayList<String>())
        val transcriber = FaceclawLocalTranscriber(context, modelsRoot)
        transcriber.setListener(object : FaceclawLocalTranscriptListener {
            override fun onText(text: String, language: String) { received.add(text) }
        })
        val fallbacksBefore = sherpaFallbacks()
        val loadStart = SystemClock.elapsedRealtimeNanos()
        check(transcriber.startConfigured(options.language, case.modelId, 1_200_000L, case.performance.threads,
            case.performance.provider, case.performance.tailPaddingFrames, case.policy)) { "start rejected" }
        while (true) {
            val diag = transcriber.diagnostics()
            if (diag.contains("\"status\":\"listo\"")) break
            if (!diag.contains("\"status\":\"cargando\"")) { transcriber.stop(); return item.put("error", "load failed: " + statusOf(diag)) }
            SystemClock.sleep(20)
        }
        item.put("verifyAndLoadMs", ms(loadStart))
        item.put("effectiveProvider", effectiveProvider(case.performance, sherpaFallbacks() - fallbacksBefore))
        val tail = lowNoise(6 * 16000)
        val totalChunks = (stream.pcm.size + tail.size) / 800
        val chunk = ByteArray(1600)
        // The session ring holds 256 attempts (>= 12.8 min at one window per 3 s hop); polling every
        // 30 s of replay keeps consecutive snapshots overlapping, so a 19 min block is collected whole.
        val collector = BenchMetrics.DecodeTimingCollector()
        val start = SystemClock.elapsedRealtimeNanos()
        var lateChunks = 0; var maxLateMs = 0L; var nextSample = 0L; var nextPoll = 30_000L
        for (index in 0 until totalChunks) {
            val due = BenchMetrics.dueNanos(start, index.toLong())
            val wait = due - SystemClock.elapsedRealtimeNanos()
            if (wait > 0) Thread.sleep(wait / 1_000_000, (wait % 1_000_000).toInt())
            val late = (SystemClock.elapsedRealtimeNanos() - due) / 1_000_000
            if (late > 25) lateChunks++
            maxLateMs = maxOf(maxLateMs, late)
            for (i in 0 until 800) {
                val position = index * 800 + i
                val value = if (position < stream.pcm.size) stream.pcm[position] else tail[position - stream.pcm.size]
                chunk[i * 2] = value.toByte(); chunk[i * 2 + 1] = (value.toInt() shr 8).toByte()
            }
            transcriber.acceptPcm(chunk.copyOf(), "sin actividad")
            val elapsed = (SystemClock.elapsedRealtimeNanos() - start) / 1_000_000
            if (elapsed >= nextPoll) { collector.ingest(transcriber.decodeTimings()); nextPoll += 30_000 }
            if (series.isNotEmpty() && elapsed >= nextSample && options.mode == "sustained") {
                val t = thermal()
                series.append(listOf(elapsed, round, case.modelId, case.performance.wire, case.policy, t.opt("thermalStatus"),
                    t.opt("headroom10s"), t.opt("batteryTempC"), t.opt("batteryCurrentUa"), t.opt("batteryLevel"), t.opt("plugged"),
                    if (elapsed % 30_000 < 10_000) memory().opt("totalPssKb") else "").joinToString(",") { BenchMetrics.csvField(it) }).append('\n')
                nextSample += 10_000
            }
        }
        // Let the in-flight window finish and its result reach the listener (main looper).
        val drainStart = SystemClock.elapsedRealtime()
        while (SystemClock.elapsedRealtime() - drainStart < 60_000 && transcriber.diagnostics().contains("\"busy\":true")) SystemClock.sleep(20)
        SystemClock.sleep(300)
        val diag = JSONObject(transcriber.diagnostics())
        collector.ingest(transcriber.decodeTimings())
        val stopStart = SystemClock.elapsedRealtimeNanos()
        transcriber.stop()
        while (transcriber.diagnostics().contains("\"worker\":true")) SystemClock.sleep(5)
        item.put("stopDrainMs", ms(stopStart))
        val analysis = diag.getJSONObject("analysis")
        val speechTotal = stream.speech.sumOf { it[1] - it[0] }
        val speechCovered = stream.speech.map { collector.coveredMs(it[0], it[1]) }
        val closures = analysis.getLong("limitClosures"); val dropped = diag.getLong("dropped")
        val windowedMs = maxOf(1L, analysis.getLong("windowedAudioMs"))
        val hypothesis = received.joinToString(" ")
        val errors = BenchMetrics.errors(stream.reference, hypothesis)
        // Coverage = PCM time of windows the decoder processed without error in the current generation.
        // It is not recognised, accepted or delivered words.
        item.put("coverageSemantics", "decoded-ok-v2")
            .put("audioMs", stream.pcm.size / 16).put("closures", closures).put("constantWindows", analysis.getLong("constantWindows"))
            .put("decodeCalls", analysis.getLong("decodeCalls")).put("dropped", dropped)
            .put("decodeErrors", analysis.getLong("decodeErrors")).put("processingErrors", analysis.getLong("processingErrors"))
            .put("dropPct", if (closures == 0L) 0.0 else 100.0 * dropped / closures)
            .put("attemptedCoveragePct", 100.0 * analysis.getLong("attemptedAudioMs") / windowedMs)
            .put("coveragePct", 100.0 * analysis.getLong("coveredAudioMs") / windowedMs)
            .put("speechCoveragePct", if (speechTotal == 0L || speechCovered.any { it == null }) JSONObject.NULL
                else 100.0 * speechCovered.sumOf { it!! } / speechTotal)
            .put("timingsComplete", collector.complete).put("timingsAttempts", collector.total)
            .put("timingsInvalidReason", collector.invalidReason ?: JSONObject.NULL)
            .put("decodeP50Ms", collector.okPercentile(0.5) ?: JSONObject.NULL)
            .put("decodeP95Ms", collector.okPercentile(0.95) ?: JSONObject.NULL)
            .put("failedOrInvalidatedMaxMs", collector.notOkMaxMs() ?: JSONObject.NULL)
            .put("decodeMaxMs", analysis.getLong("decodeMaxMs"))
            .put("latencyAvgMs", analysis.getLong("deliveryLatencyCount").let { if (it == 0L) JSONObject.NULL else analysis.getLong("deliveryLatencyTotalMs") / it })
            .put("latencyMaxMs", analysis.getLong("deliveryLatencyMaxMs"))
            .put("delivered", analysis.getLong("delivered")).put("deliveryDiscarded", analysis.getLong("deliveryDiscarded"))
            .put("invalidatedDecodes", analysis.getLong("invalidatedDecodes"))
            .put("rejectedLanguage", analysis.getLong("rejectedLanguage")).put("rejectedEmpty", analysis.getLong("rejectedEmpty"))
            .put("rejectedStructure", analysis.getLong("rejectedStructure")).put("rejectedHallucination", analysis.getLong("rejectedHallucination"))
            .put("languageEs", analysis.getLong("languageEs")).put("languageCa", analysis.getLong("languageCa"))
            .put("languageOther", analysis.getLong("languageOther"))
            .put("deferredWindows", analysis.getLong("deferredWindows")).put("coalescedWindows", analysis.getLong("coalescedWindows"))
            .put("maxWindowMs", analysis.getLong("maxWindowMs"))
            // A sustained loop cuts streams at arbitrary points, so its joined reference is not comparable.
            .put("wer", if (errors.refWords == 0 || stream.kind == "sustained") JSONObject.NULL else errors.wordErrors.toDouble() / errors.refWords)
            .put("cer", if (errors.refChars == 0 || stream.kind == "sustained") JSONObject.NULL else errors.charErrors.toDouble() / errors.refChars)
            .put("hypWords", errors.hypWords).put("lateChunks", lateChunks).put("maxLateMs", maxLateMs)
            .put("levels", analysis.getJSONObject("levels"))
            .put("thermalAfter", thermal()).put("memoryAfter", memory())
        if (options.recordText) item.put("hypothesis", hypothesis)
        return item
    }

    // ---------------------------------------------------------------- device state

    private fun deviceInfo(): JSONObject = JSONObject()
        .put("manufacturer", Build.MANUFACTURER).put("model", Build.MODEL).put("device", Build.DEVICE)
        .put("socManufacturer", Build.SOC_MANUFACTURER).put("socModel", Build.SOC_MODEL)
        .put("android", Build.VERSION.RELEASE).put("sdk", Build.VERSION.SDK_INT).put("securityPatch", Build.VERSION.SECURITY_PATCH)
        .put("fingerprint", Build.FINGERPRINT).put("abis", JSONArray(Build.SUPPORTED_ABIS.toList()))
        .put("cpus", Runtime.getRuntime().availableProcessors()).put("cpuMaxKHz", JSONArray(cpuMaxFrequencies()))
        .put("vm", System.getProperty("java.vm.version")).put("benchCommit", BuildConfig.GIT_COMMIT)
        .put("sherpaOnnx", BuildConfig.SHERPA_VERSION).put("sherpaLibraries", BuildConfig.SHERPA_LIB_HASHES)
        .put("totalMemMb", ActivityManager.MemoryInfo().also { activity.getMemoryInfo(it) }.totalMem / 1_048_576)
        .put("thermal", thermal())

    private fun cpuMaxFrequencies(): List<Long> = (0 until Runtime.getRuntime().availableProcessors()).map {
        runCatching { File("/sys/devices/system/cpu/cpu$it/cpufreq/cpuinfo_max_freq").readText().trim().toLong() }.getOrDefault(-1L)
    }

    /** Thermal status/headroom and battery state. Instantaneous battery values are not energy per inference. */
    private fun thermal(): JSONObject {
        val battery = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val manager = context.getSystemService(BatteryManager::class.java)
        return JSONObject().put("thermalStatus", power.currentThermalStatus).put("headroom10s", power.getThermalHeadroom(10).toDouble())
            .put("batteryTempC", (battery?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1) ?: -1) / 10.0)
            .put("batteryLevel", battery?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1))
            .put("plugged", battery?.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1))
            .put("batteryCurrentUa", manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW))
            .put("chargeCounterUah", manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CHARGE_COUNTER))
            .put("interactive", power.isInteractive).put("elapsedMs", SystemClock.elapsedRealtime())
    }

    private fun memory(): JSONObject {
        val info = Debug.MemoryInfo().also { Debug.getMemoryInfo(it) }
        val status = runCatching { File("/proc/self/status").readLines() }.getOrDefault(emptyList())
        fun field(name: String) = status.firstOrNull { it.startsWith(name) }?.split(Regex("\\s+"))?.getOrNull(1)?.toLongOrNull()
        return JSONObject().put("totalPssKb", info.totalPss).put("nativeHeapKb", Debug.getNativeHeapAllocatedSize() / 1024)
            .put("vmRssKb", field("VmRSS:")).put("vmHwmKb", field("VmHWM:"))
    }

    private fun cooldown() {
        if (options.cooldownSec <= 0) return
        status("cooldown ${options.cooldownSec}s")
        SystemClock.sleep(options.cooldownSec * 1000L)
    }

    // ---------------------------------------------------------------- helpers

    /** sherpa-onnx logs "Fallback to cpu" when a requested provider is unavailable; read our own log only. */
    private fun sherpaFallbacks(): Int = runCatching {
        val process = ProcessBuilder("logcat", "-d", "--pid=${Process.myPid()}").redirectErrorStream(true).start()
        process.inputStream.bufferedReader().useLines { lines -> lines.count { it.contains("Fallback to cpu") } }
    }.getOrDefault(-1)

    private fun effectiveProvider(performance: LocalWhisperPerformance, newFallbacks: Int): String = when {
        performance.provider == "cpu" -> "cpu"
        newFallbacks > 0 -> "cpu (fallback logged: ${performance.provider} unavailable)"
        newFallbacks < 0 -> "${performance.provider} requested; log unreadable, effective provider unknown"
        // Registration is not proof that int8 nodes were assigned to the provider.
        else -> "${performance.provider} registered (no fallback logged; node assignment not verified)"
    }

    private fun statusOf(diag: String) = Regex("\"status\":\"([^\"]*)\"").find(diag)?.groupValues?.get(1) ?: "?"

    private fun floats(pcm: ShortArray, start: Int, end: Int) = FloatArray(end - start) { pcm[start + it] / 32768f }

    private fun lowNoise(samples: Int): ShortArray {
        var state = 0x2545F491L
        val amplitude = 32768 * 0.000562 // about -65 dBFS RMS for a uniform +-sqrt(3) source
        return ShortArray(samples) {
            state = (state * 6364136223846793005L + 1442695040888963407L)
            val uniform = ((state ushr 11).toDouble() / (1L shl 53)) * 2 - 1
            (uniform * 1.732 * amplitude).toInt().toShort()
        }
    }

    private fun ms(startNanos: Long) = (SystemClock.elapsedRealtimeNanos() - startNanos) / 1_000_000

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input -> val block = ByteArray(1 shl 20); while (true) { val n = input.read(block); if (n < 0) break; digest.update(block, 0, n) } }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
