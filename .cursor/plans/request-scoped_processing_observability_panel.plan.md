---
name: Request-scoped processing observability panel
overview: Implementation-ready plan for a second debug panel (Pipeline) for request-scoped pipeline observability, with a canonical event-log + snapshot-map debug store, formal orchestrator and RAG telemetry contracts, and clear two-panel ownership. Designed for multi-request debugging and future concurrency.
todos:
  - id: store-schema
    content: Define RequestDebugEvent (eventSeq), RequestDebugSnapshot types; implement requestDebugStore.ts with emit, getState, subscribe, bounded retention
    status: completed
  - id: orchestrator-sink
    content: Orchestrator emits lifecycle events; each produces event-log entry + snapshot merge; partial_output throttled/last-value in snapshot, milestone/bounded in log
    status: completed
  - id: pipeline-panel
    content: ProcessingDebugPanel uses snapshot map for summaries, event log for timeline; render durations, modelInfo, promptHash; Viz | Pipeline tab
    status: completed
  - id: rag-telemetry
    content: RAG system telemetry contract; emit [RAG] events into same store when requestId present; init, retrieval, prompt, generation lifecycle
    status: completed
  - id: polish
    content: Partial stream tuning, truncation/copy affordances, UI cleanup
    status: completed
isProject: false
---

# Request-scoped processing observability panel

## Goal

Make the current end-to-end loop inspectable so you can debug retrieval quality, prompt assembly, streaming behavior, cards/rules population, TTS sequencing, and request failures. The new panel is the single place to inspect one accepted request from transcript acceptance through final settlement. The design supports multi-request debugging and future concurrency via a canonical event log and snapshot map. No new product behavior; no Scryfall, OpenAI fallback, or answer-quality heuristics in this plan.

## Two-panel debug system (ownership)

- **Viz tab** — Owns **visualization debugging only**. DevPanel (palette, easing, mode cycle, pulse, touch zones, post FX, motion axis) + Reference Stubs. Lives in [src/screens/dev/DevScreen.tsx](src/screens/dev/DevScreen.tsx) and [src/visualization/render/dev/DevPanel.tsx](src/visualization/render/dev/DevPanel.tsx). **Unchanged** by this plan.
- **Pipeline tab** — Owns **request-scoped processing observability only**. Transcript → normalize → retrieval → prompt → generation (stream) → settle → cards/rules → TTS. **Read-only**: reads structured debug data only; does not own orchestration. Orchestrator and RAG remain sources of truth.

**Architecture boundaries:** The orchestrator is the **sole owner** of request lifecycle and requestId generation. RAG **never** owns or creates request ids; it receives requestId from the orchestrator via ask options and forwards it on every emission. Single "Dev" toggle gates the debug overlay; inside it, user switches between **Viz** and **Pipeline** tabs.

---

## 1. Request-debug store architecture

Do **not** describe the store as only a bounded `Map<requestId, RequestDebugSnapshot>` plus a recent list. The request-debug store is a **canonical two-part store**:

**(1)** **snapshotsById: Map<requestId, RequestDebugSnapshot>** — the merged **summary/read model**; latest merged state per request. Events merge into snapshots, but snapshots alone are not the timeline.
**(2)** A **canonical event log**: a bounded, append-only **persistent `events: RequestDebugEvent[]` timeline**. Every telemetry emission is **first** appended to this array (with **requestId**, **type**, **timestamp**, **eventSeq** (monotonic), and **payload**), then the payload is merged into the matching snapshot. Without this **persistent RequestDebugEvent[] timeline**, you cannot reliably debug **out-of-order async events**, **overlapping requests**, or **race conditions**. The timeline must read from this event log, not from inferred timestamps.

State clearly: **snapshots are for summary cards**; the **event log is the source of truth for timelines, sequencing, late events, overlapping requests, and race-condition debugging**. A **monotonic eventSeq** is required for every event so ordering is deterministic even when timestamps are close or slightly reordered. Store shape includes **activeRequestId: number | null** and **recentRequestIds: number[]**. **Retention is bounded:** keep all events for the active request plus only the last N completed/failed requests; **trim older requestIds and their events together** when those requests fall out of retention.

