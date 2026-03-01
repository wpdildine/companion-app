# Content pack setup

Where to put the content pack and how it gets built into the app.

**Contract:** Always materialize `assets/content_pack/` as a **real directory** (no symlink semantics in the build). Use the sync script so the pack is stripped (no `models/`) and includes a pack identity stamp. Gradle and Xcode operate on real files; CI and teammates stay predictable.

## 1. Build the pack (mtg_rules)

In the mtg_rules repo:

```bash
./run.sh pack --from-flat --out ./content_pack
```

(Optionally include LLM/embed with `--include-llm` etc.; the app sync step will exclude `models/` when copying into the app.)

## 2. Option A – Sync small pack (default / CI)

From the companion-app repo, run the sync script so `assets/content_pack/` is a **real directory** containing the stripped pack (no `models/`):

```bash
pnpm run sync-pack-small
# Or with a custom mtg_rules path:
node scripts/sync-pack-small.js /path/to/mtg_rules
# Or: MTG_RULES_PATH=/path/to/mtg_rules node scripts/sync-pack-small.js
```

This script:

- Copies from `mtg_rules/content_pack` into `assets/content_pack/`: manifest, router, rules, cards, hashes, context_provider_spec, and any .db files.
- **Always excludes** `models/` (no 1.8GB GGUF in the app bundle).
- Writes **`pack_identity.json`** with runtime-relevant fields only: `pack_version`, `pack_manifest_sha`, `router_map_sha256`, `router_map_sha256_prefix`, `rules_db_hash`, `cards_db_hash`, `context_provider_spec_hash`, `context_provider_spec_schema_version`, `timestamp`. Optionally include `min_provider_version` or a spec compat field in the pack manifest so the app can enforce compatibility. **Do not** add `fixture_schema_version` to pack_identity unless you actually ship fixture traces in packs (fixtures are test harness, not runtime contract). The app logs pack_identity and **app-side provider version** in debug builds.

**Core runtime artifacts** (the small pack must always include these for the app’s ask path):

- `router/router_map.json`
- `rules/rules.db`
- `cards/cards.db`
- `context_provider_spec.json`
- Validate/nudge capability files: `rules/rule_ids.json`, `cards/name_lookup.jsonl` (or equivalent)
- `hashes/` and `pack_identity.json` (written by sync script)

If the source pack still contains chunks/row_map/index_meta or vector artifacts, they are **legacy / optional / tooling-only** — the in-app ask path does not use them; the app uses the deterministic context provider (SQLite + router_map + spec).

You should end up with:

```
companion-app/
assets/
  content_pack/
    manifest.json
    pack_identity.json
    router/
      router_map.json
    rules/
      rules.db, rule_ids.json, ...
    cards/
      cards.db, name_lookup.jsonl, ...
    hashes/
    context_provider_spec.json
```

No `models/` directory. The build never depends on symlinks; you can keep a symlink for local dev convenience (e.g. `pnpm run link-mtg-rules link` points `assets/content_pack` at `mtg_rules/content_pack`), but **before building** (and in CI) run `sync-pack-small` so the bundle uses a real directory. The iOS “Copy content pack” phase **fails** if `assets/content_pack` is a symlink, prompting you to run `sync-pack-small`.

**Build-time guard (no accidental models):** CI must fail if `assets/content_pack/models/**` exists or if the app bundle contains any `.gguf` file when you intend a small-pack build. Run `node scripts/check-pack-no-models.js` before or after the build; optionally run it with the path to the built bundle/artifact so the script greps for `.gguf` and fails if found. When using **Option B** (full pack), skip this gate or run it only after switching back to Option A.

### Option B – Full pack one-off (models on device without rebundling)

To put the full pack including GGUF **on device once** and avoid rebundling the 1.8GB on every build:

1. **In mtg_rules:** Build a full pack that includes models (e.g. `./run.sh pack --from-flat --out ./content_pack` with `--include-llm` or whatever your repo uses to include embed/LLM GGUF). Ensure `content_pack/models/` exists (e.g. `models/embed/embed.gguf`, `models/llm/model.gguf` or the layout your app expects).

2. **In companion-app:** Run the **full** sync so `assets/content_pack/` contains the pack **including** `models/`:

   ```bash
   pnpm run sync-pack-full
   # Or: node scripts/sync-pack-full.js [path-to-mtg_rules]
   # Or: MTG_RULES_PATH=/path node scripts/sync-pack-full.js
   ```

3. **Build once:** Build and install the app (iOS and/or Android). The bundle will contain the full pack (large app size for this one build).

4. **First launch:** The app copies the bundled pack to device storage (Documents/content_pack on iOS, filesDir/content_pack on Android) once. After that it always uses that copy; no re-copy on later launches.

