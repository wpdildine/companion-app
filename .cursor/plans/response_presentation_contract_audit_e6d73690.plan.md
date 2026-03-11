---
name: Response presentation output contract (canonical)
overview: Single canonical plan for response presentation. One responseText slot; orchestrator-owned semantics; no render state machine; no auto-reveal; persistence separate from visibility; orchestrator empty fallback; throttled streaming; response_settled as settlement boundary.
todos:
  - id: orchestrator-single-slot
    content: Use single responseText; throttle onPartial updates 100-200ms; replace empty nudged with fixed fallback before settlement; emit response_settled at settling commit
    status: pending
  - id: types
    content: Document single responseText contract in types (partial during streaming, final at settlement); no dual-slot state
    status: pending
  - id: overlay-dumb
    content: ResultsOverlay reads only lifecycle, processingSubstate, responseText, validationSummary; no phase inference; AgentSurface owns revealed/hidden state
    status: pending
  - id: logging
    content: Add ResponseSurface to LogScope; emit response_settled and all response_surface_* events from orchestrator with structured payloads
    status: pending
  - id: telemetry
    content: Request-debug store treats response_settled as settlement boundary; partialStream from partial_output
    status: pending
isProject: false
---

# Response Presentation / Output Contract — Canonical Plan

## 1. Core invariant: single response state

There is **one** response state: **responseText**.

- **During streaming:** `responseText` holds partial (accumulated) text. The orchestrator updates it from `onPartial(accumulatedText)`.
- **At settlement:** The orchestrator replaces `responseText` with the final nudged text (and commits `validationSummary`). No separate partial vs final state.
- **Do not introduce** separate `streamingText` / `committedResponse`. The overlay only reads `responseText`, `lifecycle`, `processingSubstate`, and `validationSummary`; it does not infer "provisional vs final."

Orchestrator owns all response semantics. The render layer does not interpret phases or finality.

---

## 2. Surface visibility contract

**Response persistence is separate from response surface visibility.**

**Ownership (state plainly):** **AgentSurface/composition** owns **revealed/hidden UI state**—whether the response surface (answer/cards/rules panels) is shown or collapsed. **ResultsOverlay** is **purely presentational**: it receives content and visibility state from composition and renders; it does not own or decide revealed/hidden state. Composition is the only layer that may change visibility (e.g. collapse on playback end, or set revealed when the user explicitly interacts). The surface is **revealed only due to explicit user interaction** (tap, swipe, panel open); composition collapses the surface when playback ends. These two behaviors are compatible: composition owns both “collapse when playback ends” and “reveal when user acts.”

- The **response surface must NOT automatically reveal itself** due to lifecycle changes. **Streaming, settlement, speaking, or idle must NOT auto-open the panel.**
- When the surface is **hidden**, the response **still exists** in orchestrator state (`responseText`, `validationSummary`).
- **The presence of response data must not automatically cause the response surface to open.**

**Completion (speaking → idle):** When TTS completes, lifecycle goes `speaking` → `idle`. Response data remains stored. The **response surface collapses/conceals**—**even if it was open during speaking**. This is intentional UX: after playback, the surface returns to a concealed state and the user must explicitly interact to reveal again. No auto-expand on idle.

---

## 3. Overlay responsibilities

The overlay **may branch on explicit orchestrator-owned props** (lifecycle, processingSubstate, responseText, validationSummary) to choose presentation (e.g. loading vs content). It **must not** invent hidden response phases, settlement logic, or fallback behavior. It must not derive finality from timing, buffer/merge partial with final, or treat "text stopped updating" as "now final." All "what to show" comes from orchestrator-owned state or explicit surface props. No hidden state machine in render.

---

## 4. Empty output handling

**Orchestrator-owned:** If the final nudged output is empty (or whitespace-only), the **orchestrator** replaces it with a **fixed fallback message** before settlement (e.g. "No answer generated"). Settlement then commits that fallback as `responseText`. The **UI must never invent fallback text**; it only displays `responseText` as provided. No playback when committed text is empty (orchestrator skips `playText`). Weak/truncated output is out of scope for this phase.

---

## 5. Streaming update cadence

**Orchestrator throttles** `responseText` updates during streaming. **Recommended:** 100–200 ms update interval. The **overlay** does not throttle; it renders whatever `responseText` it receives.

---

## 6. Settlement telemetry: response_settled

**response_settled** fires **exactly** when the orchestrator **enters settling** and **commits** final `responseText` and `validationSummary`. This event is the **authoritative boundary** for: final UI state, TTS playback, debugging, replay support, and request telemetry timelines. Emit from the orchestrator when setting `processingSubstate('settling')` and writing final state. Request-debug store and Pipeline panel treat `response_settled` as the settlement boundary.

---

## 7. Response surface by phase (single responseText)

| Phase | Orchestrator | Overlay |
|-------|--------------|---------|
| **awaitingFirstToken** | No responseText yet (or empty). | Reads lifecycle, processingSubstate, responseText, validationSummary. Shows loading/placeholder when appropriate. Does not auto-reveal. |
| **streaming** | Updates `responseText` with accumulated partial; **throttled** 100–200 ms. | Renders `responseText`. Does not auto-reveal. |
| **validating** | Stops updating `responseText`; last partial remains until settlement. | Renders current `responseText`. Does not auto-reveal. |
| **settling** | Sets final `responseText` (nudged or empty fallback) and `validationSummary`. Emits **response_settled**. | Renders `responseText`. Does not auto-reveal. |
| **speaking** | TTS speaks current `responseText`. | Does not auto-reveal. |
| **idle (after speaking)** | Data persists. | **AgentSurface/composition** owns visibility: collapses surface when playback ends (even if it was open during speaking). Reveal only on explicit user interaction. **ResultsOverlay** is purely presentational. |

