# Fix: “Class RCTSwiftUIContainerView is implemented in both React.framework and CompanionApp.debug.dylib”

This warning can cause **mysterious crashes** because the Obj-C runtime may pick the wrong class at runtime.

## Cause

React (or the SwiftUI bridge) is linked/embedded **twice**: once in the app binary and again in an injected debug dylib.

## What to do

### 1. Xcode Build Phases

- Open the **CompanionApp** target → **Build Phases**.
- **Link Binary With Libraries**: ensure `React.framework` (or any React-related framework) appears **only once**. Remove duplicates.
- **Embed Frameworks**: ensure `React.framework` is embedded **only once**. Remove duplicates.

### 2. Don’t mix manual framework with CocoaPods

- If you use **CocoaPods** (this project does: `libPods-CompanionApp.a`, “[CP] Embed Pods Frameworks”), do **not** manually add `React.framework` to the target. Pods already bring React.
- If you recently added something that embeds or links React (e.g. a Swift package or a second copy of RN), remove the duplicate.

### 3. Clean and rebuild

- **Product → Clean Build Folder** (⇧⌘K).
- Delete **DerivedData** for this project (e.g. `~/Library/Developer/Xcode/DerivedData/CompanionApp-*`).
- `cd ios && pod install` then build again.

### 4. If you use `use_frameworks!`

- The Podfile only enables `use_frameworks!` when `ENV['USE_FRAMEWORKS']` is set. With static linking (default), the duplicate is often from a **debug/injection dylib** that also links React (e.g. React Native dev tools). Ensuring the app target does not link or embed React twice (steps 1–2) is the main fix.

After fixing, the “implemented in both” warning should disappear and random crashes from this cause should stop.
