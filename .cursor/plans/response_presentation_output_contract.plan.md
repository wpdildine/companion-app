---
name: Response presentation output contract
overview: **SUPERSEDED.** The canonical plan is response_presentation_contract_audit_e6d73690.plan.md. Do not implement from this file.
todos:
  - id: orchestrator-contract
    content: Add streamingText and committedResponse (and committedValidationSummary) to orchestrator state; set streamingText on onPartial; atomically set committedResponse + structured at settling
    status: pending
  - id: types
    content: Extend AgentOrchestratorState/types with streamingText and committedResponse (and committed structured); document contract in types or adjacent doc
    status: pending
  - id: overlay-passive
    content: ResultsOverlay derives display from props only (streamingText when streaming, committedResponse after settlement); no finality/settlement inference or buffering
    status: pending
  - id: logging
    content: Add ResponseSurface to LogScope; emit all required response_surface_* logs from orchestrator/controller with structured payloads
    status: pending
  - id: telemetry-debug
    content: Ensure request-debug store/snapshot supports response-surface fields; align partialStream/committedResponse in Pipeline panel
    status: pending
isProject: false
---

**SUPERSEDED.** This plan is deprecated. The canonical plan is [response_presentation_contract_audit_e6d73690.plan.md](.cursor/plans/response_presentation_contract_audit_e6d73690.plan.md). Do not implement from this file.

---

# Response Presentation / Output Contract — Implementation Plan (Revised)

## Architectural principle: single committed-response contract

### Recommended and required: two slots (streamingText + committedResponse)

The response surface must use **two distinct values**: one ephemeral streaming value and one committed final value. This is the **recommended and required** contract. A single `responseText` slot that holds both partial and final—with the overlay inferring meaning from lifecycle/substate—is exactly where UI drift can creep in (e.g. render treating “last value” as final, or inventing provisional vs authoritative from timing). Two explicit slots keep semantics in the orchestrator and render passive.

| Value | Meaning | When set / cleared |
|-------|--------|---------------------|
| **streamingText** | Ephemeral partial text. Display-only; not authoritative. | Set by orchestrator on each `onPartial(accumulatedText)` while `processingSubstate === 'streaming'`. Cleared or ignored once settlement happens. |
| **committedResponse** | Authoritative final response. | Set **once** by the orchestrator at **settlement** (when entering `settling` with nudged text and validationSummary). Used for display and for TTS. Persists until next request or explicit clear. |

**Structured results** (cards, rules, validationSummary) are tied to the **same settlement moment** as `committedResponse`. They are committed atomically with the final text.

### If one slot is retained (fallback only)

If the codebase keeps a **single** `responseText` slot instead of introducing `streamingText` + `committedResponse`, render **must** treat that one slot with the following **hard rules**. No inference, no drift:

- **Provisional only** when `processingSubstate === 'streaming'` — the value is partial; do not treat as final.
- **Frozen** during `processingSubstate === 'validating'` — show the last value but do **not** treat it as final; do not update from it.
- **Authoritative only** from settling onward (lifecycle left `processing` or substate has moved past validating) — the value is final; use it for display and assume TTS uses the same.

Violating these rules (e.g. treating streamed text as final because “it stopped updating”) introduces a hidden UI state machine and is out of scope.

---

**Rules (non-negotiable):**

- Render must **never** invent its own intermediate answer state.
- Render must **never** diff, merge, or reconcile partial text with final text.
- Partial text is display-only and ephemeral; it is **fully replaced** by `committedResponse` at settlement.
- No token-level patching, no “smart merge,” no heuristic finality in the UI.
- Speaking must use the **same** `committedResponse` the UI displays.
- After settlement, the UI reads **only** `committedResponse` (and committed structured results); it does not reason about prior partial text.
- If validation changes or trims text, `committedResponse` is the single source of truth.
- The render layer remains **passive**: it displays what it is given and derives from orchestrator-owned state or clearly defined surface props only.

---

## Response surface by phase

