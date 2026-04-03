# PLAN ARTIFACT

**Seam:** Startup ownership handoff — native splash hold/release → React boot surface → AgentSurface (Cycle 1)

**Owning layer:** Startup handoff control ([src/app/App.tsx](file:///Users/williamdildine/Documents/ATLAS-01/src/app/App.tsx) + native BootSplash init); not orchestrator / not visualization

**Files to inspect:** [App.tsx](file:///Users/williamdildine/Documents/ATLAS-01/App.tsx), [src/app/App.tsx](file:///Users/williamdildine/Documents/ATLAS-01/src/app/App.tsx), iOS AppDelegate / Launch / BootSplash wiring, Android MainActivity / styles / manifest, [react-native-bootsplash](file:///Users/williamdildine/Documents/ATLAS-01/node_modules/react-native-bootsplash/README.md) README, [scripts/native-overrides](file:///Users/williamdildine/Documents/ATLAS-01/scripts/native-overrides) and [scripts/apply-native-overrides.js](file:///Users/williamdildine/Documents/ATLAS-01/scripts/apply-native-overrides.js) (post–durability patch)

**Files to modify (as executed in approved plan):** Native: iOS delegate / entry, Android MainActivity + themes; JS: [src/app/App.tsx](file:///Users/williamdildine/Documents/ATLAS-01/src/app/App.tsx), new [src/app/BootHandoffSurface.tsx](file:///Users/williamdildine/Documents/ATLAS-01/src/app/BootHandoffSurface.tsx); durability follow-up: [scripts/native-overrides/**](file:///Users/williamdildine/Documents/ATLAS-01/scripts/native-overrides), [scripts/apply-native-overrides.js](file:///Users/williamdildine/Documents/ATLAS-01/scripts/apply-native-overrides.js), [scripts/regen-native.js](file:///Users/williamdildine/Documents/ATLAS-01/scripts/regen-native.js)

**Bounded change:** Single startup seam only; Strategy A — boot surface only until `BootSplash.hide` resolves, then `AgentSurface`; no staged loading, no runtime-ts, no resolver/routing, no AgentSurface internals

**Invariant:** Native owns pre–React launch visuals; React boot surface owns first JS frame; `hide()` only after layout + `requestAnimationFrame`; no app timers in seam; `AgentSurface` not mounted during `bootPhase === 'boot'`

**Test plan:** Cold launch iOS/Android (manual); fast refresh spot-check (manual); regen + apply + rebuild (operator; verify pass noted pending)

**Success criteria:** Controlled native hold; seamless handoff; no flicker/blank goal; durable truth in `scripts/native-overrides` + apply pipeline after reconciliation patch