### 1.1 Store shape

- **activeRequestId: number | null** — The single active request, if any.
- **recentRequestIds: number[]** — Ordered list of recent completed/failed requestIds (last N) for "recent requests" UI.
- **snapshotsById: Map<number, RequestDebugSnapshot>** — Bounded map; latest merged snapshot per request. Summary/read model for summary display.
- **events: RequestDebugEvent[]** — **Canonical event log**: a bounded, persistent timeline. Every emission is appended here (requestId, type, timestamp, **eventSeq** (monotonic), payload); then the payload is merged into the snapshot. The Pipeline panel timeline reads from this array (filtered by requestId), not from inferred timestamps. Required for debugging out-of-order async events, overlapping requests, and race conditions.

**Bounded retention:** Keep **all** events for the **active** request. For completed/failed requests, keep only the **last N** requestIds in retention. When a request falls out of retention, remove its entry from snapshotsById and **trim older requestIds and their events together** (remove all events whose requestId is no longer retained). This keeps memory bounded while preserving full timeline for the active request and recent ones.

### 1.2 Store API and placement

Request-debug data remains **debug-only** and **outside AgentOrchestratorState**. **Do not treat** AgentSurface refs/state and a dedicated store module **as equal options**. Instead **strongly recommend** a dedicated module [src/app/agent/requestDebugStore.ts](src/app/agent/requestDebugStore.ts) that exposes **emit(event)**, **getState()**, and **subscribe(listener)** with **bounded retention logic** that keeps all events for the active request plus only the last N completed/failed requests and **trims older requestIds and their events together**. The dedicated store is the cleanest way to support both the snapshot map and the event log. **AgentSurface / debug UI should consume the store, not own the store architecture.** The store module is the single source of truth.

**Implementation:** [src/app/agent/requestDebugStore.ts](src/app/agent/requestDebugStore.ts) that exposes:

- **emit(event)** — Append a structured event to the bounded event log (assign monotonic eventSeq), merge the additive payload into the corresponding request snapshot for event.requestId, run retention logic, then notify subscribers.
- **getState()** — Return current store state: activeRequestId, recentRequestIds, snapshotsById, events (read-only view for consumers).
- **subscribe(listener)** — Register a listener; call it after each emit (after merge and retention). Support unsubscribe on cleanup.
- **Retention logic** — Encapsulated in the module (trim by requestId when requests fall out of retention).

AgentSurface (or a thin hook) **consumes** the store and provides the panel UI; the store module remains the single source of truth for the two-part debug model.

---

## 2. Event and snapshot schema

### 2.1 Telemetry contract: every emission has two effects

Every telemetry emission has **two effects**: **(1)** append a structured event **into** the event log, and **(2)** merge additive data into the **matching** request snapshot. Make this explicit: the sink/store always appends to the bounded event log (with eventSeq, requestId, type, timestamp, payload) and merges into the request snapshot for that requestId (or into lastRagInitTrace for init-phase RAG events). So: append event → merge snapshot → notify subscribers. For **orchestrator events** (below), each emission produces both an event-log entry and a snapshot merge. **partial_output** is throttled or last-value-only in the snapshot; the event log keeps only a bounded subset or milestone partials (see table note).

### 2.2 RequestDebugEvent (event log entry)

Each entry in the bounded log has:

- **eventSeq**: number — Monotonic sequence number assigned by the store on append. Used for deterministic ordering even when timestamps collide or events arrive in slightly odd order.
- **requestId**: number | null — Request id (null for init-phase RAG events).
- **type**: string — Event type (e.g. request_start, rag_retrieval_start, rag_prompt_built).
- **timestamp**: number — When the event occurred (e.g. Date.now()).
- **payload**: object — Type-specific payload; additive for snapshot merge.

### 2.3 Orchestrator events: event-log entry + snapshot merge

