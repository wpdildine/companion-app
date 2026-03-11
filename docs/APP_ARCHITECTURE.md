# App Architecture: Agent Surface + Visualization

## High-level

- Root entry: `App.tsx` re-exports `src/app/App.tsx`.
- `src/app/App.tsx` composes `SafeAreaProvider` + **AgentSurface**.
- **AgentSurface** is the top-level composition root for the agent experience. It composes:
  - **VisualizationSurface** (visual background)
  - **UserVoiceView** (scrollable RN content) wrapping **ResultsOverlay**
  - **InteractionBand** (cluster touch input, conditionally enabled)
  - **Debug HUD panels** (Pipeline telemetry + Viz debug overlay)

**Legacy name:** `VoiceScreen.tsx` re-exports `AgentSurface` for compatibility. Prefer importing `AgentSurface`.

## Four roles (Phase 6)

The runtime/UI architecture is split into four clearly named roles:

```
AgentOrchestrator
       ↓
AgentSurface
  ├── VisualizationController
  └── ResultsOverlay
```

### AgentOrchestrator

**Owns:** Agent runtime sequencing and normalized state emission.

- Voice input lifecycle (startListening / stopListening)
- Request lifecycle (submit → RAG ask)
- Retrieval/generation lifecycle
- Playback / TTS lifecycle
- Cancellation / interruption
- Provider selection or fallback logic
- Normalized error handling

**Emits:** Normalized lifecycle state (`idle` | `listening` | `processing` | `speaking` | `error`) plus `processingSubstate` (only when lifecycle is `processing`), and optional listener callbacks (e.g. `onListeningStart`, `onTranscriptUpdate`, `onGenerationEnd`) for the VisualizationController.

**Lifecycle semantics (error):**

- **`error`** — True system/integration/runtime failure. Used for: voice module failure, playback subsystem failure, pack/runtime initialization failure, unexpected native/infrastructure faults. Shows the persistent error panel and requires user recovery (e.g. dismiss).

Recoverable attempt failures (e.g. no usable transcript) return to `idle` without entering a dedicated lifecycle state. A transient “soft fail” visual may still be emitted.

**Does not know:** Visualization rendering, panel layout, render-layer internals, scene.motion or scene.organism details.

**Where:** `src/app/agent/useAgentOrchestrator.ts`, types in `src/app/agent/types.ts`.

### AgentSurface

**Owns:** Top-level user-facing composition.

- Composing VisualizationSurface, UserVoiceView, ResultsOverlay, InteractionBand, debug HUD overlay (Dev button cycles Telemetry → Viz → Off)
- Local UI state (revealed blocks, panel rects, debug toggles)
- High-level layout and safe-area composition
- Feeding normalized agent state into VisualizationController and ResultsOverlay
- Touch arbitration (when to enable InteractionBand) and gesture handlers (tap, long-press, cluster release)

**Does not know:** Provider fallback logic, raw retrieval/generation sequencing, or low-level render contracts.

**Where:** `src/app/AgentSurface.tsx`.

### VisualizationController

**Owns:** Translation from normalized agent state into visualization signals.

- Mapping lifecycle state to visualization mode (idle, listening, processing, speaking)
- Mapping activity/groundedness/confidence into approved visualization signals (phase, retrievalDepth, cardRefsCount, etc.)
- Reacting to orchestrator callbacks to trigger pulses (`triggerPulseAtCenter`) or semantic events (`chunkAccepted`, etc.)
- Writing **only** through approved paths: the signal surface (e.g. `applySignalsToVisualization`)

**Does not know:** Raw provider/runtime details, RAG internals, panel layout, or grounded results presentation.

**Rule:** VisualizationController is provider-agnostic. It reacts to normalized behavior, not vendor-specific events. Use the canonical terms **VisualizationController**, **VisualizationSignals**, **VisualizationEvents**; legacy shorthand naming (e.g. bridge-style abbreviations) is deprecated and scheduled for removal.

**Where:** `src/app/agent/useVisualizationController.ts`.

