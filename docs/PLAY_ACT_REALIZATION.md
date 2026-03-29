# Play/Act realization (Cycle 5)

Canonical realization notes for the documented Play/Act layer. **Authority:** [docs/PLAY_ACT_CONTRACT.md](PLAY_ACT_CONTRACT.md), [docs/PLAY_ACT_BOUNDARIES.md](PLAY_ACT_BOUNDARIES.md) (hardening and expansion boundaries), [docs/APP_ARCHITECTURE.md](APP_ARCHITECTURE.md), [docs/ARCHITECTURE.md](ARCHITECTURE.md), [docs/INTERACTION_CONTRACT.md](INTERACTION_CONTRACT.md).

This document captures **how** the approved contract is realized in product code at a high level. The **pure resolver** lives next to agent types (implementation); it does **not** own lifecycle, arbitration, or semantics.

---

## Non-negotiable constraints

- **AgentOrchestrator** remains the sole owner of lifecycle, request sequencing, commit/clear of `responseText`, recoverable vs hard `error`, and normalized outcome classes.
- **AgentSurface** remains the sole owner of touch arbitration and semantic hold accept/reject; **InteractionBand** remains touch-intent-only.
- **VisualizationController** and **ResultsOverlay** remain the authorities for GL signals and overlay layout; Play/Act supplies **interpretation hints** only, intersected with orchestrator + arbitration truth.
- Play/Act is **derived** only: no parallel lifecycle machine, no AV/request emission, no meaning from raw transcript/RAG.
- **Respond → Evaluate** is **out of scope** until a future exported orchestrator contract explicitly requires it ([PLAY_ACT_CONTRACT.md](PLAY_ACT_CONTRACT.md) implementation watchpoint).

---

## Realization objective (first slice)

**Implemented enough** means: a **single deterministic primary Act** from the five documented Acts, plus **optional** `processingSubstate` passthrough (when in **Evaluate**), **affordance hints** intersected with optional surface facts, and **commit/visibility hints** aligned with the contract commitment table—**without** new control paths or visualization writes.

**Deferred:** Respond → Evaluate, Act-driven visualization modes, Act inside orchestrator/AV, durable Act persistence, debug/HUD ownership of Act.

---

## Minimum inputs (conceptual → code)

| Input category | Owner | Role in resolver |
|----------------|--------|------------------|
| Lifecycle (`idle` \| `listening` \| `processing` \| `speaking` \| `error`) | Orchestrator | Primary partition of mode. |
| `processingSubstate` (only when `processing`) | Orchestrator | Optional qualifier for **Evaluate**. |
| `responseText` presence (trimmed) | Orchestrator | **Respond** vs empty idle paths. |
| `lastFrontDoorOutcome` / `front_door_verdict` | Orchestrator | **Clarify** (`clarify_entity`) vs **Recover** (abstain verdicts) when not in-flight. |
| `error` string vs lifecycle | Orchestrator | Hard `error` lifecycle handling (hints suppressed). |
| Optional: `interactionBandEnabled` (or equivalent) | AgentSurface | **Intersects** voice-intake hints only; does **not** change primary Act selection. |

---

## Minimum outputs

| Output | Authority limit |
|--------|-----------------|
| `primaryAct` | One of `intake` \| `evaluate` \| `clarify` \| `recover` \| `respond`; descriptive only. |
| `processingSubstate` echo | Only when `primaryAct === 'evaluate'`; else `null`. |
| `affordanceHints` | Booleans such as voice-intake eligibility; **must** be intersected with surface + lifecycle (e.g. no voice intake when `lifecycle === 'error'`). |
| `commitVisibilityHint` | Enum aligned with [PLAY_ACT_CONTRACT.md](PLAY_ACT_CONTRACT.md) commit policy; does **not** commit or clear text. |

---

## Resolution locus

