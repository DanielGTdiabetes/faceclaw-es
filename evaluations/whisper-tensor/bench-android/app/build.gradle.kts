import java.net.URI
import java.security.MessageDigest

plugins {
    id("com.android.application")
    kotlin("android")
}

// Separate benchmark app: own application id, development (debug) signature, no Faceclaw data,
// permissions, network or microphone. It compiles the PRODUCTION Whisper sources listed below.
val repoRoot = rootDir.resolve("../../..").canonicalFile
val productionJava = repoRoot.resolve("App_Resources/Android/src/main/java")
val productionFiles = listOf(
    "com/faceclaw/app/FaceclawLocalTranscriber.kt",
    "com/faceclaw/app/LocalWhisperModels.kt",
    "com/faceclaw/app/AndroidSpeechEngines.kt",
    "com/faceclaw/app/FaceclawLc3Decoder.kt", // referenced by AndroidSpeechEngines; never loaded here
)
val sherpaVersion = "1.13.0"
// Same native runtime as the production APK (hashes of the libraries Faceclaw ships today).
val sherpaLibs = mapOf(
    "libonnxruntime.so" to "4d2318b3849abb8862133d3068fc7e807ed8b2671cc6d83657fff2fcb9e1caad",
    "libsherpa-onnx-jni.so" to "290a2c18e7aa6214879abc7e177b25326b17771215c14b8cb5ebe61c46ca8253",
)
val generatedSources = layout.buildDirectory.dir("generated/faceclaw-production")
val jniDir = layout.buildDirectory.dir("generated/jniLibs")

fun sha256(file: File): String = MessageDigest.getInstance("SHA-256").let { digest ->
    file.inputStream().use { input -> val block = ByteArray(1 shl 20); while (true) { val n = input.read(block); if (n < 0) break; digest.update(block, 0, n) } }
    digest.digest().joinToString("") { "%02x".format(it) }
}

val syncProductionSources = tasks.register<Sync>("syncProductionSources") {
    from(productionJava) {
        productionFiles.forEach { include(it) }
        include("com/k2fsa/sherpa/onnx/**")
    }
    into(generatedSources)
}

val prepareSherpaJni = tasks.register("prepareSherpaJni") {
    val output = jniDir.get().asFile.resolve("arm64-v8a")
    outputs.dir(jniDir)
    doLast {
        output.mkdirs()
        // -PsherpaJniDir=<dir with both .so> reuses an existing extraction; otherwise download the release.
        val local = (project.findProperty("sherpaJniDir") as String?)?.let(::File)
        if (local != null) {
            sherpaLibs.keys.forEach { local.resolve(it).copyTo(output.resolve(it), overwrite = true) }
        } else {
            val archive = layout.buildDirectory.file("downloads/sherpa-onnx-v$sherpaVersion-android.tar.bz2").get().asFile
            if (!archive.isFile || archive.length() == 0L) {
                archive.parentFile.mkdirs()
                URI("https://github.com/k2-fsa/sherpa-onnx/releases/download/v$sherpaVersion/sherpa-onnx-v$sherpaVersion-android.tar.bz2")
                    .toURL().openStream().use { input -> archive.outputStream().use { input.copyTo(it) } }
            }
            copy {
                from(tarTree(resources.bzip2(archive)))
                sherpaLibs.keys.forEach { include("**/jniLibs/arm64-v8a/$it") }
                eachFile { path = name }
                includeEmptyDirs = false
                into(output)
            }
        }
        sherpaLibs.forEach { (name, expected) ->
            val actual = sha256(output.resolve(name))
            check(actual == expected) { "$name hash $actual differs from the production library $expected" }
        }
    }
}

val gitCommit: String = providers.exec {
    commandLine("git", "-C", repoRoot.path, "rev-parse", "--short=12", "HEAD")
    isIgnoreExitValue = true
}.standardOutput.asText.get().trim().ifEmpty { "unknown" }
val gitDirty: Boolean = providers.exec {
    commandLine("git", "-C", repoRoot.path, "status", "--porcelain", "--", "native", "App_Resources", "evaluations/whisper-tensor")
    isIgnoreExitValue = true
}.standardOutput.asText.get().isNotBlank()

android {
    namespace = "com.faceclaw.whisperbench"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.faceclaw.whisperbench"
        minSdk = 33
        targetSdk = 35
        versionCode = 1
        versionName = "0.1-$gitCommit${if (gitDirty) "-dirty" else ""}"
        ndk { abiFilters += "arm64-v8a" }
        buildConfigField("String", "GIT_COMMIT", "\"$gitCommit${if (gitDirty) "-dirty" else ""}\"")
        buildConfigField("String", "SHERPA_VERSION", "\"$sherpaVersion\"")
        buildConfigField("String", "SHERPA_LIB_HASHES",
            "\"${sherpaLibs.entries.joinToString(";") { "${it.key}=${it.value}" }}\"")
    }
    buildFeatures { buildConfig = true }
    buildTypes {
        // Benchmarks run the release variant (R8 off so the production classes are unchanged),
        // signed with the local debug key: a development signature, never Faceclaw's.
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    sourceSets["main"].java.srcDir(generatedSources)
    sourceSets["main"].jniLibs.srcDir(jniDir)
    // 16 KB pages: keep .so uncompressed and page-aligned inside the APK.
    packaging { jniLibs { useLegacyPackaging = false } }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    testOptions { unitTests.isReturnDefaultValues = true }
}

kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }

tasks.named("preBuild") { dependsOn(syncProductionSources, prepareSherpaJni) }

dependencies {
    implementation(project(":shared"))
    testImplementation(kotlin("test"))
    testImplementation("junit:junit:4.13.2")
}

tasks.withType<Test>().configureEach {
    systemProperty("metricVectors", rootDir.resolve("../metric_vectors.json").canonicalPath)
}
