---
name: Final Integration Pass (Plan D)
overview: Verification, cleanup, and architecture-alignment pass after runtime truth, request control, and optional fallback chunks. No new architecture; confirms coherent behavior across acceptance, processing, settlement, playback, denial/failure paths, telemetry, and visualization handoff.
todos: []
isProject: false
---

# Plan D — Final Integration Pass

## 1. Goal

Verify that the whole runtime behaves coherently across:

- transcript acceptance → processing
- lifecycle and processingSubstate alignment with telemetry and UI
- transient effects at correct milestones
- request_start / response_settled / request_complete boundaries
- partial and final response behavior
- playback only after committed response settlement
- completion returning to clean idle
- recoverable denials and recoverable failures resolving correctly
- request failures, fatal errors, and optional fallback (if implemented) per policy
- stale callback protection on all important paths
- iPhone and Android semantic parity (performance differences allowed)

Identify only narrow final cleanup items. No architectural rewrites, no new systems, no speculative feature work.

---

## 2. Current State

**Orchestrator** (`useAgentOrchestrator.ts`): Single source of durable runtime truth. Lifecycle: idle | listening | processing | speaking | error. processingSubstate only when lifecycle === processing (retrieving → preparingContext → loadingModel → awaitingFirstToken → streaming → validating → settling). request_start emitted after acceptance (non-empty normalized transcript, no request in flight). response_settled at settlement; request_complete after tts_end (playback path) or immediately on non-speaking terminal path (empty output). request_failed in catch with lifecycle currently emitted as 'idle'; prior plan required payload lifecycle 'error' for snapshot. All RAG callbacks and post-ragAsk branches guard with activeRequestIdRef.current === reqId. pendingPlaybackCompleteRef drives deferred request_complete when lifecycle becomes idle after playback.

**AgentSurface**: Composes orchestrator, VisualizationController, ResultsOverlay, InteractionBand, debug HUD. Wires requestDebugSinkRef to requestDebugEmit. Feeds orch state to viz controller and overlay. No inference of phases; reveal is user-driven (no auto-reveal).

**VisualizationController**: Maps lifecycle → visualization mode; populates listenersRef (onFirstToken → TRANSIENT_SIGNAL_FIRST_TOKEN, onRecoverableFailure → TRANSIENT_SIGNAL_SOFT_FAIL, onGenerationEnd → chunkAccepted). Writes only via setSignals/emitEvent. Does not own runtime truth.

**requestDebugStore / PipelineTelemetryPanel**: Observational only. Store merges payload into snapshot (lifecycle from payloads); deriveDurations uses fixed formulas. Panel shows snapshot + durations. No operational use of debug state.

**Contract tests** (`orchestrator.contract.test.ts`): success path ordering (response_settled < tts_start < tts_end, idle < request_complete), no usable transcript (no request_start, idle), stale callback protection (recoverFromRequestFailure then resolve ask → no response_settled/tts_start/request_complete), playback ordering.

**Known gaps to verify or fix in this pass**: request_failed payload lifecycle (prior plan: 'error'; current code: 'idle'); non-request lifecycle transitions must not carry stale requestId; TTS path for react-native-tts error branch (setLifecycle('error')) vs request_complete semantics; recoverable paths must not emit request_failed; prior committed response restore on request failure (already implemented: previousCommittedResponseRef).

---

## 3. Architectural Constraints / Invariants to Preserve

1. AgentOrchestrator owns all durable runtime truth.
2. processingSubstate exists only when lifecycle === 'processing'.
3. Top-level lifecycle remains exactly: idle, listening, processing, speaking, error.
4. Render layers never infer runtime semantics (no hidden phases or finality from timing).
5. Single response text slot: responseText only.
6. Response persistence is independent from response surface visibility.
7. Results surface must never auto-reveal.
8. TTS speaks only committed response text (after response_settled).
9. requestDebugStore and PipelineTelemetryPanel are observational only; never operational source of truth.
10. Fallback behavior must never be speculative; fallback only if explicitly implemented.
11. Transient visual effects (e.g. TRANSIENT_SIGNAL_SOFT_FAIL) are never durable state.
12. All async callbacks must be requestId-guarded (activeRequestIdRef.current === reqId before mutating).

Reject any step that violates these invariants.

---

## 4. End-to-End Integration Criteria

