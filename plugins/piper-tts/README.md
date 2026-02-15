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

## API

- `PiperTts.speak(text: string): Promise<void>` — Synthesize and play offline. Resolves when playback finishes.
- `PiperTts.isModelAvailable(): Promise<boolean>` — True if the bundled model is present.

## Implementation status

- **Phase 1–2**: Plugin scaffold, autolinking, assets, path plumbing, `isModelAvailable`, `speak` stub.
- **Phase 3**: ONNX Runtime session load on Android and iOS (smoke test).
- **Phase 4**: Full pipeline on both platforms: minimal character-level phonemization, ONNX inference (Piper VITS), PCM playback via AudioTrack (Android) and AVAudioEngine (iOS). Promise resolves when playback ends.
- **Phase 5**: App uses Piper when model is available and falls back to system TTS otherwise.

**Note:** Phonemization is minimal (character-to-phoneme-id from config). For better quality, integrate espeak-style phonemization (e.g. piper-phonemize) in a future iteration.

## Layout

- `src/index.ts` — JS API.
- `ios/` — Obj-C++ bridge, C++ engine stubs, podspec at repo root `PiperTts.podspec`.
- `android/` — Kotlin module, assets under `src/main/assets/piper/`.
- Model files: `android/.../assets/piper/model.onnx`, `model.onnx.json`; iOS `ios/Resources/piper/` (via resource_bundles).
