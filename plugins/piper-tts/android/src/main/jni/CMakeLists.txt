cmake_minimum_required(VERSION 3.22)
project(piper_tts JNI CXX)

set(CMAKE_CXX_STANDARD 17)

# ORT from unpacked AAR: ONNXRUNTIME_DIR should be set by Gradle (headers + jni per ABI)
if(NOT DEFINED ONNXRUNTIME_DIR)
  message(FATAL_ERROR "ONNXRUNTIME_DIR not set. Point to unpacked onnxruntime-android AAR (headers + jni).")
endif()

# Shared C++ with iOS: plugin root is ../../.. from android/src/main/jni
set(PIPER_CPP_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../../ios/cpp)
include_directories(
  ${ONNXRUNTIME_DIR}/headers
  ${PIPER_CPP_DIR}
)

add_library(piper_tts SHARED
  piper_jni.cpp
  ${PIPER_CPP_DIR}/piper_engine.cpp
  ${PIPER_CPP_DIR}/ort_capi_adapter.cpp
)

target_link_libraries(piper_tts
  android
  log
  ${ONNXRUNTIME_DIR}/jni/${ANDROID_ABI}/libonnxruntime.so
)
