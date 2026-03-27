# Native Microphone Contract (NATIVE plugin extension)

**Authority:** This document extends [PLUGIN_CONTRACT.md](./PLUGIN_CONTRACT.md) for **microphone / voice capture** native plugins. It does not replace [ARCHITECTURE.md](./ARCHITECTURE.md) or [APP_ARCHITECTURE.md](./APP_ARCHITECTURE.md). It also sits on top of the reusable native integration pattern in [NATIVE_PLUGIN_PATTERN.md](./NATIVE_PLUGIN_PATTERN.md). **AgentOrchestrator** remains the semantic and app-lifecycle owner; this contract defines the **native → JS boundary** for mic hardware and session **facts** only.

**Naming:** Native plugin governance docs in this repo use the pattern `docs/NATIVE_<DOMAIN>_CONTRACT.md`. This file (`NATIVE_MIC_CONTRACT.md`) is the reference pattern for future `NATIVE_*` contracts.

---

## 1. Objective

Guarantee **governing text** sufficient to implement iOS and Android mic plugins such that: (a) **one** native surface owns **hardware/session facts** at the capture boundary; (b) **AgentOrchestrator** alone owns **semantic** and **app** lifecycle truth (see [ARCHITECTURE.md](./ARCHITECTURE.md), [APP_ARCHITECTURE.md](./APP_ARCHITECTURE.md)); (c) events and command/response behavior at the **JS contract** are **deterministic, idempotent, attributable**, and **identical across platforms** at that boundary; (d) native code **never** drives submit, fallback policy, or orchestrator lifecycle transitions.

---

## 2. Scope and non-goals

**In scope:** Native plugin responsibilities for mic capture—initialization, activation (start capture), stop/finalize, cancel, teardown; idempotency and late events; native→JS event types and payload schema; minimal failure taxonomy for the **plugin layer**; what JS may **request** vs what native may **emit**; cross-platform parity at the **JS-facing** contract.

**Out of scope (not defined here):** STT algorithms, transcript settlement timing, orchestrator state machines, RAG, TTS, visualization, TypeScript implementation, `runtime-ts` / pack_runtime, Python, UI. Orchestrator behavior (e.g. `error` vs recoverable idle, settlement before submit) is **referenced** from [APP_ARCHITECTURE.md](./APP_ARCHITECTURE.md) only—not redefined.

### Constraints

- All native plugin governance documents MUST follow the **`NATIVE_` prefix** naming convention (`NATIVE_<DOMAIN>_CONTRACT.md`).
- Native plugin contracts MUST be **platform-agnostic** at the **JS interface** level and **identical** across iOS and Android for that interface.
- **Platform-specific implementation details** (APIs, threading, audio session categories, buffer sizes) are **out of scope** in this contract: they MUST NOT appear as normative requirements in contract definitions. Only the **JS-visible** contract is normative here.

---

## 3. Plugin ownership model

| Role | Owner |
|------|--------|
| Hardware/session **facts** (e.g. capture armed, route change, interruption, OS-level loss of session, native error codes at the mic boundary) | **Native microphone plugin** (the single mic plugin implementation for the app build; this contract defines its obligations at the JS boundary) |
| **Semantic** decisions (when the app is listening/processing for user-facing purposes, submit/settlement orchestration, lifecycle `idle` \| `listening` \| `processing` \| `speaking` \| `error`, recoverable vs terminal **at app level**) | **AgentOrchestrator** (unchanged; see [ARCHITECTURE.md](./ARCHITECTURE.md) Agent substructure, [APP_ARCHITECTURE.md](./APP_ARCHITECTURE.md) AgentOrchestrator) |

**Allowed (native plugin):** Emit factual events; reject commands with structured errors per [PLUGIN_CONTRACT.md](./PLUGIN_CONTRACT.md); honor JS-initiated **requests** (init, start, stop/finalize, cancel, teardown, debug info) as defined in §4; optional non-semantic diagnostics (`getDebugInfo()`-style).

**Forbidden (native plugin):** Choosing submit timing; invoking or implying RAG or submit; mutating or commanding **AgentOrchestrator** lifecycle; **hidden** retry/fallback that alters capture semantics without emitting classified events; claiming a **second semantic source of truth** for “the app is listening”—the orchestrator remains the semantic mirror; the plugin reports **facts** only.

### NATIVE plugin classification

- Any plugin that interfaces with **hardware**, **OS-level services**, or **device capabilities** MUST be classified as a **NATIVE** plugin.
- NATIVE plugins are governed by:
  - [PLUGIN_CONTRACT.md](./PLUGIN_CONTRACT.md) (base five rules + shared payload shapes)
  - `docs/NATIVE_<DOMAIN>_CONTRACT.md` (domain-specific extension, e.g. this document for mic)
- NATIVE plugins MUST **not** define semantic behavior (submit, fallback, app lifecycle transitions).

---

## 4. Lifecycle contract

**Phases (contract-level meanings, not implementation):**