### ResultsOverlay

**Owns:** Conventional grounded answer presentation.

- Answer panel, card references, rules references, sources panel
- Reveal state and dismiss/show behavior
- Panel rect measurement and reporting (for visualization interaction zones)
- Overlay-local layout; no scroll view (parent UserVoiceView provides scroll)

**Does not know:** Provider orchestration, visualization mode selection, or runtime sequencing.

**Where:** `src/app/agent/ResultsOverlay.tsx`.

## Normalized event flow

- **AgentOrchestrator** updates state and calls optional listeners (e.g. `onTranscriptUpdate`, `onGenerationEnd`).
- **VisualizationController** subscribes to orchestrator state and populates those listeners. It maps state → VisualizationSignals / VisualizationEvents (e.g. setSignals, emitEvent) and, in listeners, calls `triggerPulseAtCenter` or `emitEvent('chunkAccepted')` as appropriate.
- **ResultsOverlay** receives `responseText`, `validationSummary`, `error`, and reveal state from the surface; it reports panel rects and emits `tapCard` / `tapCitation` for visualization semantics.

No provider-specific events are fed directly into visualization code.

## Runtime ownership (summary)

| Concern | Owner |
|--------|--------|
| What is the agent doing? | AgentOrchestrator |
| How is the agent experience assembled? | AgentSurface |
| How does agent behavior become visualization behavior? | VisualizationController |
| How are grounded results shown conventionally? | ResultsOverlay |

## Transient Effects Ownership (System-Wide)

Transient effects are a cross-cutting runtime signal system. Ownership is split across three layers:

1. **Orchestrator/Controller** owns **semantic emission** (what happened, when it happened). It emits events like `softFail`, success pulses, tap pulses, warning pings, attention cues.
2. **Art direction** owns **static tuning** (hues, intensity ranges, decay durations, blending biases, per-layer weights). It stays declarative and authored, no timers or effect logic.
3. **Render layers** own **runtime ingestion and visible application** (uniform updates, decay math, per-frame modulation). Each layer decides how it responds to a transient effect.

Do not put transient event logic into art-direction files. Per-layer render files (e.g. spine) should ingest transient signals and apply them using art-direction tuning values.

## Runtime behavior (stabilization)

- **Transcript settlement before submit** — For hold-to-speak release, submit runs only after transcript settlement. The surface calls `stopListeningAndRequestSubmit()`; the orchestrator waits for final result, speech end (with usable partial), or a bounded timeout, then invokes `onTranscriptReadyForSubmit` once. Submit must not be triggered by direct `stopListening()` + `submit()` on release.
- **Single active ask** — Only one ask may be in flight. New submit attempts are blocked until the current request settles. Lifecycle transitions are request-scoped (active requestId); stale completions are ignored and logged.
- **Post-stop speech errors** — Speech recognition errors that occur after stop has been requested (finalization underway) are treated as non-fatal and do not force lifecycle into error.
- **Failed-request recovery** — `recoverFromRequestFailure()` clears finalization/request state and returns the app to idle. On request failure, result context (response/cards/rules) is cleared so swipe does not reveal stale content. Dismiss error uses this path.
- **Recoverable failure (idle)** — Empty or no-usable transcript at settlement returns lifecycle to `idle` (not `error`). Stop finalization and cleanup run promptly. A transient soft-fail visual (red pulse) is emitted; no persistent error panel. The user can retry immediately.
- **Interaction arbitration** — One interaction owner wins by priority: debug > overlay > holdToSpeak > swipeContext > playbackTap > none. Swipe reveals rules/cards only when valid current context exists; hold is blocked when a request is active or overlay/debug owns.

## Fallback policy