Pure function **downstream** of orchestrator state (and optional surface snapshot), **upstream** of presentation. Same frame: orchestrator state updates → resolver recomputes → consumers read.

---

## Integration seam

- **Consumers:** Any presentation-adjacent layer may **read** the resolution alongside existing orchestrator props; **VisualizationController** may ignore Act in early rollout.
- **Unchanged:** All orchestrator actions, hold contract, `applyVisualizationSignals`, overlay ownership.

---

## Staged realization

1. **Resolver + tests** — Primary Act stable vs lifecycle + front-door + `responseText`; mismatches are resolver bugs.
2. **Optional presentation consumption** — Copy/a11y/labels use Act + hints with intersection; no new gates.
3. **Full five-Act alignment** — **Clarify** / **Recover** paths follow exported `lastFrontDoorOutcome`; if a signal is absent, that Act stays unreachable.

---

## Validation obligations

- No lifecycle duplication; Act always derivable from current orchestrator snapshot for tests.
- No arbitration duplication; band disabled ⇒ voice hint false even if Act is Intake.
- No semantic recomputation; resolver does not read `transcribedText` for classification.
- No visualization writes from resolver.
- No **Respond → Evaluate** path in code until contractually required.

---

## Hard `error` lifecycle note

The five Acts do not define a dedicated “hard error” Act. When `lifecycle === 'error'`, the resolver still returns a **primary Act** for structural completeness: **`intake`** with **affordance hints forced off** so presentation must rely on **`lifecycle === 'error'`** for error UI ([APP_ARCHITECTURE.md](APP_ARCHITECTURE.md)). This is a **presentation mapping compromise**, not a claim that the user should use voice intake during hard error.

---

## Cycle 6 — optional consumer (semantic channel)

**Consumer:** `SemanticChannelView` (shell wrapping `ResultsOverlay`), fed from `AgentSurface` (`src/screens/voice/SemanticChannelView.tsx`, `src/app/AgentSurface.tsx`).

**Consumed phase outputs:** `primaryAct` and `commitVisibilityHint` only **via** `src/app/agent/semanticChannelCanonicalCopy.ts` string mappers (AgentSurface: `getSemanticEvidence` + `resolveActDescriptor` + `getSemanticChannelAccessibilityLabel` / `getSemanticChannelPhaseCaptionText`). Legacy `playActPhaseCopy` shims the same mappers. **Not consumed this cycle:** `affordanceHints`, `processingSubstate` for UI branching.

**Orchestrator overrides:** `lifecycle === 'error'` → accessibility label from `error` string, not Act; visible phase caption suppressed on error (overlay owns error presentation).

**Surface intersection:** `resolveAgentPlayAct(orchState, { interactionBandEnabled })` uses the same band enablement boolean as [INTERACTION_CONTRACT.md](INTERACTION_CONTRACT.md) arbitration wiring in AgentSurface.

**Stage 2 visible caption:** `PLAY_ACT_PHASE_CAPTION_ENABLED` in `AgentSurface` (see Cycle 8).

---

## Cycle 8 — Stage 2 visible caption (single additional consumer)

**Objective:** Same semantic channel shell as Cycle 6; adds the optional **visible** one-line phase caption for sighted users, still presentation-only.

**Preconditions (Stage 2 decision rule in [PLAY_ACT_BOUNDARIES.md](PLAY_ACT_BOUNDARIES.md)):** Product accepts visible phase consistency; caption stays a **single** non-interactive line in the semantic channel shell; copy is neutral (no instruction to speak/tap beyond what arbitration may allow); hard error suppresses caption; caption visibility is **not** tied to arbitration outcomes except band state as **read-only** input to `resolveAgentPlayAct` for **affordance hints** (unchanged from Cycle 6; copy phase table does not branch on band).

