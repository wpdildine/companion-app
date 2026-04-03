# Loop: native durability reconciliation — startup handoff (Cycle 1)

**Date:** 2026-04-03  
**Seam:** Native durability authority for BootSplash + App entry  
**Mode:** PATCH (rehome only; no behavior redesign)

## Classification (provisional ios/android → durable authority)

| Class | What | Durable location |
|-------|------|------------------|
| **A — generator** | `react-native-bootsplash generate` (`pnpm run icon:splash`): can refresh storyboard, asset hashes, `assets/bootsplash/` | Source of truth for *regenerating* those blobs from `./assets/icons/A-Icon.png` |
| **B — overrides** | App entry (`AppDelegate.mm`/`h`, `main.m`), `RNBootSplash.initWithStoryboard`, Xcode `project.pbxproj` wiring, `Info.plist` `UILaunchStoryboardName`, `BootSplash.storyboard`, `Colors.xcassets`, `BootSplashLogo-*.imageset`, Android `MainActivity` + `BootTheme` + drawables + `styles.xml` + manifest activity theme | `scripts/native-overrides/**` |
| **C — plumbing** | Copy order and file list | `scripts/apply-native-overrides.js` (extended); `scripts/regen-native.js` (post-regen note) |

## Outcome

- `apply-native-overrides` now copies all Cycle 1 handoff–bearing native files from overrides.
- After `native:regen`, `apply-native-overrides` restores the same behavior without relying on unique hand-edits surviving under `ios/` / `android/`.
- Rebranding splash: run `icon:splash`, then sync generator-touched files into `scripts/native-overrides` (see boundary artifact).

## Artifact

Boundary: [.cursor/artifacts/patterns/native-durability-startup-handoff.md](../artifacts/patterns/native-durability-startup-handoff.md)
