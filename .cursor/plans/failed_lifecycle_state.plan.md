---
name: ''
overview: ''
todos: []
isProject: false
---

# Recoverable lifecycle state `failed` + transient visual signals

## Core architecture (must remain unchanged)

- **failed** is a lifecycle-only state.
- **Visualization mapping:** failed → idle. The visualization engine must NOT gain a new persistent mode.
- **Transient signal** softFail is used for the red pulse / agitation effect.
- **error** remains reserved for true runtime/system faults.
- **failed** represents recoverable attempt misses (e.g. empty transcript).

**System model:**

```
AgentOrchestrator
  ↓ lifecycle
VisualizationController
  ↓ lifecycle → visualizationMode
VisualizationEngine
  ↓ render
```

Transient signals travel alongside the visualization mode.

---

## Failed lifecycle behavior (explicit)

**failed** is a short-lived recoverable lifecycle state.

- Appears briefly in lifecycle and logging.
- Does **not** require user dismissal.
- Automatically transitions: **failed → idle** after a defined brief display interval (e.g. on the order of hundreds of milliseconds; exact value is implementation choice).
- Retry must remain smooth after the failure settles; no wedge, no dead zone. **Retry is gated by the brief failed interval:** the authoritative behavior is that retry is possible **immediately after the brief failed interval** (once lifecycle has transitioned failed → idle). Implementation should choose this consistently—retry is not gated by cleanup completion alone.

---

## 1. Lifecycle types

- **File:** [src/app/agent/types.ts](src/app/agent/types.ts)
- Add `'failed'` to `AgentLifecycleState` union (after `'complete'`, before `'error'`).

---

## 2. Orchestrator

**File:** [src/app/agent/useAgentOrchestrator.ts](src/app/agent/useAgentOrchestrator.ts)

**Stop finalization and cleanup (required):**

- **Do not delay or schedule `finalizeStop()` to hold the failed visual.** Remove any plan text that schedules `finalizeStop()` after a delay (e.g. after ~800ms). That is incorrect.
- **Correct behavior:** When settlement resolves to empty/no-usable transcript: (1) Set lifecycle to `'failed'`. (2) **Run `finalizeStop()` normally and promptly.** Stop finalization, cleanup, and restart eligibility complete promptly. (3) The brief failed display dwell is controlled **independently**. **One authoritative owner for recovery timing:** the **lifecycle timer** owns the failed → idle transition; the transient visual effect decays independently and **does not decide** lifecycle recovery. Implement with a separate short-lived lifecycle timer whose sole job is to transition lifecycle from `failed` to `idle` after the display interval. **Cleanup timing and visual dwell timing are separate concerns.**

**State export:** The emitted lifecycle must respect: failed is preserved when lifecycle is failed; error is shown only when there is a true system error; otherwise emit the current lifecycle. Implementation **must** express this as an **explicit semantic branch** (e.g. if lifecycle is failed then emit failed; else if system error then emit error; else emit lifecycle)—**not** as a single ternary. The old "error overrides lifecycle" assumption is exactly where failed could get accidentally collapsed later; the explicit branch prevents that.

**Empty-transcript settlement:** In `resolveSettlement`, when `!normalized` (timeout and quietWindowExpired paths): set lifecycle to `'failed'`; call `**finalizeStop()` normally and promptly** (no delay); start a **separate timer whose sole job is to transition lifecycle from `'failed'` to `'idle'` after the brief display interval (lifecycle timer is the authoritative owner for recovery timing; transient visual effect does not drive lifecycle). Log e.g. “lifecycle transition listening -> failed”, “recoverable attempt failed; returning to idle-ready state”. Clear the failed→idle timer on unmount.

**Message storage:** **failed must NOT populate the hard-error field** used by the persistent error UI. Do not set the same error field used for system faults when transitioning to `failed`. Any message for failed attempts is recoverable feedback, not a system fault. UI logic must display the persistent error panel **only** when `lifecycle === 'error'`.

---

## 3. Transient visual signals: single source of truth

**Requirement:** A **single shared transient signal definition module** (e.g. defining a type such as `TransientVisualSignal`). Transient signal names must **not** be scattered as raw string literals across controller, engine, or render files.

