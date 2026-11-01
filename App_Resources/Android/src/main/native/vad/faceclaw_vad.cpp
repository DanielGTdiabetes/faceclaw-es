#include <jni.h>
#include <algorithm>
#include <array>
#include <cmath>
#include "webrtc/common_audio/vad/include/webrtc_vad.h"

// No model/weights, network or retained audio. Each window has independent adaptation: overlapping
// Whisper windows must not feed the same samples twice into a persistent VAD state.
extern "C" JNIEXPORT jboolean JNICALL
Java_com_faceclaw_app_FaceclawSpeechVad_containsSpeechNative(JNIEnv* env, jobject, jfloatArray input) {
    constexpr int frame_samples = 480; // 30 ms, 16 kHz mono
    const jsize size = env->GetArrayLength(input);
    if (size < frame_samples) return JNI_TRUE; // insufficient evidence: preserve speech
    VadInst* vad = WebRtcVad_Create();
    if (!vad) return JNI_TRUE;
    if (WebRtcVad_Init(vad) != 0 || WebRtcVad_set_mode(vad, 1) != 0) {
        WebRtcVad_Free(vad); return JNI_TRUE;
    }
    std::array<jfloat, frame_samples> floats{};
    std::array<int16_t, frame_samples> pcm{};
    int voiced = 0;
    bool speech = false;
    for (jsize offset = 0; offset + frame_samples <= size; offset += frame_samples) {
        env->GetFloatArrayRegion(input, offset, frame_samples, floats.data());
        if (env->ExceptionCheck()) { speech = true; break; }
        for (int i = 0; i < frame_samples; ++i) {
            if (!std::isfinite(floats[i])) { speech = true; break; }
            pcm[i] = static_cast<int16_t>(std::clamp(floats[i] * 32768.0f, -32768.0f, 32767.0f));
        }
        if (speech) break;
        const int result = WebRtcVad_Process(vad, 16000, pcm.data(), frame_samples);
        // A stationary-noise startup may produce 3-4 positive frames before adaptation.
        // Six frames preserve brief speech while rejecting that measured 120 ms startup.
        if (result < 0 || (result == 1 && ++voiced >= 6)) { speech = true; break; }
    }
    pcm.fill(0); floats.fill(0);
    WebRtcVad_Free(vad);
    return speech ? JNI_TRUE : JNI_FALSE;
}
