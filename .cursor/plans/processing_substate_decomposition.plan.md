---
name: Processing substate decomposition
overview: Refactor the agent pipeline so the top-level lifecycle stays small and the real semantic density lives in an orchestrator-owned processingSubstate with explicit transition boundaries. Fallback is reserved (not set in this refactor).
todos:
  - id: types
    content: Update ProcessingSubstate type in types.ts; remove generating, add loadingModel, awaitingFirstToken, streaming, validating; keep fallback in type only
    status: pending
  - id: orchestrator
    content: Add onModelLoadStart/onValidationStart; set substates at explicit boundaries; guard all callbacks; clear substate on all exit paths
    status: pending
  - id: rag-callbacks
    content: RAG ask.ts call onModelLoadStart before getChatContext; index.ts call onValidationStart before nudgeResponse
    status: pending
  - id: verify
    content: Confirm no code sets fallback; telemetry/panel display only
    status: pending
isProject: false
---

# Processing-State Decomposition Refactor Plan

## Explicit transition boundaries (implementation contract)

These definitions are the single source of truth for when each substate is entered and exited. Implement so that each transition happens at exactly the stated boundary.

- **loadingModel** — Model load/warmup only. Starts when RAG is about to await chat model load (e.g. `getChatContext()`). Ends when the model is ready and RAG is about to start completion/decode. Do not include prompt build or retrieval in this phase. On Ollama (no local model load), do not enter loadingModel; go directly from preparingContext to awaitingFirstToken.

- **awaitingFirstToken** — Completion has started, no visible output yet. Starts when RAG calls `onGenerationStart()` (decode/completion has been invoked). Ends when the first token is delivered (first `onPartial` call with non-empty text). No UI-visible output in this phase.

- **streaming** — First token received until completion ends. Starts when the orchestrator receives the first `onPartial(accumulatedText)` with `accumulatedText.length > 0`. Ends when the generation stream finishes (RAG’s completion returns); the orchestrator does not transition out of streaming until then (validating follows after RAG returns).

- **validating** — Post-generation nudge and cards-rules shaping only. Starts when RAG `ask()` calls `onValidationStart()` (after `runRagFlow()` returns, before `nudgeResponse()`). Ends when validation/nudge is done (when `ask()` returns to the orchestrator). No other work belongs in this substate.

- **settling** — Final commit and handoff only. Starts when `ragAsk()` has returned to the orchestrator with the same request id (nudged text and validationSummary in hand). Covers: setting response/validationSummary, emitting request_complete telemetry, clearing processingSubstate, and transitioning lifecycle to complete/speaking or idle. Ends when lifecycle is no longer `processing`.

- **fallback** — Reserved. Do not set in this refactor. Include `'fallback'` in the `ProcessingSubstate` type for future use. Only add code that sets `processingSubstate = 'fallback'` when a real degraded/alternate path exists (e.g. alternate provider or explicit fallback mode). No speculative or placeholder branches.

---

## Request-id guarding (stale completion safety)

All callback-driven substate transitions must be request-id guarded. Before any callback updates `processingSubstate`, it must check that the completion belongs to the active request (e.g. `if (activeRequestIdRef.current !== reqId) return;`). This ensures that stale async completions from an older request cannot move a newer request (or the idle state) into the wrong substate. Apply the guard in: `onRetrievalComplete`, `onModelLoadStart`, `onGenerationStart`, `onPartial` (first-token → streaming), and `onValidationStart`. The synchronous success path (when `ragAsk()` returns and we set settling then clear) already runs in the same request’s continuation and should still confirm `reqId === activeRequestIdRef.current` before committing.

---

## Clear processingSubstate on all exits from processing

`processingSubstate` must be cleared (`setProcessingSubstate(null)`) on every exit from `lifecycle === 'processing'`. Implement and verify all of the following:

- **Success** — After settling (commit, request_complete, handoff), before or as part of transitioning lifecycle to complete/speaking.
- **Failure** — In the catch block of the submit path, before setting lifecycle to error and clearing request state.
- **Cancel / interruption** — Any path that abandons or cancels the current request (e.g. user cancel, abort) must clear processingSubstate when leaving processing.
- **Superseded request** — When a newer request is accepted or the active request id is cleared due to supersession, ensure the exit path for the old request (or the transition into the new request) clears substate so the UI never shows a substate for a request that is no longer active. When ignoring a stale completion, do not update substate; if the active request has already changed, the code that clears state on the new request’s success/failure is responsible for keeping substate correct.

---

## Ollama / non-local paths (skip loadingModel)

Paths that do not load a local chat model (e.g. Ollama HTTP) must not enter the **loadingModel** substate. In those paths, RAG must not call `onModelLoadStart`. The transition from **preparingContext** goes directly to **awaitingFirstToken** when RAG calls `onGenerationStart()` (i.e. when the remote completion is about to start). Document this in the RAG layer: for Ollama (and any other non-local completion path), call `onGenerationStart()` when completion is about to begin, and do not call `onModelLoadStart()`. The orchestrator will then move from preparingContext → awaitingFirstToken without ever setting loadingModel.

