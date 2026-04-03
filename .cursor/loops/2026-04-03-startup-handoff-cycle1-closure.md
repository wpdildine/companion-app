# LOOP RECORD

**Seam:** Startup handoff (native BootSplash → React `BootHandoffSurface` → `AgentSurface`) and native durability authority for that seam

**Owning layer:** Startup handoff control (`App.tsx`, `BootHandoffSurface.tsx`, native BootSplash init); durable native customization authority (`scripts/native-overrides` + `apply-native-overrides.js` + `regen-native.js`)

**Loop type:** PLAN → PATCH (implementation) → PATCH (durability reconciliation) → VERIFY (read-only)

**Plan status:** Approved and executed (Cycle 1 scope)

**Before:** `react-native-bootsplash` present but iOS/Android wiring incomplete or inconsistent with RN template; JS mounted `AgentSurface` immediately; native handoff not explicit; behavior-bearing native edits lived only under generated `ios/` / `android/`

**Patch:** (1) Native BootSplash init (iOS `AppDelegate.mm` + `main.m` + storyboard/xcassets/pbxproj; Android `BootTheme` + `RNBootSplash.init` + drawables + manifest); (2) JS `bootPhase`, `BootHandoffSurface`, guarded `BootSplash.hide` after `onLayout` + rAF; (3) Rehome durable native truth into `scripts/native-overrides` and extend `apply-native-overrides.js`; regen script note for splash sync

**After:** Documented handoff ordering in code; overrides mirror applied `ios/`/`android/` for handoff files; `AppDelegate.mm` / `MainActivity.kt` diff-clean vs overrides at verification time; builds succeeded post-reconciliation (recorded in prior patch session)

**Boundary status:** Seam moved — **durable authority** for native startup handoff customization is **`scripts/native-overrides/`** + **`scripts/apply-native-overrides.js`**; generated `ios/` / `android/` are provisional output unless mirrored

**If boundary violation:** Revert would target last known good `native-overrides` + re-run `apply-native-overrides.js`; new seam would be “regen drift” or “generator vs snapshot sync” if overrides and generator diverge

**Classification:** Pattern — regen-safe native customization for BootSplash + app entry (see [.cursor/artifacts/patterns/native-durability-startup-handoff.md](../artifacts/patterns/native-durability-startup-handoff.md))

**Notes (VERIFY, recorded):** Visual handoff and fast refresh — **pending manual**. Static timing/ownership inspection — **pass**. Full `rm -rf ios android` + `native:regen` + rebuild — **pending** (not run in VERIFY pass; operator command list recorded in verify response). Library-internal native timing in `react-native-bootsplash` noted separately from app seam timers.
