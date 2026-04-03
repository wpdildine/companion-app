# PLAN ARTIFACT

**Seam:** Cycle 3 — boot surface perceptibility (Option A: one full animation cycle before release)

**Owning layer:** [BootHandoffSurface.tsx](file:///Users/williamdildine/Documents/ATLAS-01/src/app/BootHandoffSurface.tsx) (presentation / perceptual timing only); [App.tsx](file:///Users/williamdildine/Documents/ATLAS-01/src/app/App.tsx) release authority unchanged (no edits this cycle)

**Files to inspect:** [src/app/BootHandoffSurface.tsx](file:///Users/williamdildine/Documents/ATLAS-01/src/app/BootHandoffSurface.tsx), governing docs (APP_ARCHITECTURE, ARCHITECTURE, AGENT_RULES), [.cursor/artifacts/patterns/native-durability-startup-handoff.md](file:///Users/williamdildine/Documents/ATLAS-01/.cursor/artifacts/patterns/native-durability-startup-handoff.md)

**Files to modify (as executed):** [src/app/BootHandoffSurface.tsx](file:///Users/williamdildine/Documents/ATLAS-01/src/app/BootHandoffSurface.tsx) only

**Bounded change:** Replace `Animated.loop` + nested second `requestAnimationFrame` with a single `Animated.sequence` (same two-phase pulse, ~1200ms) and `pulse.start(({ finished }) => …)` → `setStage('ready')`, settle values, `onSafeToReleaseNative()`; no timers; no App.tsx / native / runtime changes

**Invariant:** Cycle 1 ordering (layout + first rAF before pulse; parent still owns `hide`); Cycle 2 stages `idle` | `alive` | `ready`; no `setTimeout`/`setInterval`; perceptibility via animation completion, not wall-clock delay

**Test plan:** Cold launch iOS + Android (manual): static first frame; one visible pulse; seamless handoff; reject if pulse imperceptible, repeats, feels like loading wait, or sluggish

**Success criteria:** `alive` human-visible for one cycle; startup still feels immediate; no new seams; Cycle 1 + 2 guarantees preserved