Orchestrator events **request_start**, **retrieval_start**, **retrieval_end**, **generation_start**, **first_token**, **partial_output**, **generation_end**, **tts_start**, **tts_end**, **request_failed**, and **request_complete** are all clearly described as **both** event-log entries and **snapshot merges**. Each emission produces one log entry and one merge into the snapshot for that requestId.

| Event              | Payload (additive)                                                    | Event log      | Snapshot merge                     |
| ------------------ | --------------------------------------------------------------------- | -------------- | ---------------------------------- |
| `request_start`    | requestId, acceptedTranscript, normalizedTranscript, requestStartedAt | Yes            | Yes                                |
| `retrieval_start`  | requestId, retrievalStartedAt                                         | Yes            | Yes                                |
| `retrieval_end`    | requestId, retrievalEndedAt, packIdentity                             | Yes            | Yes                                |
| `generation_start` | requestId, generationStartedAt                                        | Yes            | Yes                                |
| `first_token`      | requestId, firstTokenAt                                               | Yes            | Yes                                |
| `partial_output`   | requestId, accumulatedText                                            | Yes (see note) | Yes (throttled or last-value only) |
| `generation_end`   | requestId, generationEndedAt, finalSettledOutput, validationSummary   | Yes            | Yes                                |
| `tts_start`        | requestId, ttsStartedAt                                               | Yes            | Yes                                |
| `tts_end`          | requestId, ttsEndedAt                                                 | Yes            | Yes                                |
| `request_failed`   | requestId, failureReason, status: 'failed'                            | Yes            | Yes                                |
| `request_complete` | requestId, status: 'completed'                                        | Yes            | Yes                                |

**partial_output:** In the **snapshot**, keep **throttled or last-value only** so the snapshot does not grow unbounded. In the **event log**, keep only a **bounded subset** or **milestone partials** to avoid memory blowup while still allowing timeline inspection of stream progress.

### 2.4 RequestDebugSnapshot (per requestId)

One object per request; built by merging events. All timestamp fields are `number` (e.g. Date.now()). Keep existing core fields. **Upgrade the snapshot schema with missing diagnostic metadata** — add the following.

**Core fields (orchestrator):**

- requestId, status, acceptedTranscript, normalizedTranscript, requestStartedAt
- retrievalStartedAt, retrievalEndedAt, packIdentity
- generationStartedAt, firstTokenAt, generationEndedAt
- partialStream (single most recent accumulated text; bounded)
- finalSettledOutput, validationSummary
- ttsStartedAt, ttsEndedAt, failureReason, lifecycle

**Extended fields:**

- **completedAt?: number** — When the request reached completed or failed (set on request_complete / request_failed).
- **eventsSeen?: number** — Count of events merged into this snapshot (optional; useful for debugging).
- **modelInfo?: { modelPath?: string; modelId?: string; temperature?: number; topP?: number; maxTokens?: number } | null** — Model and inference params (from RAG or orchestrator); displayed in the Pipeline panel.
- **durations?: { retrievalMs?: number; generationMs?: number; timeToFirstTokenMs?: number; ttsMs?: number; totalRequestMs?: number } | null** — **Derived** when enough timestamps are present (e.g. retrievalEndedAt − retrievalStartedAt, generationEndedAt − generationStartedAt, firstTokenAt − generationStartedAt, ttsEndedAt − ttsStartedAt, completedAt − requestStartedAt). State explicitly: durations are derived when enough timestamps are present and **should be shown in the Pipeline panel as human-readable metrics** (retrieval, generation, time-to-first-token, TTS, total request).
- **promptHash?: string | null** — Either inside promptAssembly or adjacent to it. Exists so **prompt changes can be compared across runs** even when previews are truncated (e.g. short hash of prompt body).

**RAG telemetry section (ragTelemetry):**

- retrievalSummary (retrievalMode, contextLength, bundleId, ruleSetId, bundlePreview)
- promptAssembly (promptLength, contextLength, rulesCount, cardsCount, promptPreview, promptHash)
- generationRequest (modelPath, modelId, temperature, topP, maxTokens, …)
- initTrace (optional) condensed init-phase timings/identity

The store derives **durations** when merging events whenever the corresponding timestamp pairs exist.