Fallback is **reserved in the type system and policy only**; there is no fallback implementation in the current pipeline. `processingSubstate` includes `'fallback'` for future use; the main pipeline never sets it. **Non-triggers (fallback must NOT activate for):** empty/weak transcript, recoverable denials, slow generation without an explicit timeout, weak retrieval, answer-quality heuristics, or generic failures. **Trigger candidates (implementation deferred):** model load failure (e.g. E_MODEL_PATH), inference failure only if product explicitly prefers a fixed-message path over request_failed for that error class, or explicit user/debug action. **If implemented later:** fallback is a branch within the same request (lifecycle stays processing); it may emit response_settled then request_complete; terminal failure remains request_failed unless a dedicated fallback branch is added for a specific trigger.

## Touch Path

When in user mode and no content panels are visible:

- `InteractionBand` is enabled.
- It captures touch and writes `touchFieldActive/touchFieldNdc/touchFieldStrength`.
- **Center hold (primary voice affordance):** Press and hold in the center strip for the hold threshold → `onCenterHoldStart`; release → `onCenterHoldEnd`. AgentSurface wires release to `stopListeningAndRequestSubmit()`; submit runs only after transcript settlement (via `onTranscriptReadyForSubmit`). Hold takes precedence: if a center hold started, release does not also trigger rules/cards.
- On touch release (when not in an active center hold), it maps final NDC X to cluster side and calls `onClusterRelease` (center strip commits nothing; rules/cards reveal panels when context exists).
- No other semantic action is emitted on touch start/move; those phases are continuous organism response only.

Short tap behavior still exists separately:
- Canvas short taps write `pendingTapNdc`.
- `TouchRaycaster` consumes `pendingTapNdc` and emits pulse visuals.
- This pulse path does not commit rules/cards semantics.

When debug mode is enabled or panels are visible:

- `InteractionBand` is disabled.
- RN overlay content receives interaction priority.

### Touch arbitration (AgentSurface)

Arbitration is a UI-layer decision; AgentSurface owns the `enabled` prop:

- **Content panels visible** (`anyPanelVisible`) → InteractionBand **disabled**.
- **Debug mode** (`debugEnabled`) → InteractionBand **disabled** (touch may be routed to debug).
- **Lifecycle === 'processing'** → InteractionBand **disabled**.
- Otherwise InteractionBand **enabled**.

When the band becomes disabled, InteractionBand clears ref fields so the engine does not retain phantom touch influence.

### Zone layout: single source of truth

Touch zone boundaries (rules / neutral / cards) are defined in **active-region NDC** in `src/visualization/interaction/zoneLayout.ts`. Scene layout ratios in `formations.ts` are derived from that constant so TouchZones overlays align with what InteractionBand treats as left/center/right.

**Invariant:** NDC for zone classification **MUST** be active-region NDC (from `toNdc(bandRect, canvasSize)` in InteractionBand), **not** screen NDC.

### Visual touch affordance

`ClusterTouchZones` (TouchZones layer) provides GL affordances: cluster rings and screen-aligned area overlays (rules / neutral / cards).

### Interaction grammar

Canonical interaction behavior:

- **Voice input** — Press and hold on the center spine/core to begin listening; release to stop listening; submit runs once after transcript settlement. Earcon and haptic feedback occur on listening start and end. The center spine/core is the intended voice affordance (“press the organism core to speak”).
- **Playback** — Double tap to play answer; single tap to cancel playback.
- **Context exploration** — Swipe left/right reveals rules/cards panels only when relevant context exists; center release does nothing.

## Engine Ref Contract (`VisualizationEngineRef`)

Key fields:

- activity: `activity`, `targetActivity`, `lambdaUp`, `lambdaDown`
- pulse slots: `pulsePositions`, `pulseTimes`, `pulseColors`, `lastPulseIndex`
- touch: `touchActive`, `touchWorld`, `touchInfluence`
- interaction band touch field: `touchFieldActive`, `touchFieldNdc`, `touchFieldStrength`
- scene controls: orbit/postfx/intensity/reduceMotion
- semantic snapshot: `lastEvent`, `signalsSnapshot`, panel rects

Writer split:

- App writes targets/events **only** through VisualizationController (and panel rects from AgentSurface/ResultsOverlay path).
- EngineLoop writes continuous derived values (`clock`, eased activity, touch influence, world/view touch mapping).

