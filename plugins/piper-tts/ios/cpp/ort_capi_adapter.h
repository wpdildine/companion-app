#ifndef ORT_CAPI_ADAPTER_H
#define ORT_CAPI_ADAPTER_H

#include <cstdint>
#include <string>
#include <vector>

namespace piper_ort {

// Opaque session (holds OrtEnv*, OrtSession*, etc.)
struct PiperOrtSession;

// Load ONNX model from path. Returns nullptr on failure.
// Caller must call destroySession when done.
PiperOrtSession* createSession(const char* model_path);

void destroySession(PiperOrtSession* session);

// Run Piper VITS inference: phoneme_ids [1, N], scales [noise_scale, length_scale, noise_w], speaker_id.
// Returns float audio samples (mono). Returns empty vector on failure.
std::vector<float> runInference(
    PiperOrtSession* session,
    const std::vector<int64_t>& phoneme_ids,
    float noise_scale,
    float length_scale,
    float noise_w,
    int64_t speaker_id);

}  // namespace piper_ort

#endif  // ORT_CAPI_ADAPTER_H