5. **Normal builds again:** When you no longer need the full pack in the bundle, run **`pnpm run sync-pack-small`** to replace `assets/content_pack/` with the stripped pack (no models). Subsequent builds are small again. The device still has the full pack from step 4; the app does not rebundle it.

**Note:** While the full pack is in `assets/content_pack/`, `check-pack-no-models` (and `validate-e2e-gates`) will fail. Run `sync-pack-small` before CI or release if you enforce that gate.

## 3. How it gets built in

- **Android**: Gradle includes `assets/content_pack` in the app’s asset directory. Everything in that folder (the synced, stripped pack) is packaged into the APK.

- **iOS**: The “Copy content pack” build phase copies `assets/content_pack` into the app bundle. It **fails if `assets/content_pack` is a symlink** (to avoid bundling the full pack including `models/`). Run `sync-pack-small` so `assets/content_pack` is a real directory before building.

## 4. Model (GGUF) on device and model identity

The symlinked pack and **sync-pack-small** output do **not** include a `models/` directory (no GGUF in the repo or in the app bundle). The app still needs embed + LLM GGUF files to run. It resolves them in this order:

1. **Bundle pack** — `content_pack/models/embed/embed.gguf` and `content_pack/models/llm/model.gguf` (only present if you ship a full pack with models/ in the bundle).
2. **Documents/models** — fallback when the pack has no models: copy the GGUF files **once** into the app’s Documents/models directory (path from `getAppModelsPath()`). Use these exact filenames so the app finds them: **`nomic-embed-text.gguf`** (embed) and **`llama3.2-3b-Q4_K_M.gguf`** (chat/LLM).

So when using the symlink or sync-pack-small (no `models/`), you must provide the GGUF files via Documents/models with the names above, or the app will have no model paths and ask/playback will fail.

To avoid Empty Response or mysterious failures from wrong model, old quantization, wrong context window, or corrupted file, use **model identity validation**: store **`model_identity.json`** next to the GGUF with `sha256_prefix`, `model_family`, `expected_context_window`, `quantization`, `file_size`, `build_timestamp`. At app boot, verify file exists and size + hash prefix match; if mismatch, prompt the user to recopy. **Lock down compatibility:** If `expected_context_window` in model_identity.json is smaller than the provider's context budget assumptions (e.g. the budget in context_provider_spec), **fail at boot** — otherwise a 1024-context model with a 2048-budget assumption leads to subtle truncation and broken behavior. Optionally use a model cache key in app storage to swap models without full reinstall.

## 5. App Ask Flow (primary path)

The app’s ask path uses the **deterministic context provider** to assemble a grounded context bundle from the pack’s SQLite rules/cards DBs, `router_map.json`, and `context_provider_spec.json`. The LLM is used only to format/summarize within that provided context — **no vector retrieval in-app**. Embeddings/vectors, if present in the pack or tooling, are optional/offline-only (e.g. for build-time or lab use), not part of the default app path.

## 6. Runtime-ts vs in-app runtime

The app **calls the runtime provider** (**getContext**) from **`@mtg/runtime`** during normal operation. The provider runs on-device, reads the synced pack (router_map/spec + rules.db + cards.db), and returns the final context bundle; **the app does not own provider/db—the runtime does**. The **RN entrypoint** of the package (default/`react-native` export) exports the provider and is what the app imports. The **Node entrypoint** **`@mtg/runtime/node`** is for parity tests and Node tooling only; the app must never import it (ESLint enforces this). Link the runtime via `pnpm run link-mtg-rules link --deps` when the app imports the provider (so it stays in **dependencies** for Metro); use `link` without `--deps` when only scripts/tests use the Node entry.

The runtime package (mtg_rules/runtime-ts) provides **one codebase, two entrypoints**: the same algorithm with an RN adapter (react-native-quick-sqlite, RN file reads) and a Node adapter (fs, better-sqlite3). The app uses the **RN adapter** via `@mtg/runtime`; parity/tools use the **Node adapter** via `@mtg/runtime/node`. Backend mode is not part of this strategy; if backend is ever allowed, treat it as a separate section. **Core logic location:** The deterministic algorithm (normalization, routing, scoring, ordering, bundle assembly) must be implemented once and shared between Node and RN where possible; adapters differ only in I/O (SQLite + file access). This prevents re-implementing logic twice. The RN provider must **consume the same context_provider_spec.json exported by mtg_rules**; no scoring/threshold constants may be hardcoded in app code (this prevents silent divergence from the reference). The RN provider must emit the same **reference trace fields** as Python/Node (at least under a debug flag) for parity debugging: `normalized_query`, `detected_entities`, `router_hit`, `selected_rule_chunks` (ids + reasons + order), `final_context_bundle_canonical`, `context_token_est`. The Node runtime remains the **reference**, **fixture exporter**, and **parity test harness** only. Parity tests and Node tooling **must** import `@mtg/runtime/node` explicitly; the app imports only `@mtg/runtime` (RN entry). Run `pnpm run verify-parity-uses-node` to ensure scripts and tests in this repo use the Node subpath. **Optional:** In debug builds, log context assembly time and SQLite query time; useful when scaling to low-end Android devices.