- **Acceptance**: Transcript from hold-to-speak flows through stopListeningAndRequestSubmit → onTranscriptReadyForSubmit → submit(). Submit accepts only when requestInFlightRef is false and normalizeTranscript(candidate) is non-empty. request_start is emitted only after that acceptance and requestId assignment.
- **Processing**: lifecycle === processing and processingSubstate advances retrieving → … → settling. Telemetry events (retrieval_start/end, generation_start, first_token, validation_start/end, settling_start, response_settled) occur in order and with correct requestId.
- **Settlement**: response_settled is the commit boundary (final response + validationSummary + settlement telemetry). It is not request_complete. request_complete does not fire at response_settled.
- **Playback**: TTS starts only after response_settled (playText(committedText) invoked after settlement). tts_start carries the same requestId as the settled request; playback completion (tts_end) leads to lifecycle idle then request_complete (via pendingPlaybackCompleteRef effect).
- **Completion**: On playback path: response_settled → playText → tts_start → tts_end → lifecycle idle → request_complete. On non-speaking path (empty output): response_settled → request_complete immediately, activeRequestId cleared, no playback.
- **Terminal failure**: On ragAsk throw, if reqId === activeRequestIdRef.current: request_failed emitted, state cleared, previous committed response restored, lifecycle set to idle (or error per product; snapshot payload per prior plan), activeRequestId cleared. Recoverable denials (no usable transcript, submit blocked) never emit request_failed.
- **Stale callbacks**: After recoverFromRequestFailure or supersession, late ragAsk resolution or late TTS callbacks must not mutate state or emit terminal events for the stale requestId; guards must prevent response_settled, tts_start, request_complete for stale request.

---

## 5. Scenario Matrix to Validate

Execute and verify each scenario; document pass/fail and any cleanup applied.

| Scenario                              | Acceptance                                                                                                                | Lifecycle / Substate                                                                                               | Telemetry                                                                                                                                             | Visual handoff                                                                             | Cleanup if needed                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **No usable transcript**              | submit() not called from release path when transcript empty/settled empty; or submit() returns null when normalized empty | Never leaves idle for processing; or returns to idle without request_start                                         | No request_start                                                                                                                                      | Recoverable softFail only if onRecoverableFailure fired; no request-scoped terminal events | Ensure no request_start when submit returns null; ensure no request_failed          |
| **Recoverable speech error**          | Post-stop speech errors do not force error lifecycle                                                                      | listening → idle; no processing/speaking                                                                           | No request_failed; optional recoverable_failure if emitted                                                                                            | softFail transient only                                                                    | Confirm lifecycle and events                                                        |
| **Successful request with streaming** | submit accepted; processingSubstate goes retrieving → … → streaming → validating → settling                               | processing throughout; then idle (or speaking if playback)                                                         | request*start, retrieval, generationstart, first_token, validation*, settling_start, response_settled; then tts_start/tts_end and request_complete    | firstToken and chunkAccepted at right times                                                | Verify ordering in contract test or manual                                          |
| **Successful request with playback**  | Same; playback starts after response_settled                                                                              | processing → idle → speaking → idle                                                                                | response_settled before tts_start; tts_end before request_complete; request_complete after idle                                                       | Playback only committed text                                                               | Already covered by contract test; confirm on device                                 |
| **Terminal request failure**          | ragAsk throws; guard passes for active request                                                                            | processing → idle (or error if product shows error UI); state cleared; previous response restored                  | request_failed with correct requestId; lifecycle in payload per prior plan ('error'); no response_settled/tts_start/request_complete for this request | No success transients for failed request                                                   | Fix request_failed payload lifecycle to 'error' if snapshot must reflect outcome    |
| **Denied input while processing**     | submit() returns null; log "submit blocked"                                                                               | Unchanged (still processing)                                                                                       | No second request_start                                                                                                                               | —                                                                                          | Confirm no new request_start                                                        |
| **Denied input while speaking**       | submit() returns null                                                                                                     | Unchanged (still speaking)                                                                                         | No second request_start                                                                                                                               | —                                                                                          | Confirm no new request_start                                                        |
| **Stale callback after invalidation** | recoverFromRequestFailure() then ragAsk resolves; or new request accepted and old ask resolves late                       | Lifecycle stays idle (or current request); no state overwrite by stale request                                     | No response_settled/tts_start/request_complete for stale requestId                                                                                    | No transients for stale request                                                            | Contract test already; confirm all guard points listed in orchestrator comments     |
| **Optional fallback path**            | Only if fallback policy was implemented in a prior chunk                                                                  | processingSubstate 'fallback' only when that path runs; same request; response_settled/request_complete as defined | Fallback-specific events only if added                                                                                                                | —                                                                                          | If not implemented: no code paths set 'fallback'; if implemented: verify per policy |

---

## 6. Required Ordering Checks