---

## 3. RAG system telemetry contract (dedicated section)

The current optional **retrieval_snapshot** callback is **not enough**. Add this **dedicated RAG system telemetry contract** section. Define **structured events** that must be emitted when requestId is available; console **RAG** logs **remain**, but the **same information must also be emitted** into the request debug sink/store. State explicitly: **these events must feed the same request-debug store, not remain console-only logs.** The Pipeline panel **should be able to show**, per request: which pack/version handled it, which retrieval mode was used, what context bundle or retrieval result was selected, how large the prompt was, what model path and inference parameters were used, when the first token arrived, and what generation statistics were observed.

RAG does not create requestIds. The orchestrator passes requestId (and the sink reference) via ask options; RAG forwards requestId and timestamp on every per-request emission. All RAG events are emitted through the same sink and produce both an event-log entry and a snapshot merge (or, for init events, update lastRagInitTrace).

### 3.1 Required RAG telemetry events

**Pack initialization** (no requestId; store keeps lastRagInitTrace or attaches to next request):

| Event                   | Payload                                  | When                                       |
| ----------------------- | ---------------------------------------- | ------------------------------------------ |
| `rag_init_start`        | timestamp                                | Start of init                              |
| `rag_pack_load_start`   | timestamp                                | Pack load begins                           |
| `rag_manifest_read_end` | timestamp                                | Manifest read done                         |
| `rag_rule_ids_resolved` | timestamp                                | Rule IDs / validate sidecars resolved      |
| `rag_index_meta_loaded` | timestamp                                | Index meta (rules/cards dim, paths) loaded |
| `rag_pack_load_end`     | timestamp                                | Pack load done                             |
| `rag_pack_identity`     | packRoot?, embedModelId?, chatModelPath? | Identity of loaded pack/runtime            |
| `rag_init_end`          | timestamp                                | Init complete                              |

**Per-request retrieval** (requestId required):

| Event                         | Payload                                                                       | When                               |
| ----------------------------- | ----------------------------------------------------------------------------- | ---------------------------------- | ----------- |
| `rag_retrieval_start`         | requestId, timestamp                                                          | Retrieval for this request started |
| `rag_retrieval_mode`          | requestId, retrievalMode: 'deterministic'                                     | 'vector'                           | Path chosen |
| `rag_context_bundle_selected` | requestId, contextLength?, bundleId?, ruleSetId?, bundlePreview? (truncated)  | Context bundle selected            |
| `rag_context_assembled`       | requestId, contextLength?, bundlePreview? (truncated)                         | Context string assembled           |
| `rag_retrieval_complete`      | requestId, timestamp, retrievalMode, contextLength, bundleId?, bundlePreview? | Retrieval phase done               |

**Prompt build** (rag_prompt_built with prompt length, context length, rules/cards counts, preview, and prompt hash):

| Event              | Payload                                                                                                  | When                               |
| ------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `rag_prompt_built` | requestId, promptLength, contextLength?, rulesCount?, cardsCount?, promptPreview (truncated), promptHash | Prompt assembled before model call |

**Generation start** (rag_generation_request_start with model info and inference parameters):

| Event                          | Payload                                                          | When                           |
| ------------------------------ | ---------------------------------------------------------------- | ------------------------------ |
| `rag_generation_request_start` | requestId, modelPath?, modelId?, temperature?, topP?, maxTokens? | Right before calling the model |

**Stream milestones** (rag_first_token, rag_stream_update):

| Event               | Payload                                            | When                                          |
| ------------------- | -------------------------------------------------- | --------------------------------------------- |
| `rag_first_token`   | requestId, timestamp, elapsedMs?                   | First token received in RAG layer             |
| `rag_stream_update` | requestId, tokenCount?, elapsedMs?, partialLength? | Stream progress (throttled or milestone only) |

**Generation end** (rag_generation_complete with length/tokens/timing):

| Event                     | Payload                                                 | When                             |
| ------------------------- | ------------------------------------------------------- | -------------------------------- |
| `rag_generation_complete` | requestId, finalLength, totalTokens?, generationTimeMs? | Generation finished in RAG layer |

