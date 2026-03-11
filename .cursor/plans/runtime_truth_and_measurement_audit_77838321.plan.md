---
name: Runtime Truth and Measurement Audit
overview: A narrow implementation pass that audits and tightens telemetry, model lifecycle observability, and debug-panel alignment so runtime behavior is trustworthy and inspectable. No new state ownership, no lifecycle expansion, no product behavior change.
todos: []
isProject: false
---

# Runtime Truth and Measurement Audit

## 1. Goal

Make runtime behavior **trustworthy and inspectable** by:
- Auditing telemetry coverage against actual runtime phases and aligning event boundaries with orchestrator semantics
- Tightening timing derivation (retrieval, context prep, model load, TTFT, streaming, validation, settling, playback, total)
- Distinguishing cold vs warm model load and clarifying whether model/context/session is reused per request
- Refining the debug/telemetry panel so lifecycle, processingSubstate, requestId, model activity, timings, and settlement are easy to inspect
- Resolving or explicitly labeling snapshot-vs-live lifecycle mismatches
- Adding fields needed to debug Android TTFT and iOS transcript clipping (observational only)

All work remains **observational**: requestDebugStore and the panel stay read-only; AgentOrchestrator remains the single source of durable runtime truth.

---

## 2. Current State

**Canonical top-level lifecycle:** The plan and this chunk treat the following as the **canonical** lifecycle only: **idle**, **listening**, **processing**, **speaking**, **error**. The value **failed** may still appear in legacy telemetry, old snapshots, comments, or labels; this plan does **not** treat **failed** as a desired canonical lifecycle state. This chunk must not deepen or formalize **failed** semantics. Where telemetry or UI still reference **failed**, treat it as legacy for the purpose of this audit; do not add new **failed** transitions or snapshot semantics.

**Orchestrator** ([src/app/agent/useAgentOrchestrator.ts](src/app/agent/useAgentOrchestrator.ts)): Owns lifecycle and `processingSubstate` (only when `lifecycle === 'processing'`). Emits to `requestDebugSinkRef` for: `request_start`, `retrieval_start`, `retrieval_end`, `generation_start`, `processing_substate`, `first_token`, `partial_output`, `generation_end`, `response_settled`, `request_complete`, `request_failed` (terminal request telemetry event only; not a lifecycle value), `tts_start`, `tts_end`.

**Semantic gap:** Orchestrator emits `retrieval_end` **after** pack init and **before** `ragAsk()`. So “retrieval” in the store is effectively **pack/session/context-source readiness**, not “context bundle ready”. Actual getContext + prompt build runs inside `ragAsk()`; `onRetrievalComplete()` runs after that (orchestrator sets `preparingContext`). RAG emits `rag_retrieval_complete` with a timestamp; the store should persist it for derivation of context-ready timing.

**RAG** ([src/rag/ask.ts](src/rag/ask.ts), [src/rag/index.ts](src/rag/index.ts)): Deterministic path: getContext → buildPrompt → `onRetrievalComplete()` → `onModelLoadStart()` → `getChatContext()` (cached after first load) → `onGenerationStart()` → completion (streaming). No explicit “cold vs warm” flag is emitted today. Validation runs in `ask()` after `runRagFlow` returns via `onValidationStart()` then `nudgeResponse()`.

**Store** ([src/app/agent/requestDebugStore.ts](src/app/agent/requestDebugStore.ts), [src/app/agent/requestDebugTypes.ts](src/app/agent/requestDebugTypes.ts)): Merges payloads into per-request snapshots. Snapshot `lifecycle` is initialized to `'idle'` and never updated from events; snapshot and live orchestrator lifecycle can diverge. `request_complete` payload includes `completedAt` and `status`; `totalRequestMs` is derived when `completedAt` is set.

**Panel** ([src/app/agent/PipelineTelemetryPanel.tsx](src/app/agent/PipelineTelemetryPanel.tsx)): Read-only; consumes `RequestDebugState` only. Does not show lifecycle; does not show model cold/warm or context-ready timing.

---

## 3. Architectural Constraints / Invariants to Preserve

