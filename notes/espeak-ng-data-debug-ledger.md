# espeak-ng-data: Debug Ledger

Use this ledger to determine **why** espeak-ng-data is missing or not found at runtime. Work through each section in order; check off or note results so you can see where the chain breaks.

---

## 1. Files on disk

**Goal:** Confirm the data exists under the plugin before any build.

| Check | Command / action | Expected |
|-------|------------------|----------|
| Data dir exists | `ls -la plugins/piper-tts/ios/Resources/espeak-ng-data` | Directory exists, not empty |
| Download script run | You ran `./scripts/download-espeak-ng-data.sh` | Script completed without error |
| Key subdirs | `ls plugins/piper-tts/ios/Resources/espeak-ng-data` | At least `lang/`, `voices/` (and optionally `phontab` at top level) |

**If this fails:** Run `./scripts/download-espeak-ng-data.sh` and fix any script or network errors. No point continuing until the directory is populated.

---

## 2. Podspec declaration

**Goal:** CocoaPods is told to include these files.

| Check | Where | Expected |
|-------|--------|----------|
| Resources in podspec | `plugins/piper-tts/PiperTts.podspec` | `s.resources` includes `"ios/Resources/espeak-ng-data/**/*"` (or an explicit file list) |
| After podspec change | Run `pod install` in `ios/` | No errors; Pods updated |

**If the glob is used:** Some CocoaPods setups expand `**/*` correctly; others do not. If later steps show files missing from the bundle, try switching to an explicit list (e.g. `*Dir["ios/Resources/espeak-ng-data/**/*"].select { \|f\| File.file?(f) }` in the podspec).

---

## 3. CocoaPods resource copy (input files)

**Goal:** The “[CP] Copy Pods Resources” phase is actually given the espeak-ng-data paths.

| Check | File to open | Expected |
|-------|----------------|----------|
| Debug input list | `ios/Pods/Target Support Files/Pods-CompanionApp/Pods-CompanionApp-resources-Debug-input-files.xcfilelist` | Contains many lines with paths ending in `.../espeak-ng-data/lang/...`, `.../espeak-ng-data/voices/...`, etc. |
| Release (if you build release) | `Pods-CompanionApp-resources-Release-input-files.xcfilelist` | Same idea |

**If this fails:** Podspec resources are not being expanded. Fix the podspec (e.g. explicit `Dir` list) and run `pod install` again.

---

## 4. Copy script behavior

**Goal:** Understand how files are copied into the app bundle.

| Check | File / action | Expected |
|-------|----------------|----------|
| Copy script | `ios/Pods/Target Support Files/Pods-CompanionApp/Pods-CompanionApp-resources.sh` | Script uses `install_resource` (or similar) for each path from the xcfilelist |
| Path style | Inspect the paths in that script or xcfilelist | If paths are **absolute** (e.g. `/Users/.../companion-app/plugins/.../espeak-ng-data/...`), rsync may reproduce that structure under the bundle, so you get `App.app/Users/.../espeak-ng-data/...` instead of `App.app/espeak-ng-data/...` |

**If paths are full:** The native lookup must not assume `espeak-ng-data` is at bundle root; it should search the bundle for a directory named `espeak-ng-data` (or we use a custom script phase to copy into `App.app/espeak-ng-data/`).

---

## 5. Custom “Copy espeak-ng-data” script phase

**Goal:** We added a script phase that copies `ios/Resources/espeak-ng-data` into the app bundle at a known location.

| Check | Where | Expected |
|-------|--------|----------|
| Phase exists | Xcode → Target CompanionApp → Build Phases | “Copy espeak-ng-data” run script present (after “[CP] Copy Pods Resources”) |
| Script copies to bundle root | Script content | Copies to `${BUILT_PRODUCTS_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/espeak-ng-data/` so the app has `App.app/espeak-ng-data/` |
| Build log | Build and check script output | Line like “espeak-ng-data copied to ...” or “warning: espeak-ng-data missing at ...” |

**If phase is missing or wrong:** Add/fix the script phase so that after the build, `App.app/espeak-ng-data/` exists with `lang/`, `voices/`, etc. inside.

---

## 6. Contents of the built app bundle

**Goal:** See exactly what’s inside the .app that gets installed.

| Check | Action | Expected |
|-------|--------|----------|
| Simulator build | Build for simulator, then e.g. `find ~/Library/Developer/Xcode/DerivedData -name "CompanionApp.app" -type d 2>/dev/null \| head -1 \| xargs -I {} find "{}" -name "espeak-ng-data" -type d` | At least one `espeak-ng-data` directory under that .app |
| Device build | Build for device, then inspect `Build/Products/Debug-iphoneos/CompanionApp.app` (or your config path) | Same: `espeak-ng-data` present, with subdirs like `lang/`, `voices/` |
| Direct check | `ls -la "<path-to-CompanionApp.app>/espeak-ng-data"` | Directory exists; contains expected subdirs/files |

**If not found in .app:** Either “[CP] Copy Pods Resources” didn’t run for that target, or the custom “Copy espeak-ng-data” script didn’t run / failed. Re-check build phase order and script logic.

---

## 7. Native lookup at runtime

**Goal:** The app looks in the right place and finds the directory.

| Check | Where | Expected |
|-------|--------|----------|
| Lookup order | `plugins/piper-tts/ios/PiperTtsModule.mm` → `espeakDataPathInBundle:` | Tries (1) `pathForResource:@"phontab"` in `espeak-ng-data`, (2) under `Resources/espeak-ng-data`, (3) `resourcePath + "espeak-ng-data"`, (4) `resourcePath + "ios/Resources/espeak-ng-data"`, (5) enumerate bundle for a dir whose last path component is `espeak-ng-data` |
| Logs | Run app and check logs | On success: “[PiperTts] espeak-ng-data found at …”. On failure: “[PiperTts] espeak-ng-data not found in bundle …” with bundle path |

**If “not found” despite files in .app:** Bundle path on device may differ (e.g. sandbox path). Confirm `[NSBundle mainBundle].resourcePath` / `bundlePath` and that the enumerator or direct path checks can reach the same directory you see in the built .app.

---

## 8. Quick reference: fix summary

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| Dir empty or missing on disk | Download not run or failed | Run `./scripts/download-espeak-ng-data.sh` |
| xcfilelist has no espeak-ng paths | Podspec glob not expanded | Use explicit `Dir[...]` in podspec, then `pod install` |
| .app has no espeak-ng-data | Copy phase not running or wrong path | Ensure “Copy espeak-ng-data” script phase runs and writes to `UNLOCALIZED_RESOURCES_FOLDER_PATH/espeak-ng-data/` |
| .app has data but app says “not found” | Lookup path doesn’t match bundle layout | Rely on “Copy espeak-ng-data” so data is at bundle root; keep enumerator fallback for CocoaPods full-path copies |

---

*Rename note: this file was previously `espeak-ng-data-cocoapods.md`. It’s now a structured debug ledger for tracing why espeak-ng-data files are missing or not found.*
