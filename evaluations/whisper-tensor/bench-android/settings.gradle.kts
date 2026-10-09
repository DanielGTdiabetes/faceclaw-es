pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositories { google(); mavenCentral() } }
rootProject.name = "FaceclawWhisperBench"
// The production shared Kotlin module, compiled from the same sources as the app.
include(":shared")
project(":shared").projectDir = file("../../../native/kotlin/shared")
include(":app")
