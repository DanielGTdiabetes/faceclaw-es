// Versions match native/kotlin/build.gradle.kts and tests/kotlin.
plugins {
    kotlin("multiplatform") version "2.4.20" apply false
    kotlin("android") version "2.4.20" apply false
    id("com.android.kotlin.multiplatform.library") version "8.13.2" apply false
    id("com.android.application") version "8.13.2" apply false
}