| Phase | What the surface shows | Source of truth |
|-------|------------------------|------------------|
| **awaitingFirstToken** | No visible answer text. Loading/placeholder only. | No `streamingText` yet; no committedResponse. |
| **streaming** | Show `streamingText` (accumulated partial). Updates as orchestrator pushes new accumulated values. | Orchestrator `streamingText` (from onPartial). |
| **validating** | Freeze/hold the **last** visible streaming text for display only. Do **not** treat it as final. | Same `streamingText` value, no longer updated. |
| **settling** | **Atomic commit:** Replace any displayed partial with `committedResponse`. Show committed cards/rules/validationSummary. | Orchestrator sets `committedResponse` and committed structured results once. |
| **speaking** | Continue showing `committedResponse` and structured results. TTS speaks `committedResponse`. | `committedResponse` + committed structured. |
| **idle (after speaking)** | **Surface collapses.** Response **data** remains in orchestrator state; the **response surface** returns to a concealed/collapsed state. The user must explicitly interact (tap, swipe, panel open) to reveal the stored result. No auto-expand when lifecycle returns to idle. | Data: `committedResponse` + committed structured persist in state. Visibility: concealed until user reveals. |

---

## Explicit replacement rule

- At settlement, **partial text is fully replaced** by `committedResponse`. There is no reconciliation step.
- **No** partial/final reconciliation logic in render.
- **No** token-level patching or incremental “final” application.
- **No** “smart merge” or diff-based update behavior in the UI.
- The orchestrator sets `committedResponse` once; the overlay switches from “show streamingText” to “show committedResponse” based on lifecycle/substate only.

---

## Explicit streaming update rule

- Streaming UI updates come **only** from the **existing accumulated partial callback/value** (the current `onPartial(accumulatedText)` that passes the full accumulated string).
- The surface must **not** introduce finer-grained token-by-token rendering (e.g. appending single tokens in the UI). It displays the accumulated string as provided.
- No new streaming protocol or token-level API for this phase.

---

## Empty / weak / truncated output — deterministic behavior

| Case | Behavior |
|------|----------|
| **Empty output** | When the model returns empty (or nudged is empty/whitespace): settlement **still occurs**. Orchestrator sets `committedResponse` to the empty string (or a sentinel) and commits. The surface must **not** be left in an ambiguous state: show an explicit outcome (e.g. “No answer generated”) when `committedResponse` is empty and we are past settlement. No playback when empty. |
| **Weak output** | No heuristic “quality” gate. Treat as normal output; `committedResponse` is whatever validation produced. Optional: log a simple disposition (e.g. `weakOutput: true` in telemetry) only if a minimal, explicit rule is added later (e.g. length threshold). Not required for this phase. |
| **Truncated / validation-changed output** | If validation trims or changes the text, **committedResponse is authoritative**. The UI shows only `committedResponse`. No attempt to show “what was streamed” vs “what was committed”; no reconciliation. Optional log: `response_surface_truncated_or_changed_by_validation` with `validationChangedOutput: true`. |

Settlement always produces an explicit outcome (success with content, success with empty, or failure). The surface never infers finality from timing.

---

## Structured-result timing — single rule

- Cards / rules / validationSummary do **not** appear:
  - during retrieving, preparingContext, loadingModel, awaitingFirstToken, or
  - during normal streaming.
- They appear **only at committed settlement**, in the same atomic step as `committedResponse`.
- No “streaming structured data” or early reveal of partial cards/rules for this phase. One deterministic rule: **structured results are committed only at settlement.**

---

## Response persistence vs. surface visibility

Two concepts must be kept separate:

1. **Response persistence (state)** — Orchestrator-owned data that remains stored after a request completes.
2. **Response surface visibility (UI)** — Whether the answer/cards/rules panels are shown or concealed.

The orchestrator keeps response data in state. The **UI surface** must not remain revealed by default after playback; it returns to a concealed/collapsed state. The user reveals it only through explicit interaction.

---

## Persistence contract

The following data **persists** after speaking (and after settlement):

- **committedResponse** (final settled response text)
- **validationSummary**
- **cards**
- **rules**

They remain stored until:

- a **new request** replaces them (or they are cleared when the new request starts),
- the **user dismisses** the response (if the product supports explicit dismiss), or
- the **orchestrator** clears them intentionally.

**However:** Persisted data must **not** remain visibly revealed by default. Stored data and visible panels are independent: data may exist while the surface is concealed.

---

## Response-surface visibility rule

**Response surface visibility is not tied directly to the presence of response data.**

- Response data **may exist** while the surface is **concealed**.
- The surface is **revealed only via explicit user interaction** (tap, swipe, panel open, reveal control).
- The UI **must not** auto-expand or auto-reveal when lifecycle returns to `idle` after playback.
- **Ownership:** **AgentSurface (composition)** owns revealed/hidden UI state—whether the response surface (answer/cards/rules panels) is shown or collapsed. **ResultsOverlay** remains **purely presentational**: it receives props and visibility state from the composition layer and renders; it does not own or decide revealed/hidden state. The orchestrator controls response data; the composition layer controls visibility; presence of response data must not automatically cause the surface to open. This avoids confusion during implementation and prevents the UI from drifting into an always-visible answer model.