- **Canonical lifecycle** remains exactly: **idle**, **listening**, **processing**, **speaking**, **error**. Do not add or formalize **failed** as a canonical state. **request_failed** is a terminal request-failure telemetry event (and request outcome status), not a lifecycle value; when it is emitted, the payload carries lifecycle `'error'`. Any **failed** that appears in legacy telemetry, snapshots, or labels is legacy; do not add new snapshot or event semantics for **failed**.
- **AgentOrchestrator** owns all durable runtime truth; no new state machines; top-level lifecycle stays minimal.
- **processingSubstate** exists only when `lifecycle === 'processing'`.
- **Single response slot**: `responseText` only; no dual partial/final slots.
- **Debug/telemetry**: Observational only; never operational source of truth. Panel and store remain read-only.
- **VisualizationController** observes orchestrator and emits transient events only; does not own pipeline state.
- **Render layers** stay passive; no inferring phases or finality from timing data.
- **TTS** speaks only committed response text; **response_settled** is the authoritative final-answer commit boundary.
- **All async callbacks** remain requestId-guarded.

---

## 4. Exact Telemetry and Runtime Events — Authoritative Boundaries

**Contract for request completion and playback:**

- **response_settled** = authoritative final answer commit boundary (committed response + validationSummary + settlement telemetry). It is **not** the same as request completion.
- **tts_start** = playback begins (TTS speak starts).
- **tts_end** = playback ends (TTS finished or cancelled).
- **request_complete** = full request lifecycle complete. It is **not** synonymous with response_settled. **request_complete must NOT fire at response_settled.** Exactly one of:
  - After **tts_end** when playback occurred (speaking path), or
  - After the non-speaking terminal path when playback does not occur (e.g. empty output or error before playback).
- Snapshot lifecycle at **request_complete** must reflect the **real** orchestrator lifecycle at that event time (e.g. idle after playback ended, or idle after terminal non-speaking path), not a guessed terminal lifecycle. If playback occurred, lifecycle at request_complete is the state after tts_end (idle).

**Authoritative Runtime Boundary Table**

| Event | Owner / emitter | Exact meaning | Authoritative / derived |
|-------|-----------------|---------------|-------------------------|
| request_accept / request_start | Orchestrator | Request accepted; submit() set requestId, mode processing. | Authoritative |
| retrieval_start | Orchestrator | Start of pack/session/context-source work (before init or ragAsk). | Authoritative |
| retrieval_end | Orchestrator | Pack/session/context-source readiness; before ragAsk(). | Authoritative |
| context_ready | RAG | Context bundle and prompt ready (rag_retrieval_complete). | Derived (RAG event) |
| model_load_start | RAG | Immediately before getChatContext() (or equivalent). | Derived |
| model_load_end | RAG | After getChatContext() returns; may include cold flag. | Derived |
| generation_start | Orchestrator | Start of generation phase as exposed by orchestrator (ask path). | Authoritative |
| first_token | Orchestrator | First onPartial(accumulatedText) with length > 0; single fire per request. | Authoritative |
| generation_end | Orchestrator | When ragAsk() returns; generationEndedAt at return. | Authoritative |
| validation_start | Orchestrator | Substate becomes validating; onValidationStart. | Authoritative |
| validation_end | Orchestrator | Validation done; substate leaves validating (e.g. to settling). | Authoritative |
| settling_start | Orchestrator | Substate becomes settling; commit phase for final response + validationSummary. | Authoritative |
| response_settled | Orchestrator | Authoritative final answer commit boundary; settlement telemetry. | Authoritative |
| tts_start | Orchestrator | Playback begins. | Authoritative |
| tts_end | Orchestrator | Playback ends. | Authoritative |
| request_complete | Orchestrator | Full request lifecycle complete (after tts_end or after non-speaking terminal path). | Authoritative |
| request_failed | Orchestrator | Terminal request-failure telemetry event; request outcome status. Lifecycle at that point is **error**. Not a lifecycle value. | Authoritative (telemetry only) |

**Validation timing (required):** This chunk **requires** explicit validation boundaries and derived metric. Add **validation_start** (when substate becomes `validating`) and **validation_end** (when substate leaves validating, e.g. when entering settling). Add derived **validationMs**. Required for runtime truth; cannot be deferred in this audit. **Implementation:** Emit **validation_end** at the actual transition point (e.g. when setting processingSubstate to `'settling'`), not at an inferred or derived moment.

