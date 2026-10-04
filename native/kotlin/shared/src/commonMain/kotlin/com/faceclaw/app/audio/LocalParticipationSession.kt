package com.faceclaw.app

import kotlin.math.sqrt

/** Only the consenting wearer's vector is retained. Other vectors are erased after comparison. */
interface LocalVoiceDecoder {
    val dimension: Int
    fun embed(samples: FloatArray): FloatArray?
    fun release()
}
interface PreparedLocalVoiceProfile {
    /** A bounded atomic rename only; encryption and disk preparation happen on the worker. */
    fun commit(): Boolean
    fun cancel()
}
interface LocalParticipationHost {
    fun loadDecoder(): LocalVoiceDecoder?
    fun loadProfile(dimension: Int): FloatArray?
    fun prepareProfile(vector: FloatArray): PreparedLocalVoiceProfile
}

/** Reject invalid, zero and mismatched vectors rather than producing an identity fallback. */
fun normalizeLocalVoice(vector: FloatArray?, dimension: Int): FloatArray? {
    if (vector == null) return null
    if (dimension <= 0 || vector.size != dimension || vector.any { !it.isFinite() }) {
        vector.fill(0f); return null
    }
    val norm = sqrt(vector.sumOf { it.toDouble() * it })
    if (!norm.isFinite() || norm < 1e-8) { vector.fill(0f); return null }
    for (i in vector.indices) vector[i] = (vector[i] / norm).toFloat()
    return vector
}
private fun localVoiceSimilarity(a: FloatArray, b: FloatArray): Double =
    if (a.size == b.size) a.indices.sumOf { a[it].toDouble() * b[it] } else -1.0

/** Provisional turn evidence, not verified identity, human presence or participation. */
class LocalParticipationTurns {
    private var previous = ""
    private var previousAt = 0L
    private var transitionAt = 0L
    private var transitions = 0
    var voice = "insuficiente"; private set
    fun reset() { previous = ""; previousAt = 0; transitionAt = 0; transitions = 0; voice = "insuficiente" }
    fun accept(similarity: Double?, now: Long) {
        val next = when {
            similarity == null || !similarity.isFinite() -> "insuficiente"
            similarity >= 0.80 -> "compatible con mi perfil"
            similarity <= 0.60 -> "voz no coincidente"
            else -> "insuficiente"
        }
        if (next == "insuficiente") { reset(); return }
        if (now - previousAt > 20000 || now < previousAt) reset()
        if (transitions > 0 && now - transitionAt > 20000) transitions = 0
        if (previous.isNotEmpty() && previous != next) { transitions++; transitionAt = now }
        previous = next; previousAt = now; voice = next
    }
    fun state(now: Long): String {
        if (previous.isEmpty() || now < previousAt || now - previousAt > 20000) return "evidencia insuficiente"
        return if (transitions >= 2 && now - transitionAt <= 20000) "conversación candidata" else "esperando alternancia"
    }
}

