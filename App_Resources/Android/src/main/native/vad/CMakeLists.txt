cmake_minimum_required(VERSION 3.22)
project(faceclaw_vad C CXX)
set(CMAKE_CXX_STANDARD 17)
file(GLOB VAD_SOURCES CONFIGURE_DEPENDS
  "webrtc/common_audio/signal_processing/*.c"
  "webrtc/common_audio/third_party/spl_sqrt_floor/*.c"
  "webrtc/common_audio/vad/*.c")
add_library(faceclaw_vad SHARED ${VAD_SOURCES} webrtc/rtc_base/checks.cc faceclaw_vad.cpp)
target_include_directories(faceclaw_vad PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}")
target_compile_definitions(faceclaw_vad PRIVATE WEBRTC_POSIX)
target_link_libraries(faceclaw_vad PRIVATE log)
target_link_options(faceclaw_vad PRIVATE "-Wl,-z,max-page-size=16384")