**Settling timing (explicit):** Settling is distinct from validation. It is the orchestrator commit phase for final response + validationSummary + settlement telemetry. Add:
- **settlingStartedAt** (when substate becomes `settling`)
- **responseSettledAt** (at response_settled event)
- **settlingMs = responseSettledAt − settlingStartedAt**
Even if settling is brief, it is a measurable phase in this audit.

**Orchestrator payload lifecycle:** Include `lifecycle` in payloads so snapshot reflects orchestrator-emitted lifecycle at event time. Snapshot lifecycle must not be guessed from terminal events alone. Emit lifecycle on: **request_start**, **tts_start**, **tts_end**, **request_complete**, **request_failed** (telemetry event only; when emitted, payload carries lifecycle `'error'`—the event itself is not a lifecycle value), and any other existing event that carries authoritative lifecycle. Values: request_start → `'processing'`; tts_start → `'speaking'`; tts_end → `'idle'`; request_complete → `'idle'`; request_failed → `'error'`. **Implementation caution:** Emit **request_start** only after the request is truly accepted; otherwise snapshot lifecycle will look cleaner than the real admission path. Optionally include `lifecycle: 'processing'` in **processing_substate** payloads.

---

## 5. Canonical Timing Boundaries and Derived Metrics (Fixed Formulas)

**Single-choice formulas (no alternatives):**

- **retrievalMs** = retrievalEndedAt − retrievalStartedAt  
  (retrieval end = pack/session/context-source readiness boundary already defined.)

- **contextPrepMs** = contextReadyAt − retrievalEndedAt  
  (contextReadyAt = timestamp of rag_retrieval_complete for the request.)

- **modelLoadMs** = modelLoadEndAt − modelLoadStartAt  
  (when RAG emits model_load_start and model_load_end.)

- **ttftFromAskStartMs** = firstTokenAt − generationStartedAt  
  (TTFT from orchestrator generation_start = “ask start”.)

- **ttftFromInferenceStartMs** = firstTokenAt − inferenceStartedAt  
  (Only when inferenceStartedAt is available from RAG; optional derived.)

- **streamingMs** = generationEndedAt − firstTokenAt

- **validationMs** = validationEndedAt − validationStartedAt  
  (Required; validation_start and validation_end boundaries above.)

- **settlingMs** = responseSettledAt − settlingStartedAt

- **playbackMs** = ttsEndedAt − ttsStartedAt

- **totalRequestMs** = completedAt − requestStartedAt  
  (completedAt = timestamp at request_complete.)

**Distinction:** Authoritative orchestrator **generation_start** = start of generation phase (ask path). Optional derived **inference start** = when the local model layer actually begins decoding (if exposed by RAG). The panel and debug model must not blur the two. Use unambiguous labels: **“TTFT (from ask start)”** and **“TTFT (from inference start)”** when inference-start timing is available. Do not present them as the same metric unless instrumentation actually proves they are identical.

**Derived Metrics Table**

| Metric | Exact formula |
|--------|----------------|
| retrievalMs | retrievalEndedAt − retrievalStartedAt |
| contextPrepMs | contextReadyAt − retrievalEndedAt |
| modelLoadMs | modelLoadEndAt − modelLoadStartAt |
| ttftFromAskStartMs | firstTokenAt − generationStartedAt |
| ttftFromInferenceStartMs | firstTokenAt − inferenceStartedAt (when available) |
| streamingMs | generationEndedAt − firstTokenAt |
| validationMs | validationEndedAt − validationStartedAt |
| settlingMs | responseSettledAt − settlingStartedAt |
| playbackMs | ttsEndedAt − ttsStartedAt |
| totalRequestMs | completedAt − requestStartedAt |

---

## 6. Model Lifecycle Audit Plan