**RN SQLite constraints:** Use a single DB connection; cache prepared statements; avoid N+1 (no per-rule queries inside loops — use `IN (...)` or precomputed tables). Open DB **read-only** where possible; disable WAL if it causes write attempts.

**Pack DB copy semantics on mobile:** Never open SQLite DBs directly from assets/bundle (Android assets vs iOS bundle differ; DBs must be writable or copy-on-write). On first run (or when pack updates), copy pack files from bundle to app Documents. **Rule:** On boot, compute/compare **pack_identity.json** hashes and ensure the DBs already copied to Documents match those hashes. **If mismatch** (new pack or corrupted copy): recopy using a **temp file + atomic rename** so the app never sees a partially copied DB. **Always delete any existing DB file before performing the atomic rename** (avoids Android open-handle issues, WAL leftovers, and partial-rename collisions). This prevents "DB locked / corrupt / old DB still used after pack update." Detect "already copied" by storing the last applied pack_identity hash (or rules_db_hash + cards_db_hash) in app storage and comparing to the bundled pack_identity.

**Version handshake (pack + provider):** Define a compat contract: **context_provider_spec_schema_version** in the pack must be supported by the provider. **Pack structure changes must increment context_provider_spec_schema_version** (forcing function for evolution). Optionally put **min_provider_version** or a spec_version in the pack manifest or stamp. **Debug builds:** Hard-fail if the spec schema version is unsupported. **Release builds:** Show a user-facing error ("Pack incompatible with app version") instead of silent misbehavior. Do not require fixture_schema_version for runtime unless you ship fixtures. **Provider context budget:** The provider context budget is defined in **context_provider_spec.json** and must not be duplicated in app config (prevents split-budget bugs).

**Prompt/profile versioning:** Pin LLM behavior so "answers changed" is not blamed on retrieval when it is prompt drift. Store **prompt_profile_id** and **prompt_template_version** in **app config only** (not in pack_identity). The pack is deterministic data; prompt/profile is LLM presentation logic — keeping them separate avoids coupling retrieval and formatting. Log prompt profile and template version in debug. Align with mtg_rules prompt profiles (e.g. mobile, default) and stop token set, max output tokens.

## 6.1. Validation and CI gates

Before testing the app or cutting a release, run the integration gates:

```bash
pnpm run validate-e2e-gates
```

This runs: **verify-parity-uses-node** (scripts/tests must use `@mtg/runtime/node`), **check-pack-no-models** (no models/ or .gguf in pack), and **check-bundle-no-node** (if a built RN bundle exists, it must not contain Node-only modules). For the bundle check to run, build the bundle first (e.g. `react-native bundle` for iOS/Android). Node parity tests (in mtg_rules) must be run separately and must import `@mtg/runtime/node`.

## 7. Getting the pack onto the device

**Yes, the pack can be on the device.** The app does one of two things:

1. **Copy from bundle (default):** On first ask, if there is no pack in app storage, it calls `copyBundlePackToDocuments()`. The native layer copies from the app’s assets (Android: merged at asset root; iOS: `content_pack` in the bundle) to a persistent directory: **Android** `filesDir/content_pack`, **iOS** `Documents/content_pack`. After that, every launch uses this copy (no rebundling).

2. **Already present:** If `manifest.json` already exists in that directory, `getContentPackPathInDocuments()` returns that path and the app uses it; no copy runs.

**Verify pack on device (Android):**

```bash
adb shell "run-as com.companionapp ls -la files/content_pack"
# Expect: manifest.json, router/, rules/, cards/, etc.
adb shell "run-as com.companionapp ls files/content_pack/rules/"
# Expect: rules.db, index_meta.json, ...
adb shell "run-as com.companionapp ls files/content_pack/cards/"
# Expect: cards.db, ...
```

In the app, after the first ask you should see in logcat: `[RAG] Pack root: /data/user/0/com.companionapp/files/content_pack` (or similar). If you see `[RAG] Pack root: (bundle)`, the copy either didn’t run or failed and the app fell back to reading from the bundle (which is fine for files, but the deterministic context path needs a real `packRoot` for SQLite). If copy fails with "Bundle content_pack not found", ensure `assets/content_pack/` exists and contains `manifest.json` before building, then rebuild and reinstall.

## 8. Using the pack at runtime

The app init expects a **PackFileReader** that reads paths relative to the pack root (e.g. `manifest.json`, `pack_identity.json`, `router/router_map.json`, `rules/rules.db`, `cards/cards.db`, `context_provider_spec.json`). The bundle reader resolves these under the pack root. In debug builds, `pack_identity` is logged after pack load so you can confirm which pack version and hashes are in use.
