#ifndef PIPER_ENGINE_H
#define PIPER_ENGINE_H

#include <cstdint>
#include <string>
#include <vector>

namespace piper {

// Stub for Phase 1; real implementation in Phase 3/4.
// Returns PCM int16 and sample rate. Caller owns the vector.
bool synthesize(const std::string& model_path,
                const std::string& config_path,
                const std::string& text,
                std::vector<int16_t>& pcm_out,
                int& sample_rate_out);

}  // namespace piper

#endif  // PIPER_ENGINE_H
