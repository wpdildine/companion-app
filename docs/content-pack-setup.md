# Content pack setup

Where to put the content pack and how it gets built into the app.

## Where to put the pack

1. **Build the pack** in the mtg_rules repo:
   ```bash
   ./run.sh pack --from-flat --out ./content_pack
   ```

2. **Copy into the app** so it gets built in:
   - Open **`assets/content_pack/`** in this repo.
   - Drag and drop (or copy) **the contents** of your `content_pack` folder:
     - `manifest.json`
     - `rules/` (folder)
     - `cards/` (folder)

   You should end up with:

   ```
   companion-app/
   assets/
     content_pack/
       README.md
       manifest.json
       rules/
         chunks.jsonl
         row_map.jsonl
         vectors.f16
         hnsw.index
         index_meta.json
         rule_ids.json
       cards/
         chunks.jsonl
         row_map.jsonl
         vectors.f16
         hnsw.index
         index_meta.json
         name_lookup.jsonl
   ```

## How it gets built in

- **Android**: The Gradle build includes `assets/content_pack` in the app’s asset directory, so everything in that folder is packaged into the APK. No extra steps.

- **iOS**: You need to add the pack to the app bundle once:
  1. In Xcode, open the CompanionApp project.
  2. Right‑click the app target (CompanionApp) in the Project Navigator → **Add Files to "CompanionApp"…**
  3. Select the **`assets/content_pack`** folder (the one that contains `manifest.json`, `rules/`, `cards/`).
  4. Leave **Copy items if needed** unchecked if the folder is already inside the repo (so Xcode references it).
  5. Check **Add to targets: CompanionApp**.
  6. Click **Add**.

  After that, the pack is part of the target and will be in the app bundle on each build.

## Using the pack at runtime

The RAG layer expects `init({ embedModelId, embedModelPath, chatModelPath, packRoot }, reader)` with a **PackFileReader** that reads paths relative to the pack root.

- On **Android**, bundled assets are inside the APK; paths are typically like `content_pack/manifest.json` and are read via the AssetManager. You need a reader (e.g. a small native module or code that copies assets to app files and reads from there) that implements **PackFileReader** and passes it to **init()**.
- On **iOS**, the pack is in the app bundle; you need a reader that uses `NSBundle` (or similar) to resolve paths like `content_pack/manifest.json` and read file contents, then pass that reader to **init()**.

Until that reader is implemented and wired in `App.tsx` (with real `embedModelPath`, `chatModelPath`, and `packRoot`), Submit will show “Pack not configured” and the pack will not be used.
