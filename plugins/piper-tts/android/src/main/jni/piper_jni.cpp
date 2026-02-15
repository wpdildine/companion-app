#include <jni.h>
#include <string>
#include <vector>
#include "piper_engine.h"

extern "C" {

// Returns: jshortArray (PCM) and jint (sample rate) via callback or direct return.
// We return a single jobject that is a two-element array: [byte[] pcm, int sampleRate].
// Actually JNI convention: we can return a Java class that holds (byte[] pcm, int sampleRate).
// Simpler: pass a direct ByteBuffer and return sample rate as jint; or return a wrapper.
// Easiest: JNI method that takes modelPath, configPath, espeakPath, text and returns
// a jintArray where first element is sample rate and rest are int16 PCM (as ints). That's wasteful.
// Better: return jobject (Object[]) where [0] = byte[] pcm, [1] = Integer sampleRate.
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
  bool ok = piper::synthesize(model_path, config_path, espeak_path ? espeak_path : "", text, pcm, sample_rate);

  env->ReleaseStringUTFChars(j_model_path, model_path);
  env->ReleaseStringUTFChars(j_config_path, config_path);
  if (espeak_path && j_espeak_path) env->ReleaseStringUTFChars(j_espeak_path, espeak_path);
  env->ReleaseStringUTFChars(j_text, text);

  if (!ok || pcm.empty()) return nullptr;

  // Build result: Object[] { byte[] pcm, Integer sampleRate }
  jclass objectArrayClass = env->FindClass("[Ljava/lang/Object;");
  if (!objectArrayClass) return nullptr;
  jobjectArray result = env->NewObjectArray(2, env->FindClass("java/lang/Object"), nullptr);
  if (!result) return nullptr;

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