- **Accepted request enters processing before request work begins**: request_start is emitted after setLifecycle('processing') and setProcessingSubstate('retrieving'); retrieval_start follows. So acceptance and processing start are one boundary; no work before request_start.
- **response_settled before playback start**: playText(committedText) is invoked only after response_settled emit and settlement state update; tts_start is emitted inside playText. So response_settled < tts_start.
- **speaking → idle before request_complete when request_complete claims idle**: On playback path, tts_end sets lifecycle to idle and queues pendingPlaybackCompleteRef; the effect when lifecycle === idle runs request_complete then clears activeRequestId. So tts_end → idle → request_complete. Order: tts_end < idle transition < request_complete.
- **Provisional state does not survive failed/canceled/superseded outcomes**: On request_failed or stale completion, processingSubstate is cleared, lifecycle set to idle (or error), no lingering processing substate.
- **Prior committed response not wiped by current request failure**: On catch, setResponseText(previousCommittedResponseRef.current) and setValidationSummary(previousCommittedValidationRef.current); then refs cleared. Verified in code.
- **Recoverable denials do not emit terminal request events**: No request_start when submit returns null (empty transcript or blocked); no request_failed. Only onRecoverableFailure (softFail) if applicable.

---

## 7. Telemetry / Debug Validation Criteria

- **request_start**: Present after acceptance; payload includes requestId, requestStartedAt, lifecycle 'processing', acceptedTranscript, normalizedTranscript, platform.
- **retrieval_start / retrieval_end**: Present in order; requestId matches.
- **generation_start**: After retrieval_end; requestId matches.
- **first_token**: Once per request when first onPartial with length > 0; requestId matches.
- **validation_start / validation_end**: When substate enters/leaves validating; timestamps for validationMs.
- **settling_start**: When substate enters settling; timestamp for settlingMs.
- **response_settled**: After settling; payload has finalSettledOutput, validationSummary, timestamp (responseSettledAt).
- **tts_start / tts_end**: Same requestId as settled request; lifecycle 'speaking' at tts_start, 'idle' at tts_end.
- **request_complete / request_failed**: request_complete only after tts_end (playback) or non-speaking terminal; request_failed only on terminal request failure; status and completedAt set.
- **Lifecycle truthfulness**: Snapshot lifecycle updated from request_start ('processing'), tts_start ('speaking'), tts_end ('idle'), request_complete ('idle'), request_failed ('error' per prior plan). No stale requestId on non-request lifecycle transitions (e.g. idle → listening does not carry a requestId in durable state; request-scoped events carry requestId).

Validation method: Run successful and failure flows; capture event log and snapshots; assert ordering and payload fields above. Panel must show lifecycle and durations consistent with snapshot; labels "request_complete (terminal)" vs "response_settled (commit)" clear.

---

## 8. Cross-Platform Validation Criteria

- **Same semantic ordering on iPhone and Android**: request_start → … → response_settled → tts_start → tts_end → request_complete (playback path). Same for non-playback and failure paths.
- **Same request outcome behavior**: Accepted request completes or fails with same event set; denied submit never produces request_start on either platform.
- **Same playback completion semantics**: tts_end then idle then request_complete; cancel playback still yields tts_end and cleanup.
- **Allowed differences**: TTFT, model load time, retrieval time may differ; platform in snapshot is debug-only for comparison. Native speech/TTS behavior may differ (e.g. transcript clipping); no architecture drift—observability only.

Validate on both iOS and Android at least for: success with playback, success without playback (empty output), terminal failure, no usable transcript, submit blocked during processing.

---

## 9. Cleanup-Only Fixes Allowed in This Pass

- **request_failed payload lifecycle**: If snapshot must reflect "request ended in error" at event time, set lifecycle in request_failed payload to `'error'` (per Runtime Truth and Measurement Audit). Orchestrator may still transition to idle after cleanup for product behavior; snapshot is observational.
- **Non-request lifecycle transitions**: Ensure no event emitted with a requestId for transitions that are not request-scoped (e.g. idle ↔ listening). Only request-scoped events carry requestId.
- **Panel/store terminology**: Audit labels so "failed" is not used as a lifecycle value (lifecycle is idle | listening | processing | speaking | error); "request_complete" and "response_settled" labels are unambiguous.
- **Guard coverage**: Confirm every callback that can run after request invalidation checks activeRequestIdRef.current === reqId (onRetrievalComplete, onModelLoadStart, onGenerationStart, onValidationStart, onPartial; after ragAsk return; in catch). Add a single comment or checklist in orchestrator if helpful; no new state.
- **TTS error path**: react-native-tts branch on error sets setLifecycle('error'); ensure that path does not emit request_complete for that request (playback failure is separate from request completion; request_complete may already be tied to pendingPlaybackCompleteRef which is set on tts_end). Confirm intended behavior and align: either request_complete still fires after tts_end in error path or explicitly do not emit request_complete when TTS fails before tts_end—document.

No new types of events, no new lifecycle states, no new UI systems, no refactor of RAG or visualization architecture.

---

## 10. File-by-File Change Summary

