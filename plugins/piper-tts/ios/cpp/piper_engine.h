#ifndef PIPER_ENGINE_H
#define PIPER_ENGINE_H

#include <cstdint>
#include <string>
#include <vector>

namespace piper {

// True if this build has espeak-ng phonemization (PIPER_ENGINE_USE_ESPEAK=1 at compile time).
bool hasEspeak();

// Synthesis failure reason (when synthesize returns false). Pass optional out_error to get the code.
enum class SynthesizeError {
  kNone = 0,
  kInvalidArgs,
  kConfigOpenFailed,
  kConfigParseFailed,
  kEspeakNotLinked,
  kEspeakInitFailed,
  kEspeakSetVoiceFailed,
  kPhonemeIdsEmpty,
  kOrtCreateSessionFailed,
  kOrtRunInferenceFailed,
};

// Full pipeline: espeak-ng phonemize -> phoneme_id_map -> ONNX (C API) -> int16 PCM.
// Pass espeak_data_path (directory containing espeak-ng data). Voice/session cached per (model_path, config_path).
// Returns true on success; pcm_out and sample_rate_out set. On false, optional out_error gives the reason.
bool synthesize(const std::string& model_path,
                const std::string& config_path,
                const std::string& espeak_data_path,
                const std::string& text,
                std::vector<int16_t>& pcm_out,
                int& sample_rate_out,
                SynthesizeError* out_error = nullptr);

}  // namespace piper

#endif  // PIPER_ENGINE_H