---

## Post-speaking behavior (speaking → idle)

When TTS playback ends, **lifecycle** transitions from `speaking` to `idle`. The final settled response remains **stored** in orchestrator state, but the **response surface collapses or conceals itself**. The user must explicitly interact with the UI to reveal the stored result.

Summary:

- **Data:** `committedResponse`, validationSummary, cards, rules persist in state (per persistence contract).
- **Visibility:** Surface returns to concealed/collapsed; no auto-expand on idle.
- **Reveal:** Only via explicit user interaction (tap, swipe, panel open).

---

## New-request behavior

When a **new request** begins:

- The **previous** stored response may either be **cleared immediately** (at request start) or **replaced once the new request settles**. Implementation may choose either; the plan does not mandate which.
- The **previous response must never remain passively revealed on screen**. If the surface was revealed for the prior answer, it must be concealed (or the revealed state reset) when the new request starts, so the user is not left looking at stale content. The new request then controls when/if the surface is revealed (e.g. during streaming or after settlement, per product UX).

---

## Architectural rule: visibility vs. data

- **AgentSurface/composition** owns **revealed/hidden UI state** (whether the response surface is shown or collapsed). When playback ends, composition collapses the surface (e.g. resets revealed state); it does not leave the panel open.
- **ResultsOverlay** is **purely presentational**: it receives content and visibility from composition and renders; it does not own or infer visibility state.
- The **orchestrator** controls **response data** (streamingText, committedResponse, validationSummary).
- **The presence of response data must not automatically cause the response surface to open.** Data can exist while the surface is concealed. This prevents the UI from drifting into an always-visible answer model.

---

## Future capability: Replay last spoken response

The system must support **replaying** the last committed response without re-running generation. Replay uses the stored committed response from the most recent completed request.

**Contract:**

- **Source:** Replay uses `committedResponse` (or the single-slot equivalent `responseText`) — the same stored final text that was spoken.
- **No RAG/generation:** Replay does **not** trigger RAG, retrieval, or generation. It is playback-only.
- **TTS:** Replay calls the **same TTS pipeline** used during normal speaking (e.g. `playText(committedResponse)` or equivalent).
- **When allowed:** Replay is **only allowed** when `lifecycle === 'idle'`. Block or no-op if lifecycle is listening, processing, or speaking.
- **Visibility:** Replay **does not** automatically reveal the response surface. If the surface is concealed, it stays concealed unless the user explicitly reveals it. Replay only affects audio playback.
- **UI:** Implementation may later add a UI control (e.g. replay button) to trigger replay. The plan does not mandate where or when that control appears.

This keeps replay consistent with the committed-response contract and avoids re-running the pipeline.

---

## Overlay responsibilities (render layer)

- The overlay **may branch on explicit orchestrator-owned props** (e.g. lifecycle, processingSubstate, responseText, validationSummary) to choose presentation (e.g. loading vs content, which panel to show). That is fine.
- The overlay **may not** infer hidden response phases or invent its own settlement logic. It must not derive finality from timing, buffer/merge partial with final, or treat "text stopped updating" as "now final."
- All "what to show" decisions come from **orchestrator-owned state** or **explicit surface props** defined by the contract. No hidden state machine in render.


---

## Milestone → response-surface mapping (implementation)

| Milestone / substate | Orchestrator action | Surface display |
|----------------------|--------------------|-----------------|
| **awaitingFirstToken** | No streamingText. No committedResponse. | No visible answer text; loading/placeholder. |
| **streaming** | Set `streamingText` on each onPartial(accumulatedText). | Show streamingText (accumulated only). |
| **validating** | Stop updating streamingText; do not set committedResponse yet. | Freeze last streamingText; do not treat as final. |
| **settling** | **Atomically** set `committedResponse` + committed cards/rules/validationSummary. Clear streamingText or mark it irrelevant. | Replace any partial with committedResponse; show structured results. |
| **Playback start** | TTS receives committedResponse. | Continue showing committedResponse. |
| **Playback end** (→ idle) | No state change to response data; data persists. Orchestrator (or controller) signals playback complete. | **Surface collapses/conceals.** Data remains in state; user must explicitly reveal to see it again. |
| **Next request start** | Clear/reset streamingText (and optionally committedResponse/structured for new run). Previous response must not stay revealed. | Surface concealed if it was open; show loading/new partial for new request when surface is shown. |