- **src/app/agent/useAgentOrchestrator.ts**: Verification and minimal cleanup only. Confirm request_failed payload lifecycle (change to 'error' if required by snapshot contract). Confirm all guard points and ordering (response_settled before playText; request_complete only after tts_end or non-speaking path). Fix TTS error path if request_complete semantics are wrong. No new logic.
- **src/app/agent/requestDebugTypes.ts**: No structural change unless a field is missing for validation (e.g. lifecycle already in snapshot).
- **src/app/agent/requestDebugStore.ts**: Verify mergePayloadIntoSnapshot merges lifecycle from request_start, tts_start, tts_end, request_complete, request_failed. Recoverable_failure merges only lastRecoverableFailureReason and timestamp. No new merge logic except possibly explicit lifecycle merge for request_failed if payload key differs.
- **src/app/agent/PipelineTelemetryPanel.tsx**: Terminology only: no "failed" lifecycle label; "request_complete" vs "response_settled" clear. No new sections.
- **src/app/AgentSurface.tsx**: No ownership or state changes; verify it only passes through orchestrator state and does not infer phases. Optional: ensure requestDebugSinkRef is always requestDebugEmit so telemetry receives all events.
- **src/app/agent/useVisualizationController.ts**: No changes; verify it only observes state and listeners and emits transients.
- **src/app/agent/tests/orchestrator.contract.test.ts**: Add or extend tests only for ordering and denial scenarios that are not yet covered: e.g. denied submit while processing (submit returns null, no request_start for second submit), and optionally request_failed payload lifecycle assertion. Do not add tests that require new architecture.
- **src/rag/ask.ts**, **src/rag/index.ts**: No changes unless a bug in callback timing is found (e.g. callback after request invalidation); then minimal guard or no-op in RAG only if contract allows.
- **docs/APP_ARCHITECTURE.md**: No structural edits; optional one-line note that Plan D verified integration boundaries if desired.

---

## 11. Validation / Verification Checklist

- All scenario matrix rows executed and pass (or cleanup applied and re-verified).
- Ordering checks: acceptance before work; response_settled before tts_start; tts_end before request_complete on playback path; provisional state cleared on failure; prior response restored on failure; recoverable denials no terminal events.
- Telemetry: request*start, retrieval, generationstart, first_token, validation*, settling_start, response_settled, tts_start, tts_end, request_complete/request_failed present and in order; lifecycle in payloads; no stale requestId on non-request transitions.
- Contract tests: success path ordering, no usable transcript, stale callback protection, playback ordering; add denied-submit test if not covered.
- request_failed payload lifecycle aligned with prior plan (snapshot 'error' if required).
- Panel/store: no "failed" as lifecycle; request_complete vs response_settled clear.
- iPhone and Android: same semantic ordering and outcome behavior; platform differences only performance/native.
- No new architecture: no new states, no new event types beyond existing, no debug/telemetry as source of truth, no render-layer inference of phases.

---

## 12. Risks and Anti-Overreach Notes

- **Do not** turn this pass into a redesign: no lifecycle expansion, no new state machines, no response UI or telemetry architecture redesign.
- **Do not** reopen settled architecture decisions (orchestrator ownership, single response slot, observational debug) without concrete evidence of a bug.
- **Do not** add feature work under the label of integration (e.g. new fallback implementation, new panels).
- **Do not** add fallback logic if it was not explicitly chosen in a prior chunk.
- **Do not** use the final pass to smuggle in speculative cleanup (e.g. large refactors, renaming beyond terminology fixes in panel labels).
- **Do not** make debug store or panel operational: they remain read-only observers.

---

## 13. Recommended Implementation Sequence

1. **Run existing contract tests** and fix any regressions (none expected if prior chunks are done).
2. **Scenario matrix**: Execute each scenario (no usable transcript, recoverable speech error, success with streaming, success with playback, terminal failure, denied during processing, denied during speaking, stale callback, fallback if implemented). Record pass/fail; if fail, apply only cleanup from section 9 and re-run.
3. **Ordering audit**: Trace code paths for acceptance → request_start → … → response_settled → playText → tts_start → tts_end → request_complete; confirm no request_complete at response_settled; confirm guards on all async callbacks.
4. **Telemetry audit**: Emit a full successful request and a failed request; inspect event log and snapshot; verify lifecycle and durations; fix request_failed payload lifecycle if needed; verify panel labels.
5. **Cleanup**: Apply only section 9 items (request_failed lifecycle, terminology, guard comment, TTS error path clarification).
6. **Contract test additions**: Add test for submit denied while processing (submit twice; second returns null and no second request_start).
7. **Cross-platform**: Run key scenarios on iOS and Android; document any semantic difference (none expected).
8. **Checklist**: Complete section 11; sign off that no invariant was violated and no new architecture introduced.