| Phase | Meaning |
|-------|--------|
| **init** | Module is loaded and ready to accept commands (may be separate from first capture). |
| **activate / start capture** | A capture **session** is started per JS request; hardware/session is engaged for that session. |
| **stop / finalize** | Clean end of capture for the current session (success path for “done recording”). |
| **cancel** | Abandon capture without implying successful finalized audio; session ends without claiming normal completion semantics. |
| **teardown** | Module or instance shutdown; no further events for prior sessions unless contract explicitly allows a bounded drain window. |

**Idempotency (normative):** Duplicate **start** while a session is already active MUST result in either a single active session or a **deterministic** no-op with an acknowledgment event class that JS can dedupe. Duplicate **stop/finalize** for the same `sessionId` while already **stopping/finalizing** MUST be a **deterministic silent no-op** at the JS boundary. Duplicate **stop/finalize** for the same `sessionId` after terminal **stopped/finalized** MUST be a **deterministic silent no-op** at the JS boundary. Duplicate **cancel** for the same `sessionId` after terminal cancel (or after **teardown**) MUST be a **deterministic silent no-op** at the JS boundary. For these duplicate stop/finalize/cancel paths, native implementations MUST NOT emit additional terminal acknowledgment events, and MUST NOT expose implementation-defined alternatives at the JS contract layer. These duplicate-command semantics MUST be identical across iOS and Android at the JS boundary.

**Late events:** After **teardown**, or after native has emitted terminal **stopped/finalized** (or equivalent) for a **session id**, any late native callbacks MUST be **dropped** or **tagged** so JS can ignore them (e.g. stale flag in `data`). Events MUST carry **session/correlation** identifiers so orchestrator-side staleness rules can apply (aligned with the spirit of request-scoped behavior in [APP_ARCHITECTURE.md](./APP_ARCHITECTURE.md)); this contract does not specify orchestrator code paths.

**Cross-session isolation:** Each new capture session MUST use a **new** session identifier at the JS contract. No reuse of “active capture” state across sessions without explicit events.

### Cross-platform lifecycle invariance

- Phases **start**, **stop**, **cancel**, and **teardown** MUST have the **same meaning** and **compatible ordering guarantees** across iOS and Android at the JS contract (e.g. a session does not reach “finalized” before “started” for the same `sessionId`).
- Differences in **wall-clock timing** or **OS callback ordering** at the native layer MUST NOT change **contract semantics** exposed to JS (JS sees the same state machine outcomes).
- **Idempotency** and **late-event** rules MUST be enforced **consistently** across platforms.

---

## 5. Event contract (native → JS)

**Minimal event categories** (exact string `type` values are fixed in implementation but MUST be drawn from one shared enum for both platforms):

- Capture/session **started** (session armed and recording for a given `sessionId`).
- Capture/session **stopping** / **stopped** or **finalized** (terminal success path).
- **Interruption** (route loss, ducking, OS takeover—non-terminal unless classified otherwise in `data`).
- Optional **level/meter** (if present, MUST be documented as **non-authoritative** for app semantics).
- **Failure** (structured `code` + classification per §6).

**Payload structure:** Every event MUST conform to the shared shape in [PLUGIN_CONTRACT.md](./PLUGIN_CONTRACT.md) (`type`, optional `message`, optional `data`). **`data` MUST include** at minimum: `sessionId` (or an agreed correlation id aligned with app `recordingSessionId` where applicable), and `phase` or equivalent session phase marker. Failures MUST include a stable **`code`** and classification axis per §6.

**Ordering:** For a given `sessionId`, **started** precedes **terminal stopped/finalized** unless **failure** or **cancel** terminates early. Global ordering across subsystems is **not** guaranteed; ordering **within** the mic plugin contract for a session **is** partially guaranteed as above.

### Platform-agnostic event schema requirement

- All emitted events MUST conform to the **same schema** regardless of platform.
- Event **names** (`type`), **payload keys**, and **ordering guarantees** in §5 MUST be **identical** between iOS and Android at the JS boundary.
- **No platform-specific event variants** at the JS boundary (no `ios_only_*` types in the contract surface).

---

## 6. Failure classification

**Plugin-layer taxonomy (does not replace orchestrator lifecycle tables):**

- **Recoverable vs terminal** at the mic boundary: **Recoverable** issues MAY map to orchestrator recoverable/idle paths; **terminal** hardware/session loss MAY map to `error`-class situations described in [APP_ARCHITECTURE.md](./APP_ARCHITECTURE.md) (e.g. voice module failure). This document does **not** redefine orchestrator states.
- **Attribution axes (labels):** Failures MUST be classifiable along: **`hardware_session`** (device, permission, audio session), **`transport`** (if applicable to a future pipe—reserved), **`interruption`** (OS route/session interruption). Native implementations MUST use stable **codes** so logs and JS can attribute without ambiguity.

Structured rejections from async native methods MUST follow [PLUGIN_CONTRACT.md](./PLUGIN_CONTRACT.md) (`code`, `message`, optional `details`).

---

## 7. Orchestrator interaction rules

**JS may request (conceptual API; names are abstract):** initialize module; start capture (new session); stop/finalize; cancel; teardown; query debug/diagnostic info.