---

## 8. Persistence and new-request behavior

**Persistence:** `responseText` and `validationSummary` (and derived cards/rules) persist after settlement and after speaking until a new request replaces them or the user/orchestrator clears them. They must **not** remain visibly revealed by default.

**New request:** When a new request begins, the previous response may be cleared at start or replaced when the new request settles. The previous response must **not** remain passively revealed; composition conceals or resets revealed state on new request start.

---

## 9. Logging and telemetry (required, filterable)

Use existing logger ([src/shared/logging/logger.ts](src/shared/logging/logger.ts)) and **ResponseSurface** scope. Emit from **orchestrator (or controller)** only.

| Event | When | Payload |
|-------|------|---------|
| **response_settled** | When orchestrator enters settling and commits responseText + validationSummary. | `requestId`, `lifecycle`, `processingSubstate`, `committedChars`, `rulesCount`, `cardsCount`. Authoritative settlement boundary. |
| **response_surface_streaming_started** | First onPartial with non-empty text (substate → streaming). | `requestId`, `lifecycle`, `processingSubstate`, `partialChars` |
| **response_surface_partial_updated** | Throttled during streaming (e.g. 100–200 ms). | `requestId`, `lifecycle`, `processingSubstate`, `partialChars` |
| **response_surface_empty_output** | When orchestrator applies empty fallback before settlement. | `requestId`, `lifecycle`, `disposition: 'empty'` |
| **response_surface_concealed_after_playback** | When lifecycle speaking → idle; surface collapses. | `requestId`, `lifecycle`, `reason: 'playbackComplete'` |
| **response_surface_revealed_by_user** | User explicitly reveals surface. | `requestId`, `lifecycle`, `reason: 'userReveal'` |
| **response_surface_hidden_on_new_request** | New request starts; surface concealed. | `requestId`, `lifecycle`, `reason: 'newRequestStart'` |

Payloads: always `requestId` when in request context; use `LogDetails` shape; filter by scope `[ResponseSurface]` or `__LOG_SCOPES__`.

---

## 10. Future capability: Replay

Replay uses the stored **responseText** (committed response from the last completed request). Same TTS pipeline as speaking; no RAG/generation; allowed only when `lifecycle === 'idle'`; does **not** auto-reveal the surface. UI control may be added later.

---

## 11. Minimal affected files

| Area | Files |
|------|--------|
| **Orchestrator** | [src/app/agent/useAgentOrchestrator.ts](src/app/agent/useAgentOrchestrator.ts) — Single `responseText`; throttle onPartial 100–200 ms; replace empty nudged with fixed fallback before settlement; emit `response_settled` at settling; emit ResponseSurface logs. |
| **Types** | [src/app/agent/types.ts](src/app/agent/types.ts) — Document single responseText contract (partial during streaming, final at settlement). |
| **Logging** | [src/shared/logging/logger.ts](src/shared/logging/logger.ts) — Add `ResponseSurface` to `LogScope`. |
| **Overlay** | [src/app/agent/ResultsOverlay.tsx](src/app/agent/ResultsOverlay.tsx) — Purely presentational. Reads only lifecycle, processingSubstate, responseText, validationSummary; may branch on these props; must not invent hidden response phases, settlement logic, or fallback behavior. |
| **Composition** | [src/app/AgentSurface.tsx](src/app/agent/AgentSurface.tsx) — Owns revealed/hidden UI state. When lifecycle speaking → idle, collapses surface (even if it was open during speaking). Reveal only on explicit user interaction. |
| **Request debug** | [src/app/agent/requestDebugStore.ts](src/app/agent/requestDebugStore.ts), [requestDebugTypes.ts](src/app/agent/requestDebugTypes.ts), [PipelineTelemetryPanel](src/app/agent/PipelineTelemetryPanel.tsx) — Treat `response_settled` as settlement boundary; snapshot final state at that event; partialStream from partial_output. |

---

## 12. Summary

- **Single response state:** One `responseText`; partial during streaming, final at settlement. No streamingText/committedResponse.
- **Surface visibility:** Surface never auto-reveals; only explicit user interaction; when hidden, response still in state. AgentSurface owns visibility; ResultsOverlay purely presentational.
- **Overlay:** May branch on explicit orchestrator-owned props; must not invent hidden response phases, settlement logic, or fallback behavior. AgentSurface owns visibility; ResultsOverlay purely presentational.
- **Empty output:** Orchestrator replaces empty nudged with fixed fallback before settlement; UI never invents fallback.
- **Streaming:** Orchestrator throttles responseText updates (100–200 ms); overlay renders what it receives.
- **response_settled:** Authoritative telemetry at settling commit; boundary for final UI, TTS, debug, replay, timelines.
- **Logging:** ResponseSurface scope; structured, filterable payloads from orchestrator only.