---

## Logging and telemetry (required, filterable)

Use the **existing** logging pattern ([src/shared/logging/logger.ts](src/shared/logging/logger.ts)): `logInfo` / `logLifecycle` / `logWarn` with a **stable scope** and **structured details**. Add a scope for response-surface events so logs are filterable (e.g. via `__LOG_SCOPES__` or grep on `[ResponseSurface]`).

- **Add** `ResponseSurface` to the `LogScope` type in [src/shared/logging/logger.ts](src/shared/logging/logger.ts).
- **Emit** all response-surface milestone logs from **orchestrator (or controller)** code only—**not** from render/overlay components. This keeps ownership and filterability consistent.

**Required events** (message / category consistent; use `logInfo('ResponseSurface', message, details)` or `logLifecycle` where appropriate):

| Event (message) | When to emit | Recommended payload |
|-----------------|---------------|----------------------|
| **response_surface_streaming_started** | First onPartial with non-empty text (substate → streaming). | `requestId`, `lifecycle`, `processingSubstate`, `partialChars` |
| **response_surface_partial_updated** | Each onPartial during streaming (throttled if needed to avoid log flood). | `requestId`, `lifecycle`, `processingSubstate`, `partialChars` |
| **response_surface_streaming_frozen_for_validation** | When substate → validating (streaming text no longer updated). | `requestId`, `lifecycle`, `processingSubstate`, `partialChars` (last value) |
| **response_surface_committed** | At settlement when committedResponse (and structured) are set. | `requestId`, `lifecycle`, `processingSubstate`, `committedChars`, `rulesCount`, `cardsCount` |
| **response_surface_structured_results_committed** | Same moment as committed; can be one log or combined with response_surface_committed. | `requestId`, `rulesCount`, `cardsCount`, `validationSummary` (or counts only) |
| **response_surface_empty_output** | When settlement commits with empty committedResponse. | `requestId`, `lifecycle`, `reason` or `disposition: 'empty'` |
| **response_surface_truncated_or_changed_by_validation** | When validation changed/trimmed text vs last streamed (optional but recommended). | `requestId`, `validationChangedOutput: true`, `committedChars` |
| **response_surface_playback_bound_to_committed_response** | When playText(committedResponse) is invoked (TTS start). | `requestId`, `speakingBoundToCommittedResponse: true`, `committedChars` |
| **response_surface_concealed_after_playback** | When lifecycle transitions speaking → idle; surface collapses/conceals. | `requestId`, `lifecycle`, `reason: 'playbackComplete'` |
| **response_surface_revealed_by_user** | When the user explicitly reveals the response surface (tap, swipe, panel open). | `requestId`, `lifecycle`, `reason: 'userReveal'` |
| **response_surface_hidden_on_new_request** | When a new request starts and the surface is concealed (or revealed state reset) so prior response is not passively shown. | `requestId`, `lifecycle`, `reason: 'newRequestStart'` |

**Payload conventions:**

- Always include `requestId` when in a request context.
- Use the same `LogDetails` shape: `Record<string, unknown> & { requestId?: number }`.
- Suggested keys: `requestId`, `lifecycle`, `processingSubstate`, `partialChars`, `committedChars`, `rulesCount`, `cardsCount`, `validationChangedOutput`, `speakingBoundToCommittedResponse`, `reason` (e.g. `'playbackComplete'`, `'userReveal'`, `'newRequestStart'`), `disposition`.
- Filter in console/debug by scope: `[ResponseSurface]` or by enabling only `ResponseSurface` in `__LOG_SCOPES__`.

Do not introduce ad hoc `console.log` strings; use the shared logger and stable message strings so tooling can filter consistently.

---

## Request-debug / Pipeline panel alignment

- Ensure the request-debug store (and snapshot type) can represent **streaming** vs **committed** explicitly (e.g. `partialStream` updated from accumulated partial; `finalSettledOutput` or `committedResponse` set at settlement).
- **Explicit mapping required:** When handling `partial_output` events, the store must set **partialStream** from the payload (e.g. `snapshot.partialStream = payload.accumulatedText`). Otherwise observability drifts from the UI contract—the panel would not show what the surface actually displayed as streaming text. Settlement payloads must set `finalSettledOutput` / `committedResponse` and validationSummary. Pipeline panel already shows these; ensure they reflect the two-slot contract.
- No requirement to add a full “response surface state machine” to the panel; only that telemetry and snapshot stay consistent with the two-value model.