- **New file:** e.g. `src/visualization/engine/signals.ts` (or `src/visualization/types/signals.ts`). This module is the **source of truth** for:
  - controller emission
  - visualization typing
  - validation
  - pulse/event mapping
- **Contents:** Transient signal type union (e.g. `TransientVisualSignal` with at least `'softFail'`); optional helper guards/constants. Minimal and typed. Do **not** design a large framework.
- **Consumers:** use the shared module only—no raw literals. Controller, engine types, validateVizState, getPulseColor, EngineLoop all reference the shared definition.

---

## 4. VisualizationController

- **File:** [src/app/agent/useVisualizationController.ts](src/app/agent/useVisualizationController.ts)
- Map lifecycle **failed → idle** (no new persistent viz mode). On transition into `failed`, emit the transient signal (softFail) using the **shared type** from the signals module. One-shot emission per transition (ref guard); clear when lifecycle leaves failed.

---

## 5. Visualization engine

- **Files:** [src/visualization/engine/types.ts](src/visualization/engine/types.ts), [getPulseColor.ts](src/visualization/engine/getPulseColor.ts), [validateVizState.ts](src/visualization/engine/validateVizState.ts), [EngineLoop.tsx](src/visualization/engine/EngineLoop.tsx)
- Engine accepts the transient signal from the shared type; renders center pulse / red shift / agitation; decay is automatic. Use shared module for typing and branching—no ad hoc string literals. getPulseColor and validateVizState take valid transient signals from the shared module. EngineLoop branches on signal using the shared type.

---

## 6. UI: AgentSurface and ResultsOverlay

**Requirement:** **failed must NOT drive the persistent error UI.** The persistent error panel/UI is reserved for true error states. UI logic must **only** display the persistent error panel when **lifecycle === 'error'**.

- **File:** [src/app/AgentSurface.tsx](src/app/AgentSurface.tsx)
- Pass to ResultsOverlay an error value that is set **only** when `lifecycle === 'error'` (e.g. `error={orchState.lifecycle === 'error' ? orchState.error : null}`). **failed** must not populate the hard-error field used by this panel; **failed** does not trigger the persistent error panel.
- **Content panels:** Error-driven display (e.g. `showContentPanels`) requires real error (e.g. `lifecycle === 'error'` and error field set); **failed** does not open the error content path.
- **Interaction:** **failed** behaves like an **idle-adjacent recoverable state.** It must not wedge touch ownership. User retry is possible **immediately after the brief failed interval** (when lifecycle has returned to idle)—this is the authoritative behavior; keep implementation consistent with it. Only define what **failed** requires; avoid unnecessarily rewriting existing error interaction rules.

---

## 7. Docs

- [docs/APP_ARCHITECTURE.md](docs/APP_ARCHITECTURE.md): Lifecycle (failed vs error), semantic boundary, failed lifecycle-only and maps to idle viz, failed short-lived and auto-returns to idle, transient softFail, when to use failed vs error. Phase 6 logging: mention failed.
- [README.md](README.md): One sentence: agent lifecycle has failed (recoverable, short-lived) vs error (system fault); only error shows the persistent error panel.

---

## 8. Logging

- Orchestrator: log lifecycle transition to `failed` and “recoverable attempt failed; returning to idle-ready state.” Keep existing hard-error logs. No render/frame spam.

---

## Out of scope

- No new canonical visualization mode for failed.
- No gesture model redesign, engine loop redesign, or speech library change.
- No duplicate submit or late mutation after settlement; preserve exactly-once settlement and restart eligibility.

---

## Verification / definition of done

- Empty/no-usable transcript → lifecycle `failed`; **finalizeStop() runs promptly**; restart eligible promptly; brief failed display (transient signal / red pulse); lifecycle auto-returns to idle; no persistent error panel; no user dismissal.
- Retry after failed: smooth; no wedge; **possible immediately after the brief failed interval** (when lifecycle has returned to idle)—authoritative behavior; implementation must be consistent with this.
- Successful path unchanged. Real error path still shows error and existing error UI; failed never triggers that path.
- Logs distinguish failed vs error.
- failed is short-lived and auto-recovers; explicitly verified.