These events populate the snapshot’s ragTelemetry (retrievalSummary, promptAssembly including promptHash, generationRequest/modelInfo, and derived durations or final stats). Prompt and bundle previews are truncated to a fixed max length; event log may throttle stream updates to stay bounded. **These RAG telemetry events feed the same request-debug store** (event log + snapshot merge) **rather than remaining as disconnected console-only logs.**

---

## 4. Who emits (summary)

- **Orchestrator:** Sole owner of request lifecycle and requestId generation. Emits lifecycle events into the single sink. Each emission produces an event-log entry and a snapshot merge. Passes requestId and sink to ask() so RAG can tag every emission.
- **RAG:** Never owns request ids. Receives requestId and sink via ask options. Emits init-phase and per-request events through the **same** sink. All RAG events include requestId (where applicable) and timestamps; store appends to event log and merges into the correct snapshot and ragTelemetry.

---

## 5. Pipeline panel: rendering contract

Fix the rendering contract so the Pipeline panel **does not derive timelines from summary timestamps**. The timeline source must be **explicit**:

- **Summary UI** reads from **snapshots** (snapshotsById, activeRequestId, recentRequestIds).
- **Timeline UI** reads from the **event log** — specifically, **render events filtered by requestId** from the persistent `RequestDebugEvent[]` array. Do **not** render the timeline from snapshot timestamps or inferred ordering.

This is **required** so overlapping requests and out-of-order async updates can be debugged accurately. Without an event-log–driven timeline, out-of-order async events and race conditions cannot be inspected reliably.

**Summary area:** Reads from the snapshot map. Shows **active request** and **recent request** summaries including: accepted transcript, normalized transcript, retrieval summary, prompt preview, promptHash, modelInfo, **derived metrics** (see below), final output, validationSummary/cards/rules, TTS timings, and failure reason. Do not reconstruct "active + recent" ad hoc from elsewhere.

**Timeline:** Renders **events** from the **event log filtered by requestId** — not inferred timestamps from the snapshot. When multiple requestIds exist, the panel filters the event log to the selected request so the user sees one request’s chronological event sequence. Overlapping requests and out-of-order async updates can be debugged accurately because the timeline is explicitly event-log–driven.

**Derived metrics (optional but helpful):** The panel should display these human-readable derived metrics from the snapshot (when enough timestamps are present): **retrieval duration**, **generation duration**, **time-to-first-token**, TTS duration, and total request duration.

The panel **should display human-readable durations** for retrieval, generation, time to first token, TTS, and total request time (from snapshot.durations).

**UI note:** The UI should **distinguish orchestrator telemetry from RAG telemetry**, either by labels or grouping, so it is obvious whether a problem originated in orchestration, retrieval, prompt assembly, or inference.

### 5.1 Data sources

- **Summary UI** reads from **snapshots** (snapshotsById, activeRequestId, recentRequestIds). Snapshot map is the source of truth for summaries.
- **Timeline UI** reads from the **event log** (`events: RequestDebugEvent[]`) and **renders events filtered by requestId** for the selected request. The timeline is **not** inferred from snapshot timestamps; it is explicitly driven by the event log. Required so overlapping requests and out-of-order async updates can be debugged accurately.

### 5.2 Summary section (per request)

For the active request and for each recent request, the summary shows:

- Accepted transcript, normalized transcript
- Retrieval summary (retrieval mode, context length, bundle id, bundle preview)
- Prompt preview and **promptHash**
- **modelInfo** (model path/id, temperature, topP, maxTokens)
- **Derived metrics (human-readable):** retrieval duration, generation duration, time-to-first-token, TTS duration, total request duration (from snapshot.durations — retrievalMs, generationMs, timeToFirstTokenMs, ttsMs, totalRequestMs)
- Final output (and partial stream if relevant)
- validationSummary / cards and rules payload
- TTS start/end timings
- Failure reason if failed

### 5.3 Timeline section