---

## Minimal affected files

| Area | Files |
|------|--------|
| **Orchestrator** | [src/app/agent/useAgentOrchestrator.ts](src/app/agent/useAgentOrchestrator.ts) — introduce `streamingText` and `committedResponse` (and committed structured); set streamingText in onPartial; atomically set committed* at settling; emit all ResponseSurface logs. |
| **Types** | [src/app/agent/types.ts](src/app/agent/types.ts) — extend `AgentOrchestratorState` with `streamingText`, `committedResponse`, and committed validationSummary (or equivalent); document contract in comments. |
| **Logging** | [src/shared/logging/logger.ts](src/shared/logging/logger.ts) — add `ResponseSurface` to `LogScope`. |
| **Overlay** | [src/app/agent/ResultsOverlay.tsx](src/app/agent/ResultsOverlay.tsx) — **purely presentational**: receives content (responseText/streamingText/committedResponse, validationSummary) and visibility/revealed state from composition; branches on explicit props only; no ownership of revealed/hidden state, no inference of settlement or hidden phases. |
| **Composition** | [src/app/agent/AgentSurface.tsx](src/app/agent/AgentSurface.tsx) — **owns revealed/hidden UI state** for the response surface. Passes content and revealed state to ResultsOverlay. When lifecycle transitions speaking → idle, collapses the surface (resets revealed state). Reveal only on explicit user interaction. ResultsOverlay never decides visibility on its own. |
| **Request debug** | [src/app/agent/requestDebugStore.ts](src/app/agent/requestDebugStore.ts), [src/app/agent/requestDebugTypes.ts](src/app/agent/requestDebugTypes.ts) — ensure snapshot supports partialStream and committedResponse/finalSettledOutput; [PipelineTelemetryPanel](src/app/agent/PipelineTelemetryPanel.tsx) — no second state machine; display already aligns with snapshot. |

Keep the phase narrow: do not redesign the rest of the UI architecture; only implement the contract and logging in these areas.

---

## Risks and follow-ups

- **Partial-output render churn (keep visible):** Many `onPartial` calls during streaming cause frequent state updates when showing `streamingText`. Re-renders can be significant on low-end devices. Rely on React’s batching first; throttle only the **log** (`response_surface_partial_updated`), not the state update, unless profiling shows a need. Revisit if UX or performance demands (e.g. capped update rate) later.
- **Debug-store / observability drift:** The request-debug store must map `partial_output` payloads into the snapshot field **partialStream** explicitly. If the store only merges generic payload keys (e.g. `accumulatedText`), the snapshot’s `partialStream` will not reflect the UI contract and Pipeline panel observability will drift from what the surface actually shows. **Required:** when handling `type === 'partial_output'`, set `snapshot.partialStream = payload.accumulatedText` (or equivalent) so streaming vs committed is inspectable in the panel.
- **Backward compatibility:** During rollout, ensure any existing consumers of `responseText` are migrated to `streamingText` / `committedResponse` so nothing reads “final” from the old single field before settlement.

---

## Summary

- **Two values only:** `streamingText` (ephemeral) and `committedResponse` (authoritative at settlement). Structured results committed with committedResponse.
- **Replacement:** Partial is fully replaced at settlement; no merge, no patching, no smart reconciliation in render.
- **Streaming:** Updates from accumulated partial only; no per-token UI.
- **Empty/weak/truncated:** Defined deterministic behavior; settlement always has an explicit outcome; committedResponse wins if validation changed text.
- **Structured results:** Only at committed settlement; single rule.
- **Post-speaking:** Response **data** persists in state; **surface** collapses after playback. Visibility is user-controlled (explicit reveal only); presence of data must not auto-open the surface. New request must not leave prior response passively revealed.
- **Overlay:** May branch on explicit orchestrator-owned props; may not infer hidden response phases or invent settlement logic. AgentSurface/composition owns revealed/hidden UI state; ResultsOverlay is purely presentational.
- **Logging:** ResponseSurface scope; all required events from orchestrator/controller with structured, filterable payloads.
- **Replay (future):** Replay last spoken response using stored committedResponse; no RAG/generation; same TTS pipeline; allowed only when lifecycle === idle; does not auto-reveal surface; UI control may be added later.
