#include "piper_engine.h"

namespace piper {

bool synthesize(const std::string& model_path,
                const std::string& config_path,
                const std::string& text,
                std::vector<int16_t>& pcm_out,
                int& sample_rate_out) {
  (void)model_path;
  (void)config_path;
  (void)text;
  pcm_out.clear();
  sample_rate_out = 22050;
  // Phase 1: stub — no inference yet
  return true;
}

}  // namespace piper