**Native may emit:** Factual events and structured errors as above; MUST NOT emit commands that imply **submit**, **user finished speaking**, or **orchestrator lifecycle** transitions as authoritative truth. MUST NOT command visualization or RAG.

**Forbidden:** Plugin-driven **semantic** actions: submit, fallback selection, or changing normalized agent lifecycle. The app bridge MAY forward facts to **AgentOrchestrator**, which alone applies semantics per [APP_ARCHITECTURE.md](./APP_ARCHITECTURE.md).

---

## 8. Cross-platform parity rules

**Must be identical at JS boundary:** Event **types**, payload **keys**, session/correlation rules, failure **code** namespace for the mic contract, lifecycle phase **meanings** in §4.

**May differ inside native only:** OS APIs, threading, audio session configuration, buffer sizes—provided the **JS contract** remains identical and no extra semantics leak across platforms.

### NATIVE contract enforcement

- JS-facing **API** and **event** contract MUST be **identical** across platforms.
- Differences are allowed **only** inside native implementation layers.
- Any divergence at the **JS contract** layer is a **governance violation**.

---

## 9. Acceptance criteria

A reader can implement native plugins that achieve: deterministic start/stop; safe teardown; deduplication and avoidance of zombie sessions via `sessionId` + terminal rules; clear failure attribution; iOS and Android implementations **without** undocumented assumptions—because lifecycle, events, failures, and parity are fully specified **here** and in [PLUGIN_CONTRACT.md](./PLUGIN_CONTRACT.md), subject to platform APIs only **below** the JS boundary.

---

## 10. Regression guardrails

**Anti-patterns (forbidden):**

| Anti-pattern | Why (governance) |
|--------------|------------------|
| Semantic ownership in the plugin | Violates [ARCHITECTURE.md](./ARCHITECTURE.md): orchestrator = semantic owner. |
| Multiple competing sources of “mic truth” for **app** semantics | Orchestrator must remain the single semantic mirror. |
| Hidden native fallback/retry | Alters capture semantics without explicit events + classification; violates §3 and §6. |
| Divergent JS event shapes across iOS/Android | Violates §5 and §8. |

### NATIVE plugin guardrails

- No **platform-specific branching in JS** for mic behavior (parity is enforced at the native boundary).
- No **duplicate or competing microphone ownership** layers at the semantic level.
- No **fallback or retry logic** inside native plugins that changes capture semantics without explicit, classified emission.
- No **implicit lifecycle transitions** triggered by native code (only **facts** and responses to **requests**).

---

## Related documents

- [PLUGIN_CONTRACT.md](./PLUGIN_CONTRACT.md) — baseline native plugin rules and payload floors.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — agent layout; orchestrator vs `voice/` mechanism.
- [APP_ARCHITECTURE.md](./APP_ARCHITECTURE.md) — AgentOrchestrator ownership, stabilization, error semantics.

---

## 11. Implementation appendix (AtlasNativeMic, Cycle 3)

Normative **JS-facing** names for the `atlas-native-mic` package (`plugins/atlas-native-mic`). Platform implementations MUST match these strings at the bridge boundary.

### Native module name

- **iOS / Android:** `AtlasNativeMic`

### Methods (async; reject with `{ code, message, ... }` per PLUGIN_CONTRACT)

| Method | Purpose |
|--------|--------|
| `init()` | Idempotent module readiness. |
| `startCapture(sessionId: string)` | Begin capture for `sessionId` (must match orchestrator `recordingSessionId` when used from remote STT path). |
| `stopFinalize(sessionId: string)` | Success-path stop; resolves with `{ uri: string, durationMillis: number, duplicate?: boolean }`. |
| `cancel(sessionId: string)` | Abandon capture without finalized audio. |
| `teardown()` | Shutdown; late events dropped/tagged per §4. |
| `getDebugInfo()` | Diagnostics string. |
| `addListener` / `removeListeners` | Required for `NativeEventEmitter` on Android. |

### Event `type` strings (native → JS)

| `type` | Meaning |
|--------|--------|
| `mic_capture_started` | Session armed; `data.sessionId`, `data.phase` (e.g. `capturing`). |
| `mic_capture_stopping` | Finalization in progress; `data.phase` `stopping`. |
| `mic_capture_finalized` | Terminal success path; `data.phase` `finalized`. |
| `mic_interruption` | Route/OS interruption (reserved; emit when implemented). |
| `mic_failure` | Structured failure or cancel terminal (`data.code`, optional `data.classification`). |

Every event body MUST include at least `sessionId` and `phase` in the map sent to JS (see §5).

### App integration (remote capture only)

- Build-time flag `NATIVE_MIC_CAPTURE` (`1` / `true` / `yes`): when set, [useSttAudioCapture.ts](../src/app/hooks/useSttAudioCapture.ts) uses `atlas-native-mic` instead of expo-audio for the **remote** STT capture path; default is **off** (expo-audio). Local `@react-native-voice/voice` path is unchanged.
- `isNativeMicCaptureEnabled()` is exported from [endpointConfig.ts](../src/shared/config/endpointConfig.ts).