---

## 1. Substate type and state shape

**Exact `ProcessingSubstate` type** ([src/app/agent/types.ts](src/app/agent/types.ts)):

```ts
export type ProcessingSubstate =
  | 'retrieving'
  | 'preparingContext'
  | 'loadingModel'
  | 'awaitingFirstToken'
  | 'streaming'
  | 'validating'
  | 'settling'
  | 'fallback';
```

- Remove `'generating'`. Do not add any substate not in this list.
- `fallback` is in the type only; no branch in this refactor sets it.
- `AgentOrchestratorState` and `processingSubstate: ProcessingSubstate | null` unchanged; still meaningful only when `lifecycle === 'processing'`.

**Where it lives:** Orchestrator-owned state in [src/app/agent/useAgentOrchestrator.ts](src/app/agent/useAgentOrchestrator.ts). No new state in VisualizationController or render layers.

---

## 2. Transition points (orchestrator)

| Substate | When set | When cleared / next |
|----------|----------|----------------------|
| **retrieving** | Start of `submit()`, after `setLifecycle('processing')` | When `onRetrievalComplete` runs → preparingContext |
| **preparingContext** | Inside `onRetrievalComplete` (guard: same request id) | When `onModelLoadStart` runs (→ loadingModel) or, on Ollama, when `onGenerationStart` runs (→ awaitingFirstToken) |
| **loadingModel** | Inside `onModelLoadStart` (guard: same request id) | When `onGenerationStart` runs → awaitingFirstToken |
| **awaitingFirstToken** | Inside `onGenerationStart` (guard: same request id) | When first `onPartial` with non-empty text → streaming |
| **streaming** | In `onPartial` when setting `firstChunkSentRef` and emitting first_token (guard: same request id) | When `ragAsk()` returns (same request id) → validating (via onValidationStart) then settling |
| **validating** | Inside `onValidationStart` (guard: same request id) | When `ragAsk()` returns → settling |
| **settling** | When `ragAsk()` has returned (same request id), before commit/telemetry/lifecycle | When `setProcessingSubstate(null)` and lifecycle leaves processing |
| **fallback** | Not set in this refactor | — |

**Clear (null):** See the section “Clear processingSubstate on all exits from processing” above. Every exit (success, failure, cancel/interruption, superseded request) must clear substate when leaving processing.

---

## 3. RAG layer callbacks (minimal)

- **runRagFlow (ask.ts):** Add `onModelLoadStart?: () => void`. Call it once immediately before awaiting `getChatContext()` in the vector and deterministic paths only. **Do not call on Ollama or any non-local path** — those paths skip loadingModel and go directly from preparingContext to awaitingFirstToken when `onGenerationStart()` is called (see “Ollama / non-local paths” above).
- **ask() (rag/index.ts):** Add `onValidationStart?: () => void`. After `runRagFlow()` returns, before `nudgeResponse()`, call `onValidationStart?.()`.

---

## 4. Orchestrator implementation

- **Request-id guarding:** Every callback that updates `processingSubstate` must guard with `if (activeRequestIdRef.current !== reqId) return;` so stale async completions cannot move a newer request into the wrong substate (see “Request-id guarding” above).
- **Clear on all exits:** Clear `processingSubstate` on success, failure, cancel/interruption, and when handling superseded request (see “Clear processingSubstate on all exits from processing” above).
- Replace current `setProcessingSubstate('generating')` with `setProcessingSubstate('awaitingFirstToken')` in `onGenerationStart`.
- Add `setProcessingSubstate('streaming')` in the `onPartial` branch where first token is detected.
- Pass `onModelLoadStart` and `onValidationStart` into `ragAsk`; set loadingModel and validating only in those callbacks.
- Do not add any code path that sets `processingSubstate` to `'fallback'`.

---

## 5. Telemetry and panel

- Emit `processing_substate` on every substate transition and when clearing. Request-debug store and Pipeline panel already consume it; no schema or layout change. New enum values display as-is.

---

## 6. File change summary

| File | Change |
|------|--------|
| [src/app/agent/types.ts](src/app/agent/types.ts) | Replace ProcessingSubstate union (remove generating; add loadingModel, awaitingFirstToken, streaming, validating; keep fallback in type only). |
| [src/app/agent/useAgentOrchestrator.ts](src/app/agent/useAgentOrchestrator.ts) | Wire onModelLoadStart, onValidationStart; set substates at boundaries above; never set fallback. |
| [src/rag/ask.ts](src/rag/ask.ts) | Add onModelLoadStart to RunRagFlowOptions; call before getChatContext() in vector and deterministic paths. |
| [src/rag/index.ts](src/rag/index.ts) | Add onValidationStart to AskOptions; call after runRagFlow() returns, before nudgeResponse(). |
| requestDebugTypes, requestDebugStore, PipelineTelemetryPanel, useVisualizationController | No structural changes. |
