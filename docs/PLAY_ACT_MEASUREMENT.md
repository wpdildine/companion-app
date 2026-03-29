# Play/Act measurement and drift detection (Cycle 9)

Canonical **read-only** drift model: orchestrator truth vs `resolveAgentPlayAct` vs rendered caption / accessibility strings. **Rendered** label and caption are produced by [`semanticChannelCanonicalCopy.ts`](../src/app/agent/semanticChannelCanonicalCopy.ts) (shared phase table with `deriveSemanticChannelCopyCore`); drift still ties **lifecycle ↔ resolver** and **copy ↔ orchestrator** heuristics. **Authority:** [docs/PLAY_ACT_CONTRACT.md](PLAY_ACT_CONTRACT.md), [docs/PLAY_ACT_REALIZATION.md](PLAY_ACT_REALIZATION.md), [docs/PLAY_ACT_BOUNDARIES.md](PLAY_ACT_BOUNDARIES.md), [docs/APP_ARCHITECTURE.md](APP_ARCHITECTURE.md), [docs/semanticChannelCopyParity.matrix.md](semanticChannelCopyParity.matrix.md).

This cycle **does not** change product behavior, copy, contracts, or consumers. It adds **predicates**, **tests**, and optional **`__DEV__` logging** only.

---

## Predicate matrix (locked)

Implemented in `src/app/agent/playActDrift.ts` as `detectPlayActDrift`. Each finding includes `suggestedClass`: `mapper` | `resolver` | `orchestrator` | `ux_ambiguity`.

| Code | Severity | Meaning |
|------|----------|---------|
| `error_caption_present` | invariant_violation | `lifecycle === 'error'` and visible caption non-empty. |
| `error_a11y_not_error_framed` | invariant_violation | `lifecycle === 'error'` and a11y label not error-framed (`Error.` / `Error ` prefix). |
| `lifecycle_processing_act_not_evaluate` | invariant_violation | `lifecycle === 'processing'` but `primaryAct !== 'evaluate'`. |
| `act_evaluate_lifecycle_not_processing` | invariant_violation | `primaryAct === 'evaluate'` but `lifecycle !== 'processing'`. |
| `respond_committed_no_response_text` | invariant_violation | `primaryAct === 'respond'`, `commitVisibilityHint === 'committed_answer'`, no trimmed `responseText`. |
| `cleared_hint_with_response_text_suspect` | informational | `commitVisibilityHint === 'cleared_or_empty'`, trimmed `responseText` present, lifecycle not `speaking`/`processing`, `primaryAct !== 'recover'`. |
| `intake_band_voice_copy_ambiguity` | informational | `primaryAct === 'intake'`, `affordanceHints.voiceIntakeEligible === false`, copy still implies voice intake (caption / a11y heuristics). |
| `processing_phase_label_caption_divergence` | invariant_violation | `lifecycle === 'processing'` but a11y missing `Processing` or (when caption enabled) caption ≠ `Working on it…`. |

Commitment checks use **orchestrator-visible** `responseText` only, not pixel-level overlay state ([docs/PLAY_ACT_BOUNDARIES.md](PLAY_ACT_BOUNDARIES.md)).

---

## Observation contract (read-only)

1. **Inputs per frame:** `AgentOrchestratorState`, `AgentPlayActResolution`, `PlayActSurfaceFacts` (same as passed into `resolveAgentPlayAct`), rendered `visibleCaption`, rendered `a11yLabel`, `captionEnabled` flag.
2. **Outputs:** `PlayActDriftFinding[]`; `playActDriftSignature(findings)` for stable dedupe keys.
3. **No feedback:** Predicates **must not** write orchestrator state, arbitration, visualization, overlay, or mapper outputs.
4. **Dev logging:** In `__DEV__` only, `AgentSurface` runs `detectPlayActDrift` in a `useEffect` and logs **once per distinct finding signature** via `logWarn` (`AgentSurface` scope). No production analytics.
5. **Primary validation:** Unit tests in `src/app/agent/tests/playActDrift.test.ts` (golden paths + synthetic violations).

---

## Drift classification (manual)

Use `suggestedClass` as a starting point; confirm against [docs/PLAY_ACT_BOUNDARIES.md](PLAY_ACT_BOUNDARIES.md) (“mismatch = consumer bug” for mapper-only fixes when resolver is correct).

---

## Exit criteria (process)

- **A)** No invariant violations in golden tests and clean manual `__DEV__` sessions for targeted flows, **or**
- **B)** Violations reproduced, logged, and classified for a correction cycle (mapper or resolver scope).

---

## Non-goals

No fixes, UI changes, new consumers, contract changes, or overlay/visualization integration in Cycle 9.
