# Android "Invariant" / "Global was not installed" — Cause and Fix

## What adb shows

When the failure happens, logcat typically shows:

1. **Root cause (JS):**  
   `ReactNativeJS: [runtime not ready]: Error: Non-js exception: AppRegistryBinding::startSurface failed. Global was not installed.`  
   Or a JS exception just before it, e.g.  
   `TypeError: Cannot read property 'genericDirectEventTypes' of null`

2. **Follow-on (native):**  
   `ReactHost: raiseSoftException(onWindowFocusChange(hasFocus = "true")): Tried to access onWindowFocusChange while context is not ready`

So: **a JS error during app bootstrap (or during reload) prevents the React Native "Global" from being installed.** The native side then calls `startSurface`, which fails with "Global was not installed." The "invariant violation" you see is the red screen from that **first JS error**, not from rebuilding.

## Why it happens (no full rebuild needed)

- **Any uncaught JS error** during initial bundle load (or right after a hot reload) can leave the runtime in a bad state so Global is never set.
- Common triggers:
  - **Wrong import paths** so Metro resolves to the wrong file or fails (e.g. `../../shared/logging` instead of `../../../shared/logging` from `src/app/agent/voice/`). That can make the bundle fail or throw at load.
  - **A dependency** that runs code at import time and throws (e.g. reading a property of `null`), as in [RN#50005](https://github.com/facebook/react-native/issues/50005) (e.g. `genericDirectEventTypes` of null, or an outdated native module).
  - **Killing the wrong process** (e.g. Metro or a related process), leaving the runtime in a bad state until a clean restart.

So you **don’t have to do a full rebuild** every time; you need to **fix the JS error that runs on load/reload** and avoid bad process kills.

## How to find the real error

1. **Metro terminal**  
   When you save and the app crashes or shows the invariant, check the **Metro** output for the **first** red error (e.g. "Unable to resolve module", or a stack trace). That’s usually the real cause.

2. **adb logcat (current app)**  
   ```bash
   adb logcat -c && <launch or reload app> && adb logcat -d | grep -E "ReactNativeJS|ReactHost|invariant|startSurface|Global|Error:"
   ```  
   Look for the **first** `ReactNativeJS` or JS exception line; that’s the bootstrap error.

3. **Development build + clear cache**  
   - Clear Metro cache: `pnpm start:local -- --reset-cache` (or `npx react-native start --reset-cache`).
   - Run the Android app and trigger the failure once.
   - The first error in Metro or in logcat is what to fix.

## If Metro shows `../../shared` or `../../rag` from `agent/voice/`

Those files on disk already use **`../../../`**. If Metro still reports `../../`, Watchman or Metro is serving a stale graph:

1. **Stop Metro** (Ctrl+C).
2. **Clear Watchman**, then start with a clean cache:
   ```bash
   watchman watch-del '/Users/williamdildine/Documents/companion-app' ; watchman watch-project '/Users/williamdildine/Documents/companion-app'
   pnpm start:local:reset
   ```
3. **On a physical Android device over USB**, forward Metro’s port so the app can load the bundle:
   ```bash
   adb reverse tcp:8081 tcp:8081
   ```
4. Reload the app. Use **CompanionApp** (com.companionapp), not another app (e.g. com.rnapp).

## Checklist (fix without full rebuild)

- [ ] **Imports under `src/app/agent/voice/`**  
  From that folder, `shared` and `rag` are under `src/`, so use **`../../../shared/logging`** and **`../../../rag`**, not `../../shared` or `../../rag`. (Current repo already has `../../../`.)

- [ ] **Metro + Watchman**  
  Run `pnpm start:local:reset`. If errors still show wrong paths, run the Watchman commands above, then `pnpm start:local:reset` again.

- [ ] **No init-time throws**  
  Ensure nothing in `index.js`, `App.tsx`, or top-level imports (including native modules) throws when the bundle loads or when a screen is first required.

- [ ] **Dependencies**  
  If you see something like `genericDirectEventTypes` of null or a native module “undefined” at load, check that library’s version and compatibility with RN 0.81 and New Architecture (see [RN#50005](https://github.com/facebook/react-native/issues/50005)).

## References

- React Native issue: [SurfaceRegistryBinding::startSurface failed. Global was not installed #50005](https://github.com/facebook/react-native/issues/50005)  
- Fix is usually: correct the **first** JS error that happens during load/reload; no need to “fully rebuild” every time once that error is fixed.
