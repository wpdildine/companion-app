#include <jni.h>
#include <string>
#include <vector>
#include "piper_engine.h"

extern "C" {

// Returns Object[] of length 2:
// - Success: [byte[] pcm, Integer sampleRate]
// - Failure: [null, String errorMessage] so Kotlin can reject with the real pipeline error.
static const char* synthesizeErrorToString(piper::SynthesizeError e) {
  switch (e) {
    case piper::SynthesizeError::kNone: return "None";
    case piper::SynthesizeError::kInvalidArgs: return "Invalid arguments";
    case piper::SynthesizeError::kConfigOpenFailed: return "Config file could not be opened";
    case piper::SynthesizeError::kConfigParseFailed: return "Config JSON parse failed";
    case piper::SynthesizeError::kEspeakNotLinked: return "Phonemization unavailable: espeak-ng is not linked on this platform (Android). Run scripts/download-espeak-ng-data.sh and ensure the native library is built with PIPER_ENGINE_USE_ESPEAK.";
    case piper::SynthesizeError::kEspeakInitFailed: return "espeak-ng initialization failed";
    case piper::SynthesizeError::kEspeakSetVoiceFailed: return "espeak-ng set voice failed";
    case piper::SynthesizeError::kPhonemeIdsEmpty: return "Phoneme id sequence empty";
    case piper::SynthesizeError::kOrtCreateSessionFailed: return "ONNX Runtime session creation failed";
    case piper::SynthesizeError::kOrtRunInferenceFailed: return "ONNX inference failed";
    default: return "Synthesis failed";
  }
}

JNIEXPORT jobject JNICALL
Java_com_pipertts_PiperTtsModule_nativeSynthesize(JNIEnv* env, jclass clazz,
                                                   jstring j_model_path,
                                                   jstring j_config_path,
                                                   jstring j_espeak_path,
                                                   jstring j_text) {
  const char* model_path = env->GetStringUTFChars(j_model_path, nullptr);
  const char* config_path = env->GetStringUTFChars(j_config_path, nullptr);
  const char* espeak_path = j_espeak_path ? env->GetStringUTFChars(j_espeak_path, nullptr) : "";
  const char* text = env->GetStringUTFChars(j_text, nullptr);
  if (!model_path || !config_path || !text) {
    if (model_path) env->ReleaseStringUTFChars(j_model_path, model_path);
    if (config_path) env->ReleaseStringUTFChars(j_config_path, config_path);
    if (espeak_path && j_espeak_path) env->ReleaseStringUTFChars(j_espeak_path, espeak_path);
    if (text) env->ReleaseStringUTFChars(j_text, text);
    return nullptr;
  }

  std::vector<int16_t> pcm;
  int sample_rate = 0;
  piper::SynthesizeError synth_error = piper::SynthesizeError::kNone;
  bool ok = piper::synthesize(model_path, config_path, espeak_path ? espeak_path : "", text, pcm, sample_rate, &synth_error);

  env->ReleaseStringUTFChars(j_model_path, model_path);
  env->ReleaseStringUTFChars(j_config_path, config_path);
  if (espeak_path && j_espeak_path) env->ReleaseStringUTFChars(j_espeak_path, espeak_path);
  env->ReleaseStringUTFChars(j_text, text);

  jclass objectArrayClass = env->FindClass("[Ljava/lang/Object;");
  if (!objectArrayClass) return nullptr;
  jobjectArray result = env->NewObjectArray(2, env->FindClass("java/lang/Object"), nullptr);
  if (!result) return nullptr;

  if (!ok || pcm.empty()) {
    const char* err_msg = synthesizeErrorToString(synth_error);
    jstring j_err = env->NewStringUTF(err_msg);
    env->SetObjectArrayElement(result, 0, nullptr);
    env->SetObjectArrayElement(result, 1, j_err);
    return result;
  }

  jbyteArray pcmArray = env->NewByteArray(static_cast<jsize>(pcm.size() * 2));
  if (!pcmArray) return nullptr;
  env->SetByteArrayRegion(pcmArray, 0, static_cast<jsize>(pcm.size() * 2), reinterpret_cast<const jbyte*>(pcm.data()));

  jclass integerClass = env->FindClass("java/lang/Integer");
  jmethodID integerValueOf = env->GetStaticMethodID(integerClass, "valueOf", "(I)Ljava/lang/Integer;");
  jobject sampleRateObj = env->CallStaticObjectMethod(integerClass, integerValueOf, static_cast<jint>(sample_rate));

  env->SetObjectArrayElement(result, 0, pcmArray);
  env->SetObjectArrayElement(result, 1, sampleRateObj);
  return result;
}

}  // extern "C"
