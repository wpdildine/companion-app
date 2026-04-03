# LOOP RECORD

**Seam:** Staged boot surface (Cycle 2) — `idle` → `alive` → `ready` → parent `onSafeToReleaseNative` → `AgentSurface`

**Owning layer:** `BootHandoffSurface` (presentation); `App.tsx` (handoff timing, `BootSplash.hide`, `bootPhase`)

**Loop type:** PLAN → PATCH → VERIFY (read-only agent pass; perceptual/device gates operator-pending)

**Plan status:** Approved; implemented per plan + animation lifecycle caution (single loop start, deterministic stop, unmount cleanup)

**Before:** Cycle 1 static boot surface (icon + layout + rAF → `onSafeToReleaseNative` only)

**Patch:** [BootHandoffSurface.tsx](file:///Users/williamdildine/Documents/ATLAS-01/src/app/BootHandoffSurface.tsx): `stage` state; `didStartRef` / `aliveLoopRef`; `Animated.Value` opacity + scale; `Animated.loop` + sequence; nested rAF after `alive`; `ready` stops loop and settles values then calls `onSafeToReleaseNative`; `useEffect` cleanup stops loop and `stopAnimation` on values. [App.tsx](file:///Users/williamdildine/Documents/ATLAS-01/src/app/App.tsx): no behavior change.

**After:** Staged presentation with subtle pulse during `alive`; same release contract and Strategy A (boot-only mount until `bootPhase` ready)

**Boundary status:** **Unchanged** for native durability seam — authority remains `scripts/native-overrides` + apply/regen per [native-durability-startup-handoff](file:///Users/williamdildine/Documents/ATLAS-01/.cursor/artifacts/patterns/native-durability-startup-handoff.md). Cycle 2 does not relocate native or handoff ownership.

**If boundary violation:** N/A for this loop; revert would restore prior `BootHandoffSurface.tsx` single-rAF implementation

**Classification:** Presentation vertical extended inside existing boot surface; no new orchestration seam

**Notes (VERIFY):** Agent VERIFY could not assign pass/fail on cold-launch pixels, platform parity, or Fast Refresh — **pending operator**. Static review: no `setTimeout`/`setInterval` in `BootHandoffSurface` / `App.tsx` for this path; `hide` only via `onSafeToReleaseNative`. **Observational risk:** `alive` may be very short (~one frame) before inner rAF — operator should confirm motion is perceptible.
