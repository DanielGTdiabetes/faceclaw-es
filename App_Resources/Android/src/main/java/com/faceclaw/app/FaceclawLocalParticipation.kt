package com.faceclaw.app

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.system.Os
import com.k2fsa.sherpa.onnx.SpeakerEmbeddingExtractor
import com.k2fsa.sherpa.onnx.SpeakerEmbeddingExtractorConfig
import java.io.ByteArrayInputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private const val OWN_VOICE_MODEL_HASH = "c46fad10b5f81e1aa4a60c162714208577093655076c5450f8c469e522ec54ef"

/** Isolated from historical microphone profiles. Android noBackupFilesDir excludes biometric backup. */
private class OwnLocalVoiceStore(context: Context) {
    private val directory = File(context.noBackupFilesDir, "faceclaw-own-voice")
    private val target = File(directory, "profile.aes")
    private val alias = "faceclaw.conversation.own-voice.v1"
    fun exists(): Boolean = target.isFile
    private fun aad(dimension: Int): ByteArray = "faceclaw-own-voice:1:$OWN_VOICE_MODEL_HASH:$dimension:16000".toByteArray(Charsets.UTF_8)
    private fun key(create: Boolean): SecretKey? {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        if (!create) return null
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true).build())
        return generator.generateKey()
    }
    fun load(dimension: Int): FloatArray? {
        if (!target.isFile || target.length() !in 32..17000 || dimension !in 1..4096) return null
        var plain: ByteArray? = null
        try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            val encrypted = DataInputStream(target.inputStream()).use { input ->
                if (input.readInt() != 1 || input.readInt() != dimension) return null
                val iv = ByteArray(12); input.readFully(iv)
                cipher.init(Cipher.DECRYPT_MODE, key(false) ?: return null, GCMParameterSpec(128, iv))
                cipher.updateAAD(aad(dimension))
                input.readBytes()
            }
            plain = cipher.doFinal(encrypted)
            if (plain.size != dimension * 4) return null
            return DataInputStream(ByteArrayInputStream(plain)).use { input -> FloatArray(dimension) { input.readFloat() } }
        } catch (_: Throwable) { return null }
        finally { plain?.fill(0) }
    }
    fun prepare(vector: FloatArray): PreparedLocalVoiceProfile {
        require(vector.size in 1..4096)
        check(directory.isDirectory || directory.mkdirs())
        val temporary = File(directory, "${UUID.randomUUID()}.pending")
        val plain = ByteArray(vector.size * 4)
        // Use a fixed array instead of a growing stream which could retain a second plaintext copy.
        val floats = java.nio.ByteBuffer.wrap(plain)
        for (value in vector) floats.putFloat(value)
        try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, key(true) ?: error("key unavailable"))
            cipher.updateAAD(aad(vector.size))
            val encrypted = cipher.doFinal(plain)
            java.io.FileOutputStream(temporary).use { output ->
                val data = DataOutputStream(output)
                data.writeInt(1); data.writeInt(vector.size); data.write(cipher.iv); data.write(encrypted); data.flush()
                output.fd.sync()
            }
            return object : PreparedLocalVoiceProfile {
                override fun commit(): Boolean { Os.rename(temporary.absolutePath, target.absolutePath); return true }
                override fun cancel() { temporary.delete() }
            }
        } catch (failure: Throwable) { temporary.delete(); throw failure }
        finally { plain.fill(0) }
    }
    fun delete(): Boolean {
        val removed = !target.exists() || target.delete()
        // A canceled worker may still drain JNI, but cannot commit after session.stop().
        directory.listFiles()?.filter { it.name.endsWith(".pending") }?.forEach { it.delete() }
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (store.containsAlias(alias)) store.deleteEntry(alias)
        return removed && !target.exists()
    }
}

/** No networking, recording, legacy speaker registry, content logs or positive fallback. */
class FaceclawLocalParticipation(context: Context) {
    private val app = context.applicationContext
    private val store = OwnLocalVoiceStore(app)
    private val model = File(app.filesDir, "faceclaw-mic-models/speaker-embedding/speaker-embedding.onnx")
    private val session = LocalParticipationSession(object : LocalParticipationHost {
        override fun loadDecoder(): LocalVoiceDecoder? {
            if (!model.isFile) return null
            val digest = MessageDigest.getInstance("SHA-256")
            model.inputStream().use { input ->
                val block = ByteArray(65536)
                while (true) { val count = input.read(block); if (count < 0) break; digest.update(block, 0, count) }
                block.fill(0)
            }
            if (digest.digest().joinToString("") { "%02x".format(it) } != OWN_VOICE_MODEL_HASH) return null
            val extractor = SpeakerEmbeddingExtractor(SpeakerEmbeddingExtractorConfig.builder()
                .setModel(model.absolutePath).setNumThreads(1).setDebug(false).setProvider("cpu").build())
            return object : LocalVoiceDecoder {
                override val dimension: Int = extractor.dim
                override fun embed(samples: FloatArray): FloatArray? {
                    val stream = extractor.createStream()
                    try {
                        stream.acceptWaveform(samples, 16000); stream.inputFinished()
                        return if (extractor.isReady(stream)) extractor.compute(stream) else null
                    } finally { stream.release() }
                }
                override fun release() { extractor.release() }
            }
        }
        override fun loadProfile(dimension: Int): FloatArray? = store.load(dimension)
        override fun prepareProfile(vector: FloatArray): PreparedLocalVoiceProfile = store.prepare(vector)
    })
    fun hasProfile(): Boolean = store.exists()
    fun deleteProfile(): Boolean { session.stop(); return try { store.delete() } catch (_: Throwable) { false } }
    fun start(enrollment: Boolean): Boolean = session.start(enrollment)
    fun stop() = session.stop()
    fun resetStream() = session.resetStream()
    fun acceptPcm(pcm: ByteArray?, vadState: String) = session.acceptPcm(pcm, vadState)
    fun diagnostics(): String = session.diagnostics()
}