/** Independent bounded worker. OFF/reset invalidates JNI and any prepared profile before publication. */
class LocalParticipationSession(
    private val host: LocalParticipationHost,
    private val platform: ProtocolPlatform = protocolPlatform(),
) {
    private data class Job(val generation: Long, val audio: ShortArray, val voiced: Int)
    private val condition = platform.createCondition()
    private var running = false
    private var worker = false
    private var ready = false
    private var busy = false
    private var enrolling = false
    private var generation = 0L
    private var deadline = 0L
    private var status = "inactivo"
    private var job: Job? = null
    private var activeBytes = 0
    private var segmentVoiced = 0
    private var own: FloatArray? = null
    private var centroid: FloatArray? = null
    private var enrollmentSamples = 0L
    private var enrollmentSegments = 0
    private var comparisons = 0
    private var abstentions = 0
    private var dropped = 0
    private var profileSaved = false
    private val turns = LocalParticipationTurns()
    private val buffer = LocalTranscriptBuffer(segmentInfo = { segmentVoiced = it }) { audio ->
        if (!running || !ready || busy) { audio.fill(0); dropped++ }
        else { job = Job(generation, audio, segmentVoiced); busy = true; condition.signalAll() }
    }

    /** enrollment=true is only called after the explicit local-profile consent screen. */
    fun start(enrollment: Boolean): Boolean {
        condition.withLock {
            if (worker) return false
            running = true; worker = true; ready = false; busy = false; enrolling = enrollment
            generation++; deadline = platform.elapsedRealtimeMs() + 120000; status = "cargando"
            eraseVectors(); buffer.resetMetrics(); turns.reset()
            profileSaved = false; comparisons = 0; abstentions = 0; dropped = 0
        }
        startThread("FaceclawLocalParticipation", true) { runWorker() }
        return true
    }
    fun resetStream() {
        condition.withLock {
            generation++; buffer.reset(); turns.reset(); clearEnrollment()
            job?.audio?.fill(0); job = null
            if (activeBytes == 0) busy = false
            condition.signalAll()
        }
    }
    fun stop() {
        condition.withLock {
            running = false; ready = false; generation++; status = "inactivo"
            buffer.reset(); turns.reset(); eraseVectors(); job?.audio?.fill(0); job = null
            if (activeBytes == 0) busy = false
            condition.signalAll()
        }
    }
    fun acceptPcm(pcm: ByteArray?, vadState: String) {
        condition.withLock {
            if (running && ready && pcm != null && platform.elapsedRealtimeMs() < deadline) buffer.accept(pcm, vadState)
        }
    }
    fun diagnostics(): String = condition.withLock {
        val now = platform.elapsedRealtimeMs()
        "{\"status\":\"$status\",\"worker\":$worker,\"busy\":$busy,\"enrolling\":$enrolling," +
            "\"inputBufferedBytes\":${buffer.bufferedBytes() + (job?.audio?.size ?: 0) * 2 + activeBytes}," +
            "\"profileSaved\":$profileSaved,\"enrollmentMs\":${enrollmentSamples / 16}," +
            "\"enrollmentSegments\":$enrollmentSegments,\"comparisons\":$comparisons," +
            "\"abstentions\":$abstentions,\"dropped\":$dropped," +
            "\"voice\":\"${if (running && now < deadline && turns.state(now) != "evidencia insuficiente") turns.voice else "insuficiente"}\"," +
            "\"participation\":\"${if (running && now < deadline) turns.state(now) else "evidencia insuficiente"}\"}"
    }
    private fun clearEnrollment() {
        centroid?.fill(0f); centroid = null; enrollmentSamples = 0; enrollmentSegments = 0
    }
    private fun eraseVectors() { own?.fill(0f); own = null; clearEnrollment() }
    private fun valid(token: Long): Boolean = running && generation == token && platform.elapsedRealtimeMs() < deadline
    private fun nextJob(): Job? = condition.withLock {
        while (running && job == null && platform.elapsedRealtimeMs() < deadline) condition.awaitMs(250)
        if (platform.elapsedRealtimeMs() >= deadline) { running = false; ready = false; status = "inactivo" }
        val next = if (running) job else null
        job = null
        if (next != null) activeBytes = next.audio.size * 6
        next
    }
    private fun runWorker() {
        var decoder: LocalVoiceDecoder? = null
        try {
            // Capture may be reset while loading; publish a profile only if this start remains live.
            decoder = host.loadDecoder()
            if (decoder == null) { condition.withLock { if (running) status = "modelo no disponible" }; return }
            val profile = if (!enrolling) normalizeLocalVoice(host.loadProfile(decoder.dimension), decoder.dimension) else null
            condition.withLock {
                if (!running || platform.elapsedRealtimeMs() >= deadline) { profile?.fill(0f); return }
                own = profile
                if (!enrolling && own == null) { status = "sin perfil compatible"; running = false; return }
                ready = true; status = "listo"
            }
            while (true) {
                val next = nextJob() ?: break
                val samples = FloatArray(next.audio.size) { next.audio[it] / 32768f }
                var embedding: FloatArray? = null
                var prepared: PreparedLocalVoiceProfile? = null
                var saveVector: FloatArray? = null
                try {
                    val usable = next.voiced >= 16000 && samples.count { kotlin.math.abs(it) >= 0.999f } < samples.size / 100 &&
                        samples.sumOf { it.toDouble() * it } / samples.size >= 0.000036
                    if (usable && condition.withLock { valid(next.generation) }) {
                        embedding = normalizeLocalVoice(decoder.embed(samples), decoder.dimension)
                    }
                    condition.withLock {
                        if (!valid(next.generation)) return@withLock
                        val vector = embedding
                        if (vector == null) { abstentions++; turns.reset(); return@withLock }
                        if (!enrolling) {
                            val profileVector = own
                            comparisons++
                            turns.accept(profileVector?.let { localVoiceSimilarity(it, vector) }, platform.elapsedRealtimeMs())
                        } else {
                            val previous = centroid
                            if (previous != null && localVoiceSimilarity(previous, vector) < 0.70) { abstentions++; return@withLock }
                            val merged = if (previous == null) vector.copyOf() else FloatArray(vector.size) {
                                previous[it] * enrollmentSegments + vector[it]
                            }
                            centroid = normalizeLocalVoice(merged, decoder.dimension)
                            previous?.fill(0f)
                            if (centroid == null) { clearEnrollment(); abstentions++; return@withLock }
                            enrollmentSamples += next.voiced; enrollmentSegments++
                            if (enrollmentSegments >= 3 && enrollmentSamples >= 160000) saveVector = centroid!!.copyOf()
                        }
                    }
                    val save = saveVector
                    if (save != null) {
                        prepared = host.prepareProfile(save)
                        condition.withLock {
                            if (valid(next.generation)) {
                                profileSaved = prepared.commit()
                                status = if (profileSaved) "perfil guardado" else "error"
                                running = false; ready = false
                            }
                        }
                    }
                } catch (_: Throwable) {
                    condition.withLock {
                        if (valid(next.generation)) {
                            abstentions++; turns.reset()
                            if (saveVector != null) { status = "error"; running = false; ready = false }
                        }
                    }
                } finally {
                    prepared?.cancel(); saveVector?.fill(0f); embedding?.fill(0f)
                    samples.fill(0f); next.audio.fill(0)
                    condition.withLock { activeBytes = 0; busy = false }
                }
            }
        } catch (_: Throwable) {
            condition.withLock { if (running) status = "error" }
        } finally {
            try { decoder?.release() } catch (_: Throwable) { /* content-free failure */ }
            condition.withLock {
                buffer.reset(); job?.audio?.fill(0); job = null; eraseVectors(); turns.reset()
                activeBytes = 0; busy = false; ready = false; running = false; worker = false
            }
        }
    }
}
