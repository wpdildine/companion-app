# companion-app

MTG Rules Companion and Timer App — React Native (New Architecture), with [llama.rn](https://github.com/mybigday/llama.rn) for on-device LLM. Voice input, offline TTS (Piper), and a **deterministic context provider** for grounded MTG rules/cards answers — no vector retrieval in-app.

This is a [**React Native**](https://reactnative.dev) project, bootstrapped using [`@react-native-community/cli`](https://github.com/react-native-community/cli).

**New Architecture** (Fabric + TurboModules) is enabled by default (see `android/gradle.properties` → `newArchEnabled=true`). React Native 0.84 uses the new architecture on both Android and iOS.

---

## How the app works

- **Voice:** Speech-to-text via `@react-native-voice/voice` (lazy-loaded). You speak; the app turns it into text and sends it to the RAG pipeline.
- **TTS:** Piper (offline) as the main voice; fallback to `react-native-tts` when the Piper model isn’t installed.
- **RAG / “Ask” path:** The app does **not** run embeddings or vector search on-device. It uses a **deterministic context provider** that:
  1. Normalizes the query and resolves card entities using the pack’s `name_lookup` / rules.
  2. Uses **router_map.json** and **context_provider_spec.json** (from the content pack) to pick rule sections and snippets.
  3. Reads **rules.db** and **cards.db** (SQLite) from the pack and assembles a small context bundle (≤ ~800 tokens by the same budget rule as Python).
  4. Passes that bundle to the on-device LLM (llama.rn) to format or summarize the answer.
  5. Runs **validate → nudge** (same contract as mtg_rules): card names and rule refs are checked against the pack; invalid mentions are stripped/redacted so answers stay grounded.

Context provider logic is shared with **mtg_rules**: the app consumes **@mtg/runtime** (TypeScript port of the Python context provider). When the runtime doesn’t supply a native `getContext` (e.g. on React Native), the app uses **getContextRN** in `src/rag/getContextRN.ts`, which uses `@mtg/runtime`’s portable exports (normalize, route, tokenEst, etc.) plus **react-native-quick-sqlite** to read the pack’s DBs. All constants and thresholds come from **context_provider_spec.json** in the pack — no hardcoded duplicates.

---

## Connection to mtg_rules

This app is the **mobile consumer** of the **mtg_rules** (Rules Service) pipeline. mtg_rules:

- Parses the Comprehensive Rules and Scryfall card data into structured JSON and SQLite.
- Builds the **content pack**: router_map, rules.db, cards.db, context_provider_spec.json, validate sidecars (rule_ids.json, name_lookup.jsonl), and optionally GGUF models.
- Exports a **deterministic context provider** (Python) and a **TypeScript port** in **runtime-ts/** that the app uses.

**How they connect:**

| Piece | In mtg_rules | In companion-app |
|-------|----------------|-------------------|
| **Content pack** | `./run.sh pack` → `content_pack/` | Synced into `assets/content_pack/` via `pnpm run sync-pack-small` (or sync-pack-full for a one-off full pack with models). Build uses a **real directory** (no symlink). |
| **Context provider** | Python: `service/context_provider.py`; TS: `runtime-ts/` (same algorithm, spec-driven) | App imports `@mtg/runtime`; uses `getContext` from runtime or **getContextRN** when runtime doesn’t provide it. Reads pack from device (e.g. Documents/content_pack) or bundle. |
| **Spec / constants** | Exported in pack as `context_provider_spec.json` | Loaded by runtime / getContextRN; no hardcoded scoring or thresholds in app code. |
| **Validation (nudge)** | `validate_response.py`; same contract in pack’s validate sidecars | App calls `nudgeResponse()` with pack state and reader; uses same rule_ids + name_lookup from pack. |
| **Parity & fixtures** | Python exports reference traces to `runtime-ts/fixtures/`; TS runs `yarn test:parity` in runtime-ts | App does not run parity tests; it just consumes the runtime and pack. |

**Scripts and linking:**

- **Sync pack (small, no models):** `pnpm run sync-pack-small` — copies from `mtg_rules/content_pack` into `assets/content_pack`, excludes `models/`, writes `pack_identity.json`. Use before every build / CI.
- **Sync pack (full, with models):** `pnpm run sync-pack-full` — same but includes `models/` for one-off device install; then switch back to sync-pack-small for normal builds.
- **Link mtg_rules for dev:** `node scripts/link-mtg-rules.js link [path-to-mtg_rules]` — can symlink `assets/content_pack` to mtg_rules and link **@mtg/runtime** to `mtg_rules/runtime-ts`. For release, always run `sync-pack-small` so the bundle is a real directory.
- **@mtg/runtime** is wired as a dependency: `"@mtg/runtime": "file:../mtg_rules/runtime-ts"` (or tarball). The app uses the React Native entrypoint; the Node entrypoint is for parity tests only.

See **[docs/content-pack-setup.md](docs/content-pack-setup.md)** for pack layout, build contract, and model path resolution. The plan **[TS parallel runtime and context provider](.cursor/plans/ts_parallel_runtime_and_context_provider_0bc942e0.plan.md)** (in Cursor plans) describes the spec surface, reference traces, and parity strategy between Python and TS.

---

# Getting Started

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Content pack (from mtg_rules)

The app needs a content pack in `assets/content_pack/` (manifest, router, rules.db, cards.db, context_provider_spec, validate sidecars). Either:

- **Sync from mtg_rules:**  
  In mtg_rules run `./run.sh pack --from-flat --out ./content_pack`. Then in companion-app:  
  `pnpm run sync-pack-small`  
  (or `sync-pack-full` if you want to ship the pack with models once; see docs/content-pack-setup.md.)

- **Dev link:**  
  `node scripts/link-mtg-rules.js link` to symlink `assets/content_pack` to your mtg_rules repo. Before any build that must work without the symlink, run `pnpm run sync-pack-small`.

## Step 2: Start Metro

From the project root:

```sh
pnpm start
```

## Step 3: Build and run

With Metro running, in another terminal:

### Android

```sh
pnpm android
```

### iOS

Install CocoaPods (first time only): `bundle install`. Then run:

```sh
pnpm ios
```

`pnpm ios` runs **pod install** with **PIPER_USE_ESPEAK=1** (so Piper TTS uses espeak-ng phonemization), then builds and runs the app. To only update pods without building, run `pnpm run pod-install`.

If everything is set up correctly, the app runs in the Android Emulator, iOS Simulator, or on a connected device.

## Step 4: Modify your app

Edit `App.tsx` (or any source); [Fast Refresh](https://reactnative.dev/docs/fast-refresh) will update the app. To force a full reload:

- **Android:** Double-tap <kbd>R</kbd> or Dev Menu (<kbd>Ctrl</kbd>+<kbd>M</kbd> / <kbd>Cmd</kbd>+<kbd>M</kbd>) → Reload.
- **iOS:** <kbd>R</kbd> in the simulator.

---

# Troubleshooting

- **React Native / Metro / build issues:** See the [React Native Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.
- **Pack / RAG:** Ensure `assets/content_pack/` is a real directory with `manifest.json`, `router/router_map.json`, `rules/rules.db`, `cards/cards.db`, and `context_provider_spec.json`. If you linked with `link-mtg-rules`, run `pnpm run sync-pack-small` before building. See [docs/content-pack-setup.md](docs/content-pack-setup.md).
- **“Deterministic context provider not available”:** Pack not loaded or packRoot not set; ensure init ran with a reader that can read the pack (e.g. after copying bundle pack to Documents). Check that the pack has the `context_provider` capability and required files.

---

# Learn more

- [React Native](https://reactnative.dev) — docs and getting started.
- **mtg_rules** repository (sibling or `MTG_RULES_PATH`) — rules service pipeline, content pack, context provider, and evaluation; see that repo’s README.
- [docs/content-pack-setup.md](docs/content-pack-setup.md) — how the app gets the pack and where models live.