## Phase 6 Manual Verification Logging

During startup and lifecycle testing, the following subsystems emit logs (via `src/shared/logging/`). Use them as a manual verification harness:

- **AppBoot** — application boot started
- **AgentSurface** — mounted as active composition root
- **VoiceScreen** — one-time deprecation warning when the legacy entrypoint is imported
- **AgentOrchestrator** — initialized, runtime lifecycle ready, lifecycle transitions (idle → listening → … → speaking/idle/error), request/playback events (voice listen started/stopped, request started, retrieval started/completed, generation started/first token/completed, playback started/completed/interrupted, request failed). Recoverable failures log e.g. “lifecycle transition listening -> idle”, “recoverable attempt failed; returning to idle-ready state”; hard errors log e.g. “voice listen start failed”, “speech recognition error (fatal: …)”.
- **Interaction** — center hold start/end detected, submit triggered from hold release, earcon/haptic start/end fired (gesture-level logs only)
- **VisualizationController** — initialized, attached to visualization signal pipeline, received lifecycle state, applied visualization mode, emitted semantic events (e.g. chunkAccepted)
- **ResultsOverlay** — mounted, received answer/cards/rules payload, answer/cards/rules/sources panel shown, panel dismissed, panel rects first reported
- **Runtime** — adapter bootstrap (e.g. pack copy, model paths) when relevant
- **Playback** — lower-level TTS/Piper messages when relevant

Logs are state-change and event-based only; no per-frame or render-loop logging.

## File Map (Current)

- App shell: `src/app/App.tsx`
- Composition root: `src/app/AgentSurface.tsx`
- Legacy alias: `src/app/VoiceScreen.tsx` (re-exports AgentSurface)
- Earcon/haptic hooks: `src/shared/feedback/earcons.ts`, `src/shared/feedback/haptics.ts` (listening start/end; assets at `assets/sound/earcon_in.wav`, `earcon_out.wav`)
- Agent roles: `src/app/agent/` — `useAgentOrchestrator.ts`, `useVisualizationController.ts`, `ResultsOverlay.tsx`, `types.ts`, `index.ts`
- Signal hook: `src/app/hooks/useVisualizationSignals.ts`
- UI wrappers: `src/screens/voice/UserVoiceView.tsx`, `src/screens/voice/VoiceLoadingView.tsx`
- Debug HUD panels: `src/app/agent/PipelineTelemetryPanel.tsx`, `src/app/agent/VizDebugPanel.tsx`
- Visualization surface/canvas: `src/visualization/render/canvas/VisualizationSurface.tsx`, `VisualizationCanvas.tsx`, `VisualizationCanvasR3F.tsx`, `VisualizationCanvasFallback.tsx`
- Visualization interaction: `src/visualization/interaction/InteractionBand.tsx`, `zoneLayout.ts`, `TouchRaycaster.tsx`, `touchHandlers.ts`
- Scene/layers: `src/visualization/engine/EngineLoop.tsx`, `applySignalsToVisualization.ts`, `render/layers/ContextGlyphs.tsx`, `ContextLinks.tsx`, `TouchZones.tsx`, `CameraOrbit.tsx`, `PostFXPass.tsx`
- Engine/types: `src/visualization/engine/types.ts`, `createDefaultRef.ts`, `src/visualization/scene/*`, `src/visualization/materials/*`, `src/visualization/utils/*`
- RAG feature: `src/rag/*`
- Pure utils: `src/utils/log.ts`

## Known In-Progress Areas

- Panel gesture system from the refactor plan (header drag/snap/dismiss/restore + arbitration) is not fully implemented as a dedicated `src/screens/voice` gesture layer.

**Plan D (Final Integration Pass):** Verified integration boundaries for acceptance → processing → settlement → playback → completion, telemetry ordering, and denial/stale-callback behavior; see `.cursor/plans/final_integration_pass.plan.md`.