- **Reuse vs rebuild:** getChatContext/getEmbedContext return cached context if non-null; model/context is reused after first load. Session is process lifetime.
- **Cold vs warm:** RAG emits a flag (e.g. in rag_generation_request_start or rag_model_load_end) when chat context was loaded vs cached; store merges into snapshot (e.g. modelLoadCold). Same for embed on vector path if needed.
- **Init vs per-request:** ragInit() only when !getPackState(); pack state and file reader reused. No per-request rebuild unless app reinitializes.
- **Android TTFT:** Ensure ttftFromAskStartMs is present; optionally ttftFromInferenceStartMs and modelLoadCold for breakdown. Panel shows **platform** (debug-only, see below) for Android vs iOS comparison.

---

## 7. Observability / Panel Refinement Plan

- **Snapshot lifecycle:** Merge `lifecycle` from request_start, tts_start, tts_end, request_complete, request_failed, and optionally processing_substate. Snapshot lifecycle = orchestrator-emitted lifecycle at event time.
- **Panel sections:** Add lifecycle (from snapshot). Add Performance rows with fixed formulas: retrievalMs, contextPrepMs, modelLoadMs, ttftFromAskStartMs, ttftFromInferenceStartMs (if available), streamingMs, validationMs, settlingMs, playbackMs, totalRequestMs. Labels: “TTFT (from ask start)” and “TTFT (from inference start)” to avoid ambiguity.
- **request_complete vs response_settled:** Panel and docs must make clear that request_complete is the terminal request boundary (after playback or non-speaking path); response_settled is the commit boundary only.

---

## 8. Snapshot vs Live-State Reconciliation Plan

- **Cause of mismatch:** Snapshot lifecycle was never updated from events.
- **Fix:** Orchestrator includes lifecycle in the events listed in section 4; store merges into snapshot. Snapshot reflects orchestrator-emitted lifecycle at event time; not guessed from terminal events alone. Include tts_start (speaking) and tts_end (idle) so speaking phase is tracked.

---

## 9. Debug-Only Platform Field

Add to request debug snapshot shape:
- **platform**: `'ios' | 'android'`

Clarify: observability/comparison only; not durable orchestrator runtime state; belongs only in the debug snapshot/store layer (e.g. set once per request or at emit time from Platform.OS).

---

## 10. Transcript-Clipping Observability

**Preferred:** If the relevant fields already exist or are easily exposed without architecture expansion, the debug snapshot may include speech-pipeline observability fields (observational only; not part of processingSubstate or core lifecycle):
- speech stop requested timestamp
- native stop completed timestamp
- transcript settled timestamp
- transcript length / word count
- speechEnded / finalization state if already available
- tail-grace or deferred-finalization marker if already available

Label these as: **speech-pipeline observability only**, **observational only**, **not part of processingSubstate or core lifecycle expansion**.

**If** those fields are not already available or would expand scope too much, **explicitly DEFER** transcript-clipping observability to a later speech-pipeline pass: state so in the plan and in code comments / plan-aligned notes; do not leave this ambiguous or imply it exists.

---

## 11. File-by-File Change Summary

- **[src/app/agent/useAgentOrchestrator.ts](src/app/agent/useAgentOrchestrator.ts)**  
  - Emit **request_start** only after the request is truly accepted (so snapshot lifecycle matches the real admission path).
  - Add `lifecycle` to payloads: request_start → `'processing'`; tts_start → `'speaking'`; tts_end → `'idle'`; request_complete → `'idle'`; request_failed → `'error'` (request_failed is a telemetry event only; the payload carries lifecycle for snapshot). Optionally processing_substate → `'processing'`.  
  - Emit **validation_start** (timestamp when entering validating) and **validation_end** (timestamp at the actual transition—e.g. when setting substate to settling—not inferred).  
  - Emit **settling_start** (timestamp when entering settling); **response_settled** already exists; ensure **request_complete** is emitted at the correct boundary: after tts_end when playback occurred, or after non-speaking terminal path when playback does not occur.  
  - No change to canonical lifecycle set (idle, listening, processing, speaking, error). Do not formalize **failed**.

- **[src/app/agent/requestDebugTypes.ts](src/app/agent/requestDebugTypes.ts)**  
  - Add to snapshot: contextReadyAt; modelLoadStartAt, modelLoadEndAt, modelLoadCold; inferenceStartedAt (optional); validationStartedAt, validationEndedAt; settlingStartedAt, responseSettledAt; **platform**: 'ios' | 'android'.  
  - Add to RequestDebugDurations: contextPrepMs, modelLoadMs, ttftFromAskStartMs, ttftFromInferenceStartMs (optional), streamingMs, validationMs, settlingMs, playbackMs, totalRequestMs (all with fixed formulas).