The timeline **renders events from the event log filtered by requestId** — not timestamps or ordering inferred from the snapshot. Source: the persistent `RequestDebugEvent[]` array. Chronological sequence of events (orchestrator + RAG): transcript accepted → normalization → RAG retrieval start → bundle/context selection → prompt built → generation start → first token → partial stream → final settlement → cards/rules → TTS.

### 5.4 Provenance (explicit UI requirement)

The Pipeline panel should make it **obvious** whether a field or row came from **orchestrator telemetry** or **RAG telemetry** — through **row labels**, **grouping**, or **another lightweight visual distinction** (e.g. event type prefix such as `request` vs `rag\`). This makes it easy to tell whether a bug originated in orchestration, retrieval, prompt assembly, or inference.

### 5.5 Viz tab

**Viz tab** and DevPanel remain **unchanged** — visualization debugging only. Pipeline tab remains read-only and owns request-scoped processing observability only.

---

## 6. Coexistence and file placement

- **Debug entrypoint:** "Dev" toggle in [src/app/AgentSurface.tsx](src/app/AgentSurface.tsx) shows the debug overlay with **tab: "Viz" | "Pipeline".**
- **Viz tab:** Current DevScreen content (DevPanel + Reference Stubs).
- **Pipeline tab:** ProcessingDebugPanel — snapshot-based summaries, event-log-based timeline (filtered by requestId), human-readable durations, modelInfo, promptHash, retrieval summary, prompt assembly, partial/final output, validationSummary, TTS, failure reason; orchestrator vs RAG attribution.
- **Files:** Store at [src/app/agent/requestDebugStore.ts](src/app/agent/requestDebugStore.ts). Panel at [src/app/agent/ProcessingDebugPanel.tsx](src/app/agent/ProcessingDebugPanel.tsx). DevScreen or AgentSurface composes both tabs and subscribes to the store.

---

## 7. Phased implementation order

Keep the two-panel debug system intact and preserve existing boundaries: **Viz tab** remains unchanged and owns visualization debugging only; **Pipeline tab** remains read-only and owns request-scoped processing observability only. The **orchestrator** remains the sole owner of request lifecycle and requestId generation; **RAG never owns request ids**.

**Phase 1 — Event types, snapshot types, event-log + snapshot-map store, orchestrator emission**

- Define **event types**: RequestDebugEvent (with eventSeq, requestId, type, timestamp, payload).
- Define **snapshot types**: RequestDebugSnapshot (including completedAt, eventsSeen, modelInfo, durations, promptHash in or beside promptAssembly), and all orchestrator event payloads.
- Implement the **event-log + snapshot-map store** [src/app/agent/requestDebugStore.ts](src/app/agent/requestDebugStore.ts): activeRequestId, recentRequestIds, snapshotsById, events, bounded retention logic, emit(event), getState(), subscribe(listener).
- Implement **orchestrator emission**: add request debug sink to orchestrator options; each emission produces an event-log entry and a snapshot merge. partial_output: throttled or last-value-only in snapshot; event log keeps only a bounded subset or milestone partials.
- No RAG changes yet.

**Phase 2 — Pipeline panel against the store (summaries, durations, event-log timeline)**

- Build the Pipeline panel **against that store**. Summary UI reads from snapshots; timeline UI reads from the event log filtered by requestId (do not derive timeline from summary timestamps).
- Render **summaries**, **durations**, and the **event-log timeline**. Summary: accepted transcript, normalized transcript, retrieval summary, prompt preview, promptHash, modelInfo, human-readable durations (retrieval, generation, time to first token, TTS, total request), final output, validationSummary/cards/rules, TTS timings, failure reason. Timeline: from events array filtered by requestId. Distinguish orchestrator vs RAG telemetry (labels or grouping).
- Add "Viz" | "Pipeline" tab in debug overlay; wire store into AgentSurface (or hook) and pass state to the panel.

**Phase 3 — Structured RAG telemetry into the same store**

- Add requestId and requestDebugSink to RAG ask options. Implement RAG system telemetry contract: emit all required events (pack init, retrieval, prompt with promptHash, generation start, streaming, generation complete) into the **same** request-debug store.
- Extend snapshot merge logic so RAG events populate ragTelemetry: **retrieval summary**, **promptAssembly**, **promptHash**, **modelInfo**, and **generation metrics**. Derive durations where applicable.
- Console [RAG] logs remain; when requestId is present, the same information is also emitted as structured telemetry into the store.

**Phase 4 — Polish**

- Partial stream history tuning (how many partial events to keep in log). Truncation constants and copy affordances for prompt/bundle preview. UI cleanup. Expand/collapse for full prompt if desired.

---

## 8. Out of scope (preserved)

- OpenAI fallback, Scryfall integration, answer-quality heuristics.
- Broad UI redesign; debug-only UI.
- Persistence of debug data.
- New product behavior.

---

## Summary

- **Store (canonical two-part):** **(1)** **snapshotsById** — merged summary/read model; for summary cards. **(2)** **Canonical event log**: persistent **RequestDebugEvent[]** timeline (bounded, append-only). Every emission is appended there first, then merged into the snapshot. Without this persistent event log, out-of-order async events, overlapping requests, and race conditions cannot be debugged reliably. Timeline reads from the event log, not inferred timestamps. **activeRequestId**, **recentRequestIds**, **monotonic eventSeq** per event. Bounded retention; trim older requestIds and their events together. **Storage:** Dedicated [src/app/agent/requestDebugStore.ts](src/app/agent/requestDebugStore.ts) with **emit(event)**, **getState()**, **subscribe(listener)**, and bounded retention logic. AgentSurface/debug UI consumes the store, does not own the store architecture.
- **Telemetry:** Every emission (1) appends a structured event into the event log and (2) merges additive data into the matching request snapshot. Orchestrator events request_start, retrieval_start, retrieval_end, generation_start, first_token, partial_output, generation_end, tts_start, tts_end, request_failed, request_complete are all both event-log entries and snapshot merges. partial_output: throttled or last-value-only in snapshot; event log keeps only a bounded subset or milestone partials to avoid memory blowup.
- **Snapshot:** completedAt, eventsSeen, modelInfo, durations (derived when enough timestamps are present; Pipeline panel should render as human-readable metrics), promptHash (inside or adjacent to promptAssembly; so prompt changes can be compared across runs even when previews are truncated).
- **RAG (full system telemetry contract):** No optional callback; required structured events. Console [RAG] logs remain; when requestId is available the same information must also be emitted into the request debug sink/store. Pack init: rag_init_start … rag_init_end (including rag_rule_ids_resolved). Retrieval: rag_retrieval_start, rag_retrieval_mode, rag_context_bundle_selected, rag_context_assembled, rag_retrieval_complete. Prompt: rag_prompt_built (requestId, promptLength, contextLength, rulesCount, cardsCount, promptPreview, promptHash). Generation: rag_generation_request_start (requestId, modelPath or modelId, temperature, topP, maxTokens), rag_first_token, rag_stream_update (requestId, tokenCount, elapsedMs, partialLength), rag_generation_complete (requestId, finalLength, totalTokens, generationTimeMs). All feed the same request-debug store. Pipeline panel should be able to show per request: pack/version, retrieval mode, context bundle/result, prompt size, model path and inference params, first token time, generation statistics.
- **Pipeline panel:** **Summary UI reads from snapshots; timeline UI renders events from the event log filtered by requestId** (not inferred timestamps from the snapshot). Required for debugging overlapping requests and out-of-order async updates. Summary: active and recent request summaries (accepted transcript, normalized transcript, retrieval summary, prompt preview, promptHash, modelInfo, derived metrics, final output, validationSummary/cards/rules, TTS timings, failure reason). **Derived metrics:** retrieval duration, generation duration, time-to-first-token, TTS duration, total request duration. Timeline: explicitly event-log–driven. UI distinguishes orchestrator vs RAG telemetry (labels or grouping).
- **Boundaries (preserved):** Viz tab unchanged, visualization debugging only. Pipeline tab read-only, request-scoped processing observability only. Orchestrator sole owner of request lifecycle and requestId; RAG never owns request ids.
