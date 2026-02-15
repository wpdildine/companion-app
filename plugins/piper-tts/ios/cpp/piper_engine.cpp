#include "piper_engine.h"
#include "ort_capi_adapter.h"
#include "json.hpp"
#include <fstream>
#include <algorithm>
#include <cmath>
#include <cstring>
#include <map>
#include <mutex>
#include <stdexcept>

#ifdef PIPER_ENGINE_USE_ESPEAK
#include <espeak-ng/speak_lib.h>
#endif

namespace piper {

using json = nlohmann::json;

namespace {

const float kMaxWavValue = 32767.0f;

// Cache one session per (model_path). Config/voice state not cached across different paths.
static std::mutex g_session_mutex;
static piper_ort::PiperOrtSession* g_cached_session = nullptr;
static std::string g_cached_model_path;
static std::string g_cached_espeak_path;
#ifdef PIPER_ENGINE_USE_ESPEAK
static bool g_espeak_initialized = false;
#endif

// Advance to next UTF-8 codepoint; return length in bytes (1-4), or 0 at end.
static size_t utf8_codepoint_len(const char* p) {
  unsigned char c = static_cast<unsigned char>(*p);
  if (c == 0) return 0;
  if (c < 0x80) return 1;
  if (c < 0xe0) return 2;
  if (c < 0xf0) return 3;
  if (c < 0xf8) return 4;
  return 1;
}

// Build phoneme string -> list of ids from config["phoneme_id_map"]. Piper expects all ids per phoneme and PAD between phonemes.
static std::map<std::string, std::vector<int64_t>> parse_phoneme_id_map(const json& config) {
  std::map<std::string, std::vector<int64_t>> out;
  if (!config.contains("phoneme_id_map") || !config["phoneme_id_map"].is_object())
    return out;
  for (auto& [key, val] : config["phoneme_id_map"].items()) {
    if (!val.is_array()) continue;
    std::vector<int64_t> ids;
    for (auto& el : val) {
      if (el.is_number_integer())
        ids.push_back(el.get<int64_t>());
    }
    if (!ids.empty()) out[key] = std::move(ids);
  }
  return out;
}

// Convert phoneme string (UTF-8) to sequence of ids: BOS, PAD, (phoneme_ids, PAD)*, EOS. Matches Piper reference (interspersePad=true).
static std::vector<int64_t> phonemes_to_ids(
    const std::string& phonemes,
    const std::map<std::string, std::vector<int64_t>>& id_map,
    int64_t default_id) {
  std::vector<int64_t> ids;
  auto pad_it = id_map.find("_");
  const std::vector<int64_t>* pad_ids = (pad_it != id_map.end()) ? &pad_it->second : nullptr;
  auto bos_it = id_map.find("^");
  if (bos_it != id_map.end()) {
    for (int64_t id : bos_it->second) ids.push_back(id);
    if (pad_ids) for (int64_t id : *pad_ids) ids.push_back(id);
  }

  const char* p = phonemes.c_str();
  while (*p) {
    size_t len = utf8_codepoint_len(p);
    if (len == 0) break;
    std::string key(p, len);
    auto i = id_map.find(key);
    if (i != id_map.end()) {
      for (int64_t id : i->second) ids.push_back(id);
    } else {
      ids.push_back(default_id);
    }
    if (pad_ids) for (int64_t id : *pad_ids) ids.push_back(id);
    p += len;
  }

  auto eos_it = id_map.find("$");
  if (eos_it != id_map.end()) {
    for (int64_t id : eos_it->second) ids.push_back(id);
  }
  return ids;
}

#ifdef PIPER_ENGINE_USE_ESPEAK
// Phonemize text with espeak-ng; append IPA phonemes to out.
// On failure, sets *out_error to kEspeakInitFailed or kEspeakSetVoiceFailed if non-null.
static bool phonemize_espeak(
    const std::string& text,
    const std::string& voice,
    const std::string& data_path,
    std::string& phonemes_out,
    SynthesizeError* out_error) {
  if (!g_espeak_initialized) {
    int r = espeak_Initialize(
        AUDIO_OUTPUT_SYNCHRONOUS,
        0,
        data_path.empty() ? nullptr : data_path.c_str(),
        0);
    if (r < 0) {
      if (out_error) *out_error = SynthesizeError::kEspeakInitFailed;
      return false;
    }
    g_espeak_initialized = true;
    g_cached_espeak_path = data_path;
  }
  if (espeak_SetVoiceByName(voice.c_str()) != 0) {
    if (out_error) *out_error = SynthesizeError::kEspeakSetVoiceFailed;
    return false;
  }

  std::string text_copy(text);
  const char* input = text_copy.c_str();
  phonemes_out.clear();
  while (input && *input) {
    int terminator = 0;
    const char* ip = input;
    const char* phoneme_ptr = espeak_TextToPhonemesWithTerminator(
        (const void**)&ip,
        espeakCHARS_AUTO,
        0x02,  // IPA
        &terminator);
    if (phoneme_ptr)
      phonemes_out += phoneme_ptr;
    input = ip;
  }
  return true;
}
#endif

}  // namespace

bool hasEspeak() {
#ifdef PIPER_ENGINE_USE_ESPEAK
  return true;
#else
  return false;
#endif
}

bool synthesize(const std::string& model_path,
                const std::string& config_path,
                const std::string& espeak_data_path,
                const std::string& text,
                std::vector<int16_t>& pcm_out,
                int& sample_rate_out,
                SynthesizeError* out_error) {
  pcm_out.clear();
  sample_rate_out = 22050;
  auto set_err = [out_error](SynthesizeError e) { if (out_error) *out_error = e; };

  if (model_path.empty() || config_path.empty() || text.empty()) {
    set_err(SynthesizeError::kInvalidArgs);
    return false;
  }

  // Load config
  std::ifstream f(config_path);
  if (!f) {
    set_err(SynthesizeError::kConfigOpenFailed);
    return false;
  }
  json config;
  try {
    config = json::parse(f);
  } catch (...) {
    set_err(SynthesizeError::kConfigParseFailed);
    return false;
  }

  int sample_rate = 22050;
  if (config.contains("audio") && config["audio"].contains("sample_rate"))
    sample_rate = config["audio"]["sample_rate"].get<int>();
  sample_rate_out = sample_rate;

  float noise_scale = 0.667f, length_scale = 1.0f, noise_w = 0.8f;
  if (config.contains("inference")) {
    auto& inf = config["inference"];
    if (inf.contains("noise_scale")) noise_scale = inf["noise_scale"].get<float>();
    if (inf.contains("length_scale")) length_scale = inf["length_scale"].get<float>();
    if (inf.contains("noise_w")) noise_w = inf["noise_w"].get<float>();
  }

  std::string voice = "en-us";
  if (config.contains("espeak") && config["espeak"].contains("voice"))
    voice = config["espeak"]["voice"].get<std::string>();

  auto id_map = parse_phoneme_id_map(config);
  int64_t default_id = 3;
  auto space_it = id_map.find(" ");
  if (space_it != id_map.end() && !space_it->second.empty())
    default_id = space_it->second[0];

  // Phonemize
  std::string phonemes;
#ifdef PIPER_ENGINE_USE_ESPEAK
  if (!phonemize_espeak(text, voice, espeak_data_path, phonemes, out_error))
    return false;
#else
  (void)voice;
  (void)espeak_data_path;
  set_err(SynthesizeError::kEspeakNotLinked);
  return false;  // espeak not linked
#endif

  std::vector<int64_t> phoneme_ids = phonemes_to_ids(phonemes, id_map, default_id);
  if (phoneme_ids.empty()) {
    set_err(SynthesizeError::kPhonemeIdsEmpty);
    return false;
  }

  int64_t speaker_id = 0;
  if (config.contains("num_speakers") && config["num_speakers"].get<int>() > 1)
    speaker_id = 0;  // default speaker

  // Run ONNX (cached session)
  piper_ort::PiperOrtSession* session = nullptr;
  {
    std::lock_guard<std::mutex> lock(g_session_mutex);
    if (g_cached_model_path != model_path) {
      if (g_cached_session) {
        piper_ort::destroySession(g_cached_session);
        g_cached_session = nullptr;
      }
      g_cached_model_path = model_path;
    }
    if (!g_cached_session) {
      g_cached_session = piper_ort::createSession(model_path.c_str());
      if (!g_cached_session) {
        set_err(SynthesizeError::kOrtCreateSessionFailed);
        return false;
      }
    }
    session = g_cached_session;
  }

  std::vector<float> audio_float = piper_ort::runInference(
      session, phoneme_ids, noise_scale, length_scale, noise_w, speaker_id);
  if (audio_float.empty()) {
    set_err(SynthesizeError::kOrtRunInferenceFailed);
    return false;
  }

  // Scale and convert to int16 (same as Piper)
  float max_val = 0.01f;
  for (float v : audio_float) {
    float a = std::fabs(v);
    if (a > max_val) max_val = a;
  }
  float scale = kMaxWavValue / std::max(0.01f, max_val);
  pcm_out.reserve(audio_float.size());
  for (float v : audio_float) {
    float s = v * scale;
    s = std::max(-kMaxWavValue, std::min(kMaxWavValue, s));
    pcm_out.push_back(static_cast<int16_t>(s));
  }
  return true;
}

}  // namespace piper
