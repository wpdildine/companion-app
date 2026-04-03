# PLAN ARTIFACT

**Seam:** Cycle 2 — staged boot surface (presentation `idle` → `alive` → `ready` before handoff)

**Owning layer:** [BootHandoffSurface.tsx](file:///Users/williamdildine/Documents/ATLAS-01/src/app/BootHandoffSurface.tsx) (presentation only); [App.tsx](file:///Users/williamdildine/Documents/ATLAS-01/src/app/App.tsx) (`BootSplash.hide`, `bootPhase` — release authority unchanged)

**Files to inspect:** [src/app/BootHandoffSurface.tsx](file:///Users/williamdildine/Documents/ATLAS-01/src/app/BootHandoffSurface.tsx), [src/app/App.tsx](file:///Users/williamdildine/Documents/ATLAS-01/src/app/App.tsx), governing docs (APP_ARCHITECTURE, ARCHITECTURE, AGENT_RULES), [.cursor/artifacts/patterns/native-durability-startup-handoff.md](file:///Users/williamdildine/Documents/ATLAS-01/.cursor/artifacts/patterns/native-durability-startup-handoff.md)

**Files to modify (as executed):** [src/app/BootHandoffSurface.tsx](file:///Users/williamdildine/Documents/ATLAS-01/src/app/BootHandoffSurface.tsx) only; [App.tsx](file:///Users/williamdildine/Documents/ATLAS-01/src/app/App.tsx) unchanged (no behavior change)

**Bounded change:** Presentation-only staging; `Animated.loop` pulse; layout + two-`requestAnimationFrame` chain into existing `onSafeToReleaseNative`; no timers; no new deps; no native / runtime-ts / orchestrator / AgentSurface / visualization edits

**Invariant:** Cycle 1 ordering preserved (native → boot → main); `hide()` still invoked only from parent callback after layout + rAF chain; animation loop started once (`didStartRef`), stopped on `ready`, cleaned up on unmount; no semantic state in boot surface

**Test plan:** Cold launch iOS + Android (manual); perceptual checks for alive subtlety, continuity, no flash; Fast Refresh (manual); operator risk called out: `alive` window may be ~one frame before inner rAF — confirm motion perceptible

**Success criteria:** Single continuous startup feel; alive perceptible but subtle; no flicker/blank goal; no timers in seam files; Cycle 1 guarantees intact
