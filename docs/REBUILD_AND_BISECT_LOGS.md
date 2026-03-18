# Full rebuild and bisect flag log capture

Use this after cleaning native artifacts so the app loads JS from this repo’s Metro bundle (no stale/prebuilt bundle).

## 1. Stop Metro and app

```bash
pkill -f "react-native start" 2>/dev/null
pkill -f "metro" 2>/dev/null
killall Simulator 2>/dev/null
killall ATLAS00 2>/dev/null
```

## 2. Clean iOS derived/build artifacts

```bash
cd /Users/williamdildine/Documents/ATLAS-01
rm -rf ios/build
rm -rf ~/Library/Developer/Xcode/DerivedData/ATLAS00-*
rm -rf ~/Library/Developer/Xcode/DerivedData/ATLAS-*
```

## 3. Start Metro from this repo (with reset-cache)

```bash
cd /Users/williamdildine/Documents/ATLAS-01
pnpm run start:local:reset
```

Leave this running. Wait until you see: `Dev server ready` and (after launch) `Connection established to app='com.atlas00.app'`.

## 4. Build and run the app (new terminal)

```bash
cd /Users/williamdildine/Documents/ATLAS-01
pnpm run ios
```

Use the same repo path. The app will build, install, and load JS from the Metro server above.

## 5. Capture these first logs only

From React Native / Metro / device logs, capture the **first** occurrence of:

- `[BisectFlagsModule VERIFY PATH]`
- `[BisectFlagsModule WORKSPACE]`
- `[BisectFlagsModule] loaded`
- `[ResultsOverlay] bisect flags`
- `[ResultsOverlay] overlay short-circuited` (if it appears)

## 6. Report (fill after rebuild)

| Field | Value |
|-------|--------|
| **verifyPath** | (value from `[BisectFlagsModule VERIFY PATH]`) |
| **processCwd** | (from `[BisectFlagsModule WORKSPACE].processCwd`) |
| **noOverlayPanels at module load** | (from `[BisectFlagsModule] loaded`.noOverlayPanels) |
| **noOverlayPanels in ResultsOverlay** | (from `[ResultsOverlay] bisect flags`.noOverlayPanels) |
| **overlay short-circuited appears?** | yes / no |

If runtime still shows `noOverlayPanels: false` after a full rebuild, the app is not running from this workspace; next step is to prove which workspace/build target is actually launching.
