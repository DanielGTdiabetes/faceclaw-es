#!/usr/bin/env bash
# Isolated whisper.cpp comparison prototype. Never linked into Faceclaw.
# Builds static whisper-cli/whisper-bench for Android arm64 (CPU and Vulkan) and an x86-64 host CPU build
# used only to validate the run/analysis scripts on the PC.
#
# Requirements (Linux x86-64 or WSL2): cmake >= 3.22, ninja, gcc/g++ (host shader generator), git,
# Android NDK r27c (https://dl.google.com/android/repository/android-ndk-r27c-linux.zip),
# whisper.cpp tag v1.9.4 and Khronos Vulkan-Headers tag v1.4.321 (C++ vulkan.hpp, absent from the NDK).
#
#   WORK=~/faceclaw-whispercpp ./build_android.sh
set -euo pipefail
WORK=${WORK:-$HOME/faceclaw-whispercpp}
NDK=${NDK:-$WORK/android-ndk-r27c}
SRC=${SRC:-$WORK/whisper.cpp}
VK_HEADERS=${VK_HEADERS:-$WORK/Vulkan-Headers}
API=${API:-33}
# Tensor G5 cores are Armv9; this baseline also runs on any Armv8.2 core with dotprod/fp16.
ARCH=${ARCH:-armv8.2-a+dotprod+fp16}
OUT=${OUT:-$WORK/out}
mkdir -p "$OUT"

[ -d "$SRC" ] || git clone --depth 1 --branch v1.9.4 https://github.com/ggml-org/whisper.cpp.git "$SRC"
[ -d "$VK_HEADERS" ] || git clone --depth 1 --branch v1.4.321 https://github.com/KhronosGroup/Vulkan-Headers.git "$VK_HEADERS"
echo "whisper.cpp $(git -C "$SRC" describe --tags) $(git -C "$SRC" rev-parse HEAD)" | tee "$OUT/versions.txt"
echo "Vulkan-Headers $(git -C "$VK_HEADERS" describe --tags) $(git -C "$VK_HEADERS" rev-parse HEAD)" | tee -a "$OUT/versions.txt"
echo "NDK $(grep Pkg.Revision "$NDK/source.properties")" | tee -a "$OUT/versions.txt"

android_build() { # name, extra cmake args...
  local name=$1; shift
  cmake -S "$SRC" -B "$WORK/build-$name" -G Ninja \
    -DCMAKE_TOOLCHAIN_FILE="$NDK/build/cmake/android.toolchain.cmake" \
    -DANDROID_ABI=arm64-v8a -DANDROID_PLATFORM=android-$API -DANDROID_STL=c++_static \
    -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF -DGGML_CPU_ARM_ARCH="$ARCH" \
    -DGGML_OPENMP=OFF -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF -DWHISPER_SDL2=OFF "$@"
  cmake --build "$WORK/build-$name" --target whisper-cli whisper-bench -j"$(nproc)"
  mkdir -p "$OUT/android-$name"
  cp "$WORK/build-$name/bin/whisper-cli" "$WORK/build-$name/bin/whisper-bench" "$OUT/android-$name/"
}

android_build cpu -DGGML_VULKAN=OFF
# Vulkan: headers from Khronos (vulkan.hpp), loader stub and glslc from the NDK.
GLSLC=$(ls "$NDK"/shader-tools/*/glslc | head -1)
android_build vulkan -DGGML_VULKAN=ON -DVulkan_INCLUDE_DIR="$VK_HEADERS/include" -DVulkan_GLSLC_EXECUTABLE="$GLSLC"

cmake -S "$SRC" -B "$WORK/build-host" -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
  -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF -DWHISPER_SDL2=OFF
cmake --build "$WORK/build-host" --target whisper-cli whisper-bench -j"$(nproc)"
mkdir -p "$OUT/host-cpu" && cp "$WORK/build-host/bin/whisper-cli" "$WORK/build-host/bin/whisper-bench" "$OUT/host-cpu/"

READELF=$(ls "$NDK"/toolchains/llvm/prebuilt/*/bin/llvm-readelf | head -1)
for f in "$OUT"/android-*/*; do
  printf '%s sha256=%s align=%s needed=%s\n' "${f#$OUT/}" "$(sha256sum "$f" | cut -c1-64)" \
    "$("$READELF" -lW "$f" | awk '/LOAD/ {print $NF}' | sort -u | tr '\n' ' ')" \
    "$("$READELF" -dW "$f" | awk '/NEEDED/ {print $NF}' | tr -d '[]' | tr '\n' ' ')"
done | tee "$OUT/binaries.txt"
