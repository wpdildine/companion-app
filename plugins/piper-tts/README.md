# piper-tts

Offline Piper TTS plugin for React Native (iOS + Android). Regeneration-safe local plugin.

## Setup

1. **Install**: The app depends on `"piper-tts": "file:./plugins/piper-tts"`. Run `pnpm install` (or yarn).
2. **pnpm**: pnpm links `file:` deps differently (copy/store), so the app **must** point the React Native CLI at the plugin source. In the **app root**, ensure `react-native.config.js` exists with:
   ```js
   dependencies: { 'piper-tts': { root: path.join(__dirname, 'plugins/piper-tts') } }
   ```
   Then `npx react-native config` will list piper-tts and `pod install` / Android will use `plugins/piper-tts` for native code and assets.
3. **iOS**: From repo root, run `cd ios && pod install`.
4. **Voice model**: Run `./scripts/download-piper-voice.sh` (or `pnpm run download-piper`) from repo root. Without this, `isModelAvailable()` is false and playback falls back to system TTS.
5. **iOS phonemization (espeak-ng)**: The plugin uses a C++ pipeline (Piper + espeak-ng) for synthesis. To enable phonemization on iOS:
   - **espeak-ng-data**: Run `./scripts/download-espeak-ng-data.sh` so the plugin bundle includes espeak-ng data.
   - The app project already references the [espeak-ng-spm](https://github.com/espeak-ng/espeak-ng-spm) Swift package and links `libespeak-ng`. To enable the C++ espeak path, run `PIPER_USE_ESPEAK=1 pod install` so the PiperTts pod is built with `PIPER_ENGINE_USE_ESPEAK=1`. Without this, `speak()` will reject with a synthesis error.

## API

- `PiperTts.speak(text: string): Promise<void>` — Synthesize and play offline. Resolves when playback finishes.
- `PiperTts.isModelAvailable(): Promise<boolean>` — True if the bundled model is present.

## Implementation status

- **Route A (iOS)**: Native layer resolves paths (model, config, espeak-ng-data), calls C++ `piper::synthesize()` (espeak-ng phonemize → phoneme_id_map → ONNX C API → int16 PCM), and plays PCM via AVAudioEngine. Single ORT (onnxruntime-c). No Obj-C ONNX or character phoneme mapping. espeak-ng enabled when `PIPER_USE_ESPEAK=1` and app links libespeak-ng (espeak-ng-spm).
- **Route A (Android)**: Thin Kotlin module: path resolution (model/config from assets→filesDir, espeak-ng-data from assets→filesDir once), JNI `nativeSynthesize(modelPath, configPath, espeakPath, text)` → PCM + sample rate, play via AudioTrack. ORT from onnxruntime-android AAR (unpacked for CMake); Piper C++ shared with iOS (`ios/cpp`). Single ORT per plan. No Kotlin ORT/phoneme code. **Note:** `PIPER_ENGINE_USE_ESPEAK` is not defined on Android yet, so native `synthesize()` returns false until espeak-ng is built for Android; app will get a clear synthesis error until then.

## Layout

- `src/index.ts` — JS API.
- `ios/` — Obj-C++ bridge, C++ engine stubs, podspec at repo root `PiperTts.podspec`.
- `android/` — Kotlin module, assets under `src/main/assets/piper/`.
- Model files: `android/.../assets/piper/model.onnx`, `model.onnx.json`; iOS `ios/Resources/piper/` (via resource_bundles).
