#include "ort_capi_adapter.h"
#include <onnxruntime_c_api.h>
#include <cstdio>
#include <cstring>
#include <stdexcept>
#include <string>
#include <vector>

#define PIPER_ORT_LOG(fmt, ...) std::fprintf(stderr, "[PiperORT] " fmt "\n", ##__VA_ARGS__)

namespace piper_ort {

// Free name using the same allocator that allocated it (ORT C API requirement). Do not use free() or ReleaseAllocator for default allocator.
static void freeSessionName(OrtAllocator* allocator, char* name) {
  if (name && allocator && allocator->Free)
    allocator->Free(allocator, name);
}

// Log session I/O names once per session; also returns whether session has "sid" input.
// Names from SessionGetInputName/SessionGetOutputName must be freed with the allocator's Free, not free().
static bool logSessionIONamesAndDetectSid(const OrtApi* api, OrtSession* sess) {
  OrtAllocator* allocator = nullptr;
  if (api->GetAllocatorWithDefaultOptions(&allocator) != nullptr) return false;
  size_t num_in = 0, num_out = 0;
  if (api->SessionGetInputCount(sess, &num_in) != nullptr) return false;
  if (api->SessionGetOutputCount(sess, &num_out) != nullptr) return false;
  PIPER_ORT_LOG("Session: %zu input(s), %zu output(s)", num_in, num_out);
  bool has_sid = false;
  for (size_t i = 0; i < num_in; i++) {
    char* name = nullptr;
    if (api->SessionGetInputName(sess, i, allocator, &name) != nullptr) continue;
    PIPER_ORT_LOG("  input[%zu] = \"%s\"", i, name ? name : "(null)");
    if (name) {
      if (strcmp(name, "sid") == 0) has_sid = true;
      freeSessionName(allocator, name);
    }
  }
  for (size_t i = 0; i < num_out; i++) {
    char* name = nullptr;
    if (api->SessionGetOutputName(sess, i, allocator, &name) != nullptr) continue;
    PIPER_ORT_LOG("  output[%zu] = \"%s\"", i, name ? name : "(null)");
    freeSessionName(allocator, name);
  }
  return has_sid;
}

static void logOrtStatus(const OrtApi* api, OrtStatus* status) {
  if (!status) return;
  const char* msg = api->GetErrorMessage(status);
  PIPER_ORT_LOG("ORT error: %s", msg ? msg : "(no message)");
  api->ReleaseStatus(status);
}

static const char* elementTypeStr(ONNXTensorElementDataType t) {
  switch (t) {
    case ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT: return "float32";
    case ONNX_TENSOR_ELEMENT_DATA_TYPE_UINT8: return "uint8";
    case ONNX_TENSOR_ELEMENT_DATA_TYPE_INT8: return "int8";
    case ONNX_TENSOR_ELEMENT_DATA_TYPE_UINT16: return "uint16";
    case ONNX_TENSOR_ELEMENT_DATA_TYPE_INT16: return "int16";
    case ONNX_TENSOR_ELEMENT_DATA_TYPE_INT32: return "int32";
    case ONNX_TENSOR_ELEMENT_DATA_TYPE_INT64: return "int64";
    case ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT16: return "float16";
    case ONNX_TENSOR_ELEMENT_DATA_TYPE_DOUBLE: return "double";
    default: return "?";
  }
}

struct PiperOrtSession {
  const OrtApi* api = nullptr;
  OrtEnv* env = nullptr;
  OrtSession* session = nullptr;
  OrtSessionOptions* session_options = nullptr;
};

static const OrtApi* getApi() {
  const OrtApiBase* base = OrtGetApiBase();
  if (!base) return nullptr;
  return base->GetApi(ORT_API_VERSION);
}

PiperOrtSession* createSession(const char* model_path) {
  const OrtApi* api = getApi();
  if (!api) return nullptr;

  auto* s = new PiperOrtSession();
  s->api = api;

  OrtStatus* status;
  status = api->CreateEnv(ORT_LOGGING_LEVEL_WARNING, "piper", &s->env);
  if (status) {
    api->ReleaseStatus(status);
    delete s;
    return nullptr;
  }
  api->DisableTelemetryEvents(s->env);

  status = api->CreateSessionOptions(&s->session_options);
  if (status) {
    api->ReleaseStatus(status);
    api->ReleaseEnv(s->env);
    delete s;
    return nullptr;
  }
  api->SetSessionGraphOptimizationLevel(s->session_options, ORT_DISABLE_ALL);
  api->DisableCpuMemArena(s->session_options);
  api->DisableMemPattern(s->session_options);
  api->DisableProfiling(s->session_options);

#ifdef _WIN32
  std::wstring wpath(model_path, model_path + strlen(model_path));
  status = api->CreateSession(s->env, wpath.c_str(), s->session_options, &s->session);
#else
  status = api->CreateSession(s->env, model_path, s->session_options, &s->session);
#endif
  if (status) {
    api->ReleaseStatus(status);
    api->ReleaseSessionOptions(s->session_options);
    api->ReleaseEnv(s->env);
    delete s;
    return nullptr;
  }
  return s;
}

void destroySession(PiperOrtSession* session) {
  if (!session) return;
  const OrtApi* api = session->api;
  if (session->session) api->ReleaseSession(session->session);
  if (session->session_options) api->ReleaseSessionOptions(session->session_options);
  if (session->env) api->ReleaseEnv(session->env);
  delete session;
}

static void releaseOrtValues(const OrtApi* api,
                             OrtMemoryInfo* memory_info,
                             OrtValue* input_value,
                             OrtValue* input_lengths_value,
                             OrtValue* scales_value,
                             OrtValue* sid_value,
                             OrtValue* output_value) {
  if (memory_info) api->ReleaseMemoryInfo(memory_info);
  if (input_value) api->ReleaseValue(input_value);
  if (input_lengths_value) api->ReleaseValue(input_lengths_value);
  if (scales_value) api->ReleaseValue(scales_value);
  if (sid_value) api->ReleaseValue(sid_value);
  if (output_value) api->ReleaseValue(output_value);
}

std::vector<float> runInference(
    PiperOrtSession* session,
    const std::vector<int64_t>& phoneme_ids,
    float noise_scale,
    float length_scale,
    float noise_w,
    int64_t speaker_id) {
  std::vector<float> out;
  if (!session || !session->api || !session->session) return out;
  const OrtApi* api = session->api;

  OrtMemoryInfo* memory_info = nullptr;
  OrtValue* input_value = nullptr;
  OrtValue* input_lengths_value = nullptr;
  OrtValue* scales_value = nullptr;
  OrtValue* sid_value = nullptr;
  OrtValue* output_value = nullptr;

  OrtStatus* status = api->CreateCpuMemoryInfo(OrtArenaAllocator, OrtMemTypeDefault, &memory_info);
  if (status) {
    api->ReleaseStatus(status);
    return out;
  }

  int64_t input_len = static_cast<int64_t>(phoneme_ids.size());
  std::vector<int64_t> phoneme_id_lengths = {input_len};
  std::vector<float> scales = {noise_scale, length_scale, noise_w};
  std::vector<int64_t> sid_vec = {speaker_id};
  std::vector<int64_t> shape_1_n = {1, input_len};
  std::vector<int64_t> shape_1 = {1};
  std::vector<int64_t> shape_3 = {3};

  status = api->CreateTensorWithDataAsOrtValue(
      memory_info,
      const_cast<int64_t*>(phoneme_ids.data()),
      phoneme_ids.size() * sizeof(int64_t),
      shape_1_n.data(),
      shape_1_n.size(),
      ONNX_TENSOR_ELEMENT_DATA_TYPE_INT64,
      &input_value);
  if (status) {
    api->ReleaseStatus(status);
    releaseOrtValues(api, memory_info, input_value, input_lengths_value, scales_value, sid_value, output_value);
    return out;
  }

  status = api->CreateTensorWithDataAsOrtValue(
      memory_info, phoneme_id_lengths.data(), phoneme_id_lengths.size() * sizeof(int64_t),
      shape_1.data(), shape_1.size(), ONNX_TENSOR_ELEMENT_DATA_TYPE_INT64, &input_lengths_value);
  if (status) {
    api->ReleaseStatus(status);
    releaseOrtValues(api, memory_info, input_value, input_lengths_value, scales_value, sid_value, output_value);
    return out;
  }

  status = api->CreateTensorWithDataAsOrtValue(
      memory_info, scales.data(), scales.size() * sizeof(float),
      shape_3.data(), shape_3.size(), ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT, &scales_value);
  if (status) {
    api->ReleaseStatus(status);
    releaseOrtValues(api, memory_info, input_value, input_lengths_value, scales_value, sid_value, output_value);
    return out;
  }

  status = api->CreateTensorWithDataAsOrtValue(
      memory_info, sid_vec.data(), sid_vec.size() * sizeof(int64_t),
      shape_1.data(), shape_1.size(), ONNX_TENSOR_ELEMENT_DATA_TYPE_INT64, &sid_value);
  if (status) {
    api->ReleaseStatus(status);
    releaseOrtValues(api, memory_info, input_value, input_lengths_value, scales_value, sid_value, output_value);
    return out;
  }

  const char* output_names[] = {"output"};
  const size_t num_outputs_requested = 1;
  OrtValue* outputs[] = {nullptr};

  // Introspect session I/O once; detect if model has "sid" input so we only pass 3 or 4 inputs accordingly.
  static OrtSession* s_last_logged_session = nullptr;
  static bool s_session_has_sid = false;
  if (session->session != s_last_logged_session) {
    s_session_has_sid = logSessionIONamesAndDetectSid(api, session->session);
    s_last_logged_session = session->session;
  }
  const bool use_sid = s_session_has_sid;
  const size_t num_inputs = use_sid ? 4 : 3;

  const char* input_names_4[] = {"input", "input_lengths", "scales", "sid"};
  const OrtValue* inputs_4[] = {input_value, input_lengths_value, scales_value, sid_value};
  const char* input_names_3[] = {"input", "input_lengths", "scales"};
  const OrtValue* inputs_3[] = {input_value, input_lengths_value, scales_value};
  const char* const* input_names = use_sid ? input_names_4 : input_names_3;
  const OrtValue* const* input_values = use_sid ? inputs_4 : inputs_3;

  PIPER_ORT_LOG("Input names we use: \"input\", \"input_lengths\", \"scales\"%s (count=%zu)", use_sid ? ", \"sid\"" : "", num_inputs);
  PIPER_ORT_LOG("Output name we use: \"%s\" (requested %zu output(s))", output_names[0], num_outputs_requested);

  status = api->Run(session->session, nullptr, input_names, input_values, num_inputs, output_names, num_outputs_requested, outputs);

  // (A) Log ORT Run() failure message
  if (status) {
    PIPER_ORT_LOG("Run() failed:");
    logOrtStatus(api, status);
    releaseOrtValues(api, memory_info, input_value, input_lengths_value, scales_value, sid_value, output_value);
    return out;
  }

  // (B) Log output count and which output is null
  PIPER_ORT_LOG("Run() OK. Outputs requested: %zu", num_outputs_requested);
  for (size_t i = 0; i < num_outputs_requested; i++) {
    PIPER_ORT_LOG("  outputs[%zu] = %s", i, outputs[i] ? "non-null" : "NULL");
  }

  output_value = outputs[0];
  if (!output_value) {
    releaseOrtValues(api, memory_info, input_value, input_lengths_value, scales_value, sid_value, output_value);
    return out;
  }

  // Use GetTensorTypeAndShape then read data with GetTensorData
  OrtTensorTypeAndShapeInfo* tensor_info = nullptr;
  status = api->GetTensorTypeAndShape(output_value, &tensor_info);
  if (status) {
    logOrtStatus(api, status);
    releaseOrtValues(api, memory_info, input_value, input_lengths_value, scales_value, sid_value, output_value);
    return out;
  }

  size_t num_dims = 0;
  status = api->GetDimensionsCount(tensor_info, &num_dims);
  if (status) {
    api->ReleaseStatus(status);
    api->ReleaseTensorTypeAndShapeInfo(tensor_info);
    releaseOrtValues(api, memory_info, input_value, input_lengths_value, scales_value, sid_value, output_value);
    return out;
  }

  std::vector<int64_t> dims(num_dims);
  status = api->GetDimensions(tensor_info, dims.data(), num_dims);
  if (status) {
    api->ReleaseStatus(status);
    api->ReleaseTensorTypeAndShapeInfo(tensor_info);
    releaseOrtValues(api, memory_info, input_value, input_lengths_value, scales_value, sid_value, output_value);
    return out;
  }

  // (C) Log output tensor element type, rank, dimensions, total elements
  int64_t total = 1;
  for (size_t i = 0; i < num_dims; i++) total *= dims[i];
  ONNXTensorElementDataType elem_type = ONNX_TENSOR_ELEMENT_DATA_TYPE_UNDEFINED;
  if (api->GetTensorElementType(tensor_info, &elem_type) == nullptr) {
    std::string dims_str;
    for (size_t i = 0; i < num_dims; i++) {
      if (i) dims_str += ',';
      char b[24];
      std::snprintf(b, sizeof(b), "%lld", (long long)dims[i]);
      dims_str += b;
    }
    PIPER_ORT_LOG("Output tensor: type=%s rank=%zu dims=[%s] total=%lld",
                  elementTypeStr(elem_type), num_dims, dims_str.c_str(), (long long)total);
  }
  api->ReleaseTensorTypeAndShapeInfo(tensor_info);

  if (total <= 0) {
    PIPER_ORT_LOG("Output tensor total elements <= 0, returning no audio");
    releaseOrtValues(api, memory_info, input_value, input_lengths_value, scales_value, sid_value, output_value);
    return out;
  }

  const float* data = nullptr;
  status = api->GetTensorData(output_value, reinterpret_cast<const void**>(&data));
  if (status || !data) {
    if (status) {
      PIPER_ORT_LOG("GetTensorData failed:");
      logOrtStatus(api, status);
    } else {
      PIPER_ORT_LOG("GetTensorData returned null pointer");
    }
    releaseOrtValues(api, memory_info, input_value, input_lengths_value, scales_value, sid_value, output_value);
    return out;
  }

  // (D) Log first few float samples (if any)
  if (total > 0) {
    size_t n = total < 8 ? total : 8;
    PIPER_ORT_LOG("First %zu sample(s):", n);
    for (size_t i = 0; i < n; i++) {
      std::fprintf(stderr, "  [%zu]=%.6g", i, (double)data[i]);
    }
    std::fprintf(stderr, "\n");
  }

  out.assign(data, data + total);
  releaseOrtValues(api, memory_info, input_value, input_lengths_value, scales_value, sid_value, output_value);
  return out;
}

}  // namespace piper_ort