**Consumed phase outputs:** `primaryAct` and `commitVisibilityHint` via `getSemanticChannelPhaseCaptionText` / `playActPhaseCopy.getPlayActPhaseCaptionText` shim (including `commitVisibilityHint` alignment for **Respond** caption variants). Still **not** consumed: `affordanceHints`, `processingSubstate` for any UI branching.

**Product flag:** `PLAY_ACT_PHASE_CAPTION_ENABLED` in `AgentSurface` is **`true`** for the shipped Cycle 8 slice; set `false` to revert to a11y-only without removing wiring.

---

## Cycle 9 — measurement and drift detection

**Read-only** validation: [docs/PLAY_ACT_MEASUREMENT.md](PLAY_ACT_MEASUREMENT.md). Pure predicates in `src/app/agent/playActDrift.ts`; golden + violation tests in `src/app/agent/tests/playActDrift.test.ts`; optional **`__DEV__`** `logWarn` when drift signature changes in `AgentSurface` (no control impact).

---

## Cycle 10 — overlay-adjacent accessibility (one additional passive consumer)

**Objective:** Bounded **overlay-adjacent** static accessibility on the **existing** `ResultsOverlay` root container, using the **same** canonical string as the semantic channel—prove a second interpretation sink without a second mapping policy or measurement fork.

**Consumer:** `ResultsOverlay` root `View` (`src/app/ui/components/overlays/ResultsOverlay.tsx`), fed from `AgentSurface` via prop `playActAccessibilityLabel` (same value as `SemanticChannelView`’s `accessibilityContainerLabel`).

**Consumed phase outputs:** Unchanged — `primaryAct` and `commitVisibilityHint` **only** via `getSemanticChannelAccessibilityLabel` / `getPlayActAccessibilityLabel` shim. **Not consumed:** `affordanceHints`, `processingSubstate` for any UI branching.

**Ownership:** `ResultsOverlay` still owns reveal, dismiss, layout, and panel semantics; the label is **annotation only** and must not gate interaction ([PLAY_ACT_BOUNDARIES.md](PLAY_ACT_BOUNDARIES.md) — overlay-adjacent static phrasing).

**Measurement:** Cycle 9 predicates **unchanged**; drift observation continues to use the single `a11yLabel` passed into `detectPlayActDrift` (same string as both surfaces).

### Output usage rules (restated for this cycle)

| Output | Allowed here | Forbidden |
|--------|--------------|-----------|
| **primaryAct** | Via mapper only; phase-oriented copy. | Any control of band, overlay policy, visualization, or lifecycle. |
| **commitVisibilityHint** | Via mapper only; wording alignment with commitment policy. | Source of truth for commit/clear; show/hide panels from hint alone. |
| **affordanceHints** | Not consumed. | UI branching or “permission to speak” from hints. |
| **processingSubstate** | Not consumed for UI. | Per-substate visible branches. |

### Validation checklist (Cycle 10)

- No lifecycle duplication; hard `error` still orchestrator-first in mapper (`lifecycle === 'error'` → error-framed label, not Act-as-permission).
- No arbitration duplication; band / hold unchanged.
- No visualization drift; no Act under `VisualizationController`.
- No overlay ownership drift; reveal/dismiss/layout unchanged.
- No hint-driven behavior; no `processingSubstate` leakage to UI.
- Existing drift predicates remain valid and unweakened ([PLAY_ACT_MEASUREMENT.md](PLAY_ACT_MEASUREMENT.md)).

---

## Cycle 7 — hardening and expansion boundaries

Shipped Stage 1 hardening targets, Stage 2 go/no-go, future-consumer safety categories, resolver output usage rules, validation/regression obligations, and expansion stop signals are **canonical** in **[docs/PLAY_ACT_BOUNDARIES.md](PLAY_ACT_BOUNDARIES.md)**. Do not expand Play/Act consumption without that policy.

---

## Implementation-planning readiness

**READY** — Resolver inputs map to existing `AgentOrchestratorState` fields; optional surface facts pass as a small struct at composition boundaries.