- **[src/app/agent/requestDebugStore.ts](src/app/agent/requestDebugStore.ts)**  
  - Merge lifecycle from request_start, tts_start, tts_end, request_complete, request_failed (event only; payload carries lifecycle `'error'`), processing_substate. On recoverable_failure, merge at most lastRecoverableFailureReason and timestamp; nothing more.  
  - On rag_retrieval_complete set contextReadyAt. On RAG model load events set modelLoadStartAt, modelLoadEndAt, modelLoadCold; on rag_generation_request_start (or inference event) set inferenceStartedAt if present.  
  - Merge validation_start/validation_end, settling_start, response_settled timestamps.  
  - deriveDurations: implement all formulas from Derived Metrics Table (single-choice).  
  - Set platform on snapshot from payload or Platform when emitting (debug-only).

- **[src/rag/ask.ts](src/rag/ask.ts)**  
  - Emit model load start/end and modelLoadCold; optional inference_start if before completion().  
  - No change to control flow or caching.

- **[src/app/agent/PipelineTelemetryPanel.tsx](src/app/agent/PipelineTelemetryPanel.tsx)**  
  - Display snapshot lifecycle; Performance section with all derived metrics and labels “TTFT (from ask start)” / “TTFT (from inference start)”; platform when present.  
  - Clarify request_complete vs response_settled in labels or tooltip if needed.

- **Transcript-clipping:** Either add snapshot fields and merge (if already available or trivial to expose) or explicitly defer to a later speech-pipeline pass and document in plan.

---

## 12. Validation / Verification Checklist

- [ ] Canonical lifecycle values in use: idle, listening, processing, speaking, error only; no new formalization of failed.
- [ ] request_complete emitted after tts_end when playback occurred, or after non-speaking terminal path; request_complete ≠ response_settled.
- [ ] validation_start and validation_end emitted; validationMs derived.
- [ ] settling_start and response_settled timestamps; settlingMs derived.
- [ ] All derived metrics use the single-choice formulas from the Derived Metrics Table.
- [ ] Snapshot lifecycle updated on request_start, tts_start, tts_end, request_complete, request_failed; reflects orchestrator at event time.
- [ ] Panel labels: “TTFT (from ask start)” vs “TTFT (from inference start)”.
- [ ] platform in snapshot (debug-only). Transcript-clipping either included (if existing/trivial) or explicitly deferred.

---

## 13. Risks and Anti-Overreach Notes

- Do not add or formalize **failed** as canonical lifecycle.
- Do not make request_complete synonymous with response_settled; implement request_complete at correct boundary (after playback or non-speaking terminal).
- Keep validation and settling timing required and explicit.
- Do not add new telemetry service, state manager, or panel system; do not expand top-level lifecycle; keep debug/telemetry observational only.

---

## 14. Recommended Implementation Sequence

1. **Types and store:** Extend RequestDebugSnapshot and RequestDebugDurations with all new timestamp and duration fields (fixed formulas). Merge lifecycle, validation_start/end, settling_start, response_settled, contextReadyAt, model load, platform.
2. **Orchestrator:** Emit lifecycle on request_start, tts_start, tts_end, request_complete, request_failed, (optional) processing_substate. Emit validation_start, validation_end, settling_start. Ensure request_complete at correct boundary (after tts_end or non-speaking terminal).
3. **RAG:** Emit model load start/end and modelLoadCold; optional inference_start.
4. **Panel:** Lifecycle, all duration rows with fixed formulas and unambiguous TTFT labels, platform.
5. **Transcript-clipping:** Include snapshot fields if already available or trivial; otherwise explicitly defer and document.
6. **Verification:** Run checklist; confirm no formalization of failed and no operational use of debug state.

---

## 15. Corrective Implementation Instructions (Remaining Issues)

These items must be addressed in implementation; the plan is updated so an implementation agent can apply them literally.

### 15.1 Terminal request event semantics

- **request_complete** is emitted only at the true terminal request boundary:
  - after **tts_end** if playback occurred, or
  - after the non-speaking terminal path if playback did not occur.
