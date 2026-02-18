# Fix: "Class RCTSwiftUIContainerView is implemented in both React.framework and CompanionApp.debug.dylib"

This warning can cause **mysterious crashes** because the Obj-C runtime may pick the wrong class at runtime.

## Checklist (in order)

### 1. Don't build React as a dynamic framework in Debug

- In **ios/Podfile**: we only use `use_frameworks! :linkage => :static` when `ENV['USE_FRAMEWORKS']` is set (never dynamic).
- After any Podfile change, run:
  ```bash
  cd ios
  rm -rf Pods Podfile.lock
  pod install
  ```
- Dynamic frameworks make it easier to accidentally embed duplicates.

### 2. Confirm you're not embedding React.framework twice

In **Xcode** → **CompanionApp** target → **Build Phases**:

- **Link Binary With Libraries**: `React.framework` should appear **once**. Remove any duplicate or extra `React*.framework`.
- **Embed Frameworks**: `React.framework` should appear **once** (and only if it must be embedded). If React is already pulled in by another framework that contains it, you get the duplicate.

### 3. Check for CompanionApp.debug.dylib being embedded improperly

The log may show `.../CompanionApp.app/CompanionApp.debug.dylib`. That file can be normal for some debug setups, but it should **not** contain React's SwiftUI classes if React.framework is already in the app.

- Look for a **custom build phase** that copies or embeds a `.debug.dylib`.
- Look for scripts from a template that embed debug artifacts.
- If you have a phase like **"Embed Debug Dylib"**, try disabling it and re-run. At minimum, confirm it's not pulling React sources into that dylib.

(This project's **project.pbxproj** has no custom "Embed Debug Dylib" phase; only standard "[CP] Embed Pods Frameworks". If the duplicate persists, the dylib may be coming from React Native's own tooling; fixing (1) and (2) usually resolves it.)

### 4. Don't mix "React as framework" with normal pods

- If you have **USE_REACT_AS_FRAMEWORK** or custom "React.framework" packaging anywhere (env, script, or Xcode), remove it.
- Standard RN iOS expects React to come from **pods (static libs)** unless you have a specific reason to use frameworks.

### 5. Clean and rebuild

- **Product → Clean Build Folder** (⇧⌘K).
- Delete **DerivedData** (e.g. `~/Library/Developer/Xcode/DerivedData/CompanionApp-*`).
- `cd ios && pod install` then build again.

After fixing, the "implemented in both" warning should disappear and random crashes from this cause should stop.
