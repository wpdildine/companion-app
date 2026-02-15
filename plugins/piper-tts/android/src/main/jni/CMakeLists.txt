cmake_minimum_required(VERSION 3.22)
project(piper_tts CXX)

set(CMAKE_CXX_STANDARD 17)

# ORT from unpacked AAR: ONNXRUNTIME_DIR should be set by Gradle (headers + jni per ABI)
if(NOT DEFINED ONNXRUNTIME_DIR)
  message(FATAL_ERROR "ONNXRUNTIME_DIR not set. Point to unpacked onnxruntime-android AAR (headers + jni).")
endif()

# Shared C++ with iOS: plugin root is ../../../../ from android/src/main/jni (jni -> main -> src -> android)
set(PIPER_CPP_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../../../ios/cpp)
include_directories(
  ${ONNXRUNTIME_DIR}/headers
  ${PIPER_CPP_DIR}
)

# --- espeak-ng for phonemization (same repo as scripts/download-espeak-ng-data.sh) ---
set(ESPEAK_NG_GIT_REPO "https://github.com/espeak-ng/espeak-ng" CACHE STRING "espeak-ng repo")
set(ESPEAK_NG_GIT_TAG "master" CACHE STRING "espeak-ng branch/tag")
set(COMPILE_INTONATIONS ON CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(ENABLE_TESTS OFF CACHE BOOL "" FORCE)
include(FetchContent)
FetchContent_Declare(espeak-ng
  GIT_REPOSITORY ${ESPEAK_NG_GIT_REPO}
  GIT_TAG        ${ESPEAK_NG_GIT_TAG}
  GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(espeak-ng)

# Piper engine with espeak-ng phonemization enabled
add_library(piper_tts SHARED
  piper_jni.cpp
  ${PIPER_CPP_DIR}/piper_engine.cpp
  ${PIPER_CPP_DIR}/ort_capi_adapter.cpp
)

target_compile_definitions(piper_tts PRIVATE PIPER_ENGINE_USE_ESPEAK=1)
target_link_libraries(piper_tts
  android
  log
  espeak-ng
  ${ONNXRUNTIME_DIR}/jni/${ANDROID_ABI}/libonnxruntime.so
)