- **request_complete must NOT fire at response_settled.**

### 15.2 Remove / tighten legacy failure semantics

Audit remaining code, debug store, telemetry payloads, panel labels, and request status handling for legacy wording or assumptions around:
- **failed** lifecycle (do not use as canonical lifecycle; do not add new semantics for it).
- **complete** lifecycle (do not use as a lifecycle state; request outcome "completed" is status, not lifecycle).
- **request_failed** being confused with lifecycle (request_failed is a terminal request-failure **telemetry event / request outcome status only**; it is not a lifecycle value; lifecycle at that point is **error**).
- Recoverable failures being confused with terminal request failure.

Required behavior:
- **error** is the only fatal lifecycle state.
- Recoverable denials / recoverable recognition failures remain non-terminal events.
- Recoverable failures must not emit terminal request failure (request_failed) unless they truly terminate the request as an error path.

### 15.3 Recoverable failure / denial observability

Keep narrow and observational. Represent recoverable failures consistently as **event-level** debug semantics, not state semantics.

Desired separation:
- **softFail** = visualization transient (e.g. TRANSIENT_SIGNAL_SOFT_FAIL); not a lifecycle state.
- Recoverable denial / recoverable failure = telemetry/debug **event** semantics (e.g. recoverable_failure event).
- **error** = fatal lifecycle.

Store at most **lastRecoverableFailureReason** and a **timestamp** (e.g. lastRecoverableFailureAt). Nothing more; anything else drifts toward the later error-taxonomy chunk. Do not create a new state machine or taxonomy system.

### 15.4 Snapshot lifecycle alignment

Request debug snapshot lifecycle must be updated from authoritative orchestrator events and must correctly reflect:
- **processing** at request_start
- **speaking** at tts_start
- **idle** at tts_end
- **idle** at request_complete on terminal success path
- **error** only on true fatal error path (e.g. when request_failed is emitted—that event carries lifecycle `'error'`; the event itself is telemetry only, not a lifecycle value).

Do not infer lifecycle from guessed terminal states; use only lifecycle values emitted with the events above.

### 15.5 Validation and settling timing (fully implemented)

Ensure these are fully implemented, not partial:
- **validation_start** (with timestamp when substate becomes validating)
- **validation_end** (with timestamp at the actual transition point, e.g. when setting substate to settling—not inferred)
- **settling_start** (with timestamp)
- **response_settled** (with timestamp; responseSettledAt)

Derived durations must exist and use fixed formulas:
- **validationMs** = validationEndedAt − validationStartedAt
- **settlingMs** = responseSettledAt − settlingStartedAt

### 15.6 TTFT label clarity

Panel and debug model must not blur:
- **TTFT (from ask start)** = firstTokenAt − generationStartedAt
- **TTFT (from inference start)** = firstTokenAt − inferenceStartedAt, only if inferenceStartedAt is available

Do not present them as the same metric unless instrumentation actually proves they are identical.

### 15.7 Transcript-clipping observability

Handle explicitly but narrowly.

- **If** already available or trivial to expose without architecture expansion: add observational debug fields only for speech stop requested timestamp, native stop completed timestamp, transcript settled timestamp, transcript length/word count, speechEnded/finalization signal if already present, tail-grace/deferred-finalization marker if already present. Label as speech-pipeline observability only, observational only, not part of processingSubstate or core lifecycle expansion.
- **If not** already available or not trivial: explicitly **defer** transcript-clipping observability in code comments / plan-aligned notes; do not imply it is covered in this chunk.

### 15.8 Panel / store terminology cleanup

Audit the debug panel and request debug store for terminology consistency:
- No "failed" **lifecycle** labels (lifecycle is idle | listening | processing | speaking | error).
- No "complete" **lifecycle** labels (request outcome status may be "completed"; that is not a lifecycle value).
- No misleading terminal language for recoverable failures (recoverable ≠ request_failed; request_failed is a telemetry event for terminal request failure, not a lifecycle value).
- **request_complete** shown as the terminal telemetry boundary (full request lifecycle complete).
- **response_settled** shown as the commit boundary (final answer commit only).
- **softFail** not shown as a durable status (it is a transient visual cue only).
