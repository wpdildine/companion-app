# Play/Act realization (Cycle 5)

Canonical realization notes for the documented Play/Act layer. **Authority:** [docs/PLAY_ACT_CONTRACT.md](PLAY_ACT_CONTRACT.md), [docs/APP_ARCHITECTURE.md](APP_ARCHITECTURE.md), [docs/ARCHITECTURE.md](ARCHITECTURE.md), [docs/INTERACTION_CONTRACT.md](INTERACTION_CONTRACT.md).

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

## Implementation-planning readiness

**READY** — Resolver inputs map to existing `AgentOrchestratorState` fields; optional surface facts pass as a small struct at composition boundaries.
