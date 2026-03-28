# App Architecture: Agent Surface + Visualization

## High-level

- Root entry: `App.tsx` re-exports `src/app/App.tsx`.
- `src/app/App.tsx` composes `SafeAreaProvider` + **AgentSurface**.
- **AgentSurface** is the top-level composition root for the agent experience. It composes:
  - **VisualizationSurface** (visual background)
  - **SemanticChannelView** (scrollable RN content) wrapping **ResultsOverlay**
  - **InteractionBand** (cluster touch input, conditionally enabled)
  - **Debug HUD panels** (Pipeline telemetry + Viz debug overlay)

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

- **`error`** — True system/integration/runtime failure. Used for: voice module failure, playback subsystem failure, pack/runtime initialization failure, unexpected native/infrastructure faults. Errors remain part of orchestrator and runtime state (lifecycle, error message, logging, telemetry). Errors are **not** rendered as dismissible overlay content; there is no error panel in ResultsOverlay. Do not reintroduce an error panel in the overlay.

Recoverable attempt failures (e.g. no usable transcript) return to `idle` without entering a dedicated lifecycle state. A transient “soft fail” visual may still be emitted.

**Does not know:** Visualization rendering, panel layout, render-layer internals, scene.motion or scene.organism details.

**Where:** `src/app/agent/useAgentOrchestrator.ts`, types in `src/app/agent/types.ts`.

### AgentSurface

**Owns:** Top-level user-facing composition.

- Composing VisualizationSurface, SemanticChannelView, ResultsOverlay, InteractionBand, debug HUD overlay (Dev button cycles Telemetry → Viz → Off)
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
- Writing **only** through approved paths: the signal surface (e.g. `applyVisualizationSignals`)

**Does not know:** Raw provider/runtime details, RAG internals, panel layout, or grounded results presentation.

**Rule:** VisualizationController is provider-agnostic. It reacts to normalized behavior, not vendor-specific events. Use the canonical terms **VisualizationController**, **VisualizationSignals**, **VisualizationEvents**; legacy shorthand naming (e.g. bridge-style abbreviations) is deprecated and scheduled for removal.

**Where:** `src/app/agent/useVisualizationController.ts`.

### ResultsOverlay

**Owns:** Conventional grounded answer presentation.

- Answer panel, card references, rules references, sources panel
- Reveal state and dismiss/show behavior
- Panel rect measurement and reporting (for visualization interaction zones)
- Overlay-local layout; no scroll view (parent SemanticChannelView provides scroll)

**Does not know:** Provider orchestration, visualization mode selection, or runtime sequencing.

**Where:** `src/app/ui/components/overlays/ResultsOverlay.tsx`.

## Normalized event flow

- **AgentOrchestrator** updates state and calls optional listeners (e.g. `onTranscriptUpdate`, `onGenerationEnd`).
- **VisualizationController** subscribes to orchestrator state and populates those listeners. It maps state → VisualizationSignals / VisualizationEvents (e.g. setSignals, emitEvent) and, in listeners, calls `triggerPulseAtCenter` or `emitEvent('chunkAccepted')` as appropriate.
- **ResultsOverlay** receives `responseText`, `validationSummary`, and reveal state from the surface; it reports panel rects and emits `tapCard` / `tapCitation` for visualization semantics.

No provider-specific events are fed directly into visualization code.

## Runtime ownership (summary)

| Concern | Owner |
|--------|--------|
| What is the agent doing? | AgentOrchestrator |
| How is the agent experience assembled? | AgentSurface |
| How does agent behavior become visualization behavior? | VisualizationController |
| How are grounded results shown conventionally? | ResultsOverlay |

## Play / Act (derived interaction phase)

**Play/Act** is a **data-driven, derived** layer documented in [docs/PLAY_ACT_CONTRACT.md](PLAY_ACT_CONTRACT.md). It classifies the current moment into a minimal set of **Acts** (Intake, Evaluate, Clarify, Recover, Respond) from **already-normalized** orchestrator truth and surface-visible arbitration facts. It **does not** replace AgentOrchestrator (lifecycle, request, commit/clear), AgentSurface (arbitration, hold accept/reject per [docs/INTERACTION_CONTRACT.md](INTERACTION_CONTRACT.md)), or VisualizationController / ResultsOverlay (pixels and overlay layout). Optional consumption: presentation may use Act **labels and affordance hints** only in **intersection** with authoritative lifecycle and arbitration. Realization notes: [docs/PLAY_ACT_REALIZATION.md](PLAY_ACT_REALIZATION.md); pure resolver export `resolveAgentPlayAct` (see `src/app/agent/resolveAgentPlayAct.ts`).

## Transient Effects Ownership (System-Wide)

Transient effects are a cross-cutting runtime signal system. Ownership is split across three layers:

1. **Orchestrator/Controller** owns **semantic emission** (what happened, when it happened). It emits events like `softFail`, success pulses, tap pulses, warning pings, attention cues.
2. **Art direction** owns **static tuning** (hues, intensity ranges, decay durations, blending biases, per-layer weights). It stays declarative and authored, no timers or effect logic.
3. **Render layers** own **runtime ingestion and visible application** (uniform updates, decay math, per-frame modulation). Each layer decides how it responds to a transient effect.

Do not put transient event logic into art-direction files. Per-layer render files (e.g. spine) should ingest transient signals and apply them using art-direction tuning values.

## Runtime behavior (stabilization)

**Native microphone boundary:** Capture/session semantics at the native plugin ↔ JS boundary are governed by [docs/NATIVE_MIC_CONTRACT.md](docs/NATIVE_MIC_CONTRACT.md) (hardware/session facts, plugin lifecycle, events). AgentOrchestrator remains the owner of voice input lifecycle and settlement behavior below. AV mechanics are implemented in `src/app/agent/av/`, while transcript settlement remains orchestrator-adjacent in `src/app/agent/orchestrator/`. AV entrypoints use `emitAvFact` for typed mechanical facts (including bookkeeping); **imperative adapters** for native capture/voice I/O and logging stay at the seam. All AV-originated fact interpretation goes through orchestrator `applyAvFact` only (no second public ingress).

- **Transcript settlement before submit** — For hold-to-speak release, submit runs only after transcript settlement. The surface calls `stopListeningAndRequestSubmit()`; the orchestrator waits for final result, speech end (with usable partial), or a bounded timeout, then invokes `onTranscriptReadyForSubmit` once. Submit must not be triggered by direct `stopListening()` + `submit()` on release.
- **Single active ask** — Only one ask may be in flight. New submit attempts are blocked until the current request settles. Lifecycle transitions are request-scoped (active requestId); stale completions are ignored and logged.
- **Post-stop speech errors** — Speech recognition errors that occur after stop has been requested (finalization underway) are treated as non-fatal and do not force lifecycle into error.
- **Failed-request recovery** — `recoverFromRequestFailure()` clears finalization/request state and returns the app to idle. On request failure, result context (response/cards/rules) is cleared so swipe does not reveal stale content.
- **Recoverable failure (idle)** — Empty or no-usable transcript at settlement returns lifecycle to `idle` (not `error`). Stop finalization and cleanup run promptly. A transient soft-fail visual (red pulse) is emitted. The user can retry immediately.
- **Interaction arbitration** — One interaction owner wins by priority: debug > overlay > holdToSpeak > swipeContext > playbackTap > none. Swipe reveals rules/cards only when valid current context exists; hold is blocked when a request is active or overlay/debug owns.

## Fallback policy

Fallback is **reserved in the type system and policy only**; there is no fallback implementation in the current pipeline. `processingSubstate` includes `'fallback'` for future use; the main pipeline never sets it. **Non-triggers (fallback must NOT activate for):** empty/weak transcript, recoverable denials, slow generation without an explicit timeout, weak retrieval, answer-quality heuristics, or generic failures. **Trigger candidates (implementation deferred):** model load failure (e.g. E_MODEL_PATH), inference failure only if product explicitly prefers a fixed-message path over request_failed for that error class, or explicit user/debug action. **If implemented later:** fallback is a branch within the same request (lifecycle stays processing); it may emit response_settled then request_complete; terminal failure remains request_failed unless a dedicated fallback branch is added for a specific trigger.

## Touch Path

The high-level interaction contract is still the same, but the implementation is in active migration and should be described as current behavior rather than a settled final design.

Current code path:

- `VisualizationSurface` keeps the canvas at `pointerEvents="none"` and passes `canvasTouchPolicy="none"` into `VisualizationCanvas`, so the GL subtree does **not** receive touches and the R3F wrapper does **not** attach direct-mount `onTouch*` handlers. **`TouchRaycaster`** still runs when `pendingTapNdc` is set (center short tap on **`InteractionBand`** uses active-region NDC, same consume-once contract as direct-mount canvas taps).
- The surface still accepts `TouchCallbacks` on its props type (e.g. `onShortTap`, long-press, legacy `onClusterTap`) for **latent / direct-mount** use; the additive type `DirectMountCanvasTouchCallbacks` documents the gesture subset. Those handlers are **not invoked** in the default shell (`canvasTouchPolicy="none"` + non-interactive canvas). **`onClusterRelease` is not destructured or forwarded** from `VisualizationSurface` to `VisualizationCanvas`—live **cluster release** is **`InteractionBand` → `onClusterRelease`** only.
- **`controlsEnabled`:** intended for **direct-mount** drag-to-orbit when `canvasTouchPolicy="full"` and the canvas receives touches. With the default shell, canvas touches are blocked, so orbit does **not** activate from `debugEnabled` alone—treat as legacy/direct-mount unless a future PR explicitly pairs debug with touch arbitration.
- **`inputEnabled`:** when `canvasTouchPolicy="full"`, gates whether RN touch handlers run on the R3F wrapper; shell typically keeps defaults but canvas remains non-interactive.
- **`canvasTouchPolicy`:** `none` (shell) vs `full` (direct-mount gestures: tap pulse, long-press, orbit).
- `InteractionBand` is the dedicated touch layer for the continuous touch field and release-commit semantics. In current code it uses `react-native-gesture-handler` `Gesture.Pan()` with `manualActivation(true)`.
- The band mounts the detector on a non-collapsable host view (`collapsable={false}`), reflecting the current native-fast migration/workaround path.
- Native touch remains the authoritative physical input path inside the band. Tap-like and hold-like semantics are preserved by JS callbacks (`runOnJS`) off the pan lifecycle.
- A passive `InteractionProbe` can be enabled in viz debug mode to show live NDC, zone, and center-hold eligibility. It is diagnostic only and does not capture touches.

Current semantic behavior:

- `start` / `move` write continuous organism response only (`touchFieldActive`, `touchFieldNdc`, `touchFieldStrength`, `zoneArmed`) when the band owns the touch.
- **Center hold (primary voice affordance):** the band owns touch intent only. When the hold threshold is met (timer or bypass), the band calls `onCenterHoldAttempt(reportAccepted)`. AgentSurface decides accept/reject and calls `reportAccepted` exactly once; only accepted holds get `onCenterHoldEnd` on release. AgentSurface wires end-of-hold to `stopListeningAndRequestSubmit()`. See **docs/INTERACTION_CONTRACT.md** for the full contract.
- On touch release, if a center hold did not start and no higher-priority capture has taken over, the band maps final NDC X to rules/cards and calls `onClusterRelease`. Center release still commits nothing.
- Touch cancel clears band state and emits no semantic callback.

Additional current nuance:

- The band can be visually marked blocked via `blocked` / `blockedUntil` while I/O guardrails are active.
- Because this path is under active migration, treat the exact Gesture Handler ownership and activation details as implementation details, not as a frozen public contract.

When debug mode is enabled or panels are visible:

- `InteractionBand` is disabled.
- RN overlay content receives interaction priority.

### Touch arbitration (AgentSurface)

Arbitration remains a UI-layer decision, but the current code is slightly more explicit than the older doc wording. AgentSurface computes a single active interaction owner with priority:

- `debug`
- `overlay`
- `holdToSpeak`
- `swipeContext`
- `playbackTap`
- `none`

Current band enablement:

- **Debug mode** (`debugEnabled`) → InteractionBand **disabled**
- **Any revealed panel** (`anyPanelVisible`) → InteractionBand **disabled**
- **Lifecycle === 'processing'** → InteractionBand **disabled**
- Otherwise InteractionBand **enabled**

When the band becomes disabled, InteractionBand clears ref fields so the runtime does not retain phantom touch influence.

### Zone layout: single source of truth

Touch zone boundaries (rules / neutral / cards) are currently defined from **active-region NDC** in `src/visualization/interaction/zoneLayout.ts` via `NEUTRAL_HALF_WIDTH_NDC = 0.12`. The classification helper is `getZoneFromNdcX()`.

Current implementation invariant: zone classification **MUST** use InteractionBand's active-region NDC (`toNdc(locationX, locationY)` against canvas dimensions), not raw screen normalization. This remains the intended contract, but because the band bounds/top inset are still being actively adjusted, treat the exact active-region geometry as runtime-configured rather than permanently fixed.

Current bounds behavior:

- The band top inset defaults to `visualizationRef.current.scene?.zones.layout.bandTopInsetPx ?? 112`.
- Callers may override that inset via `InteractionBand`’s `topInsetOverridePx` when product layout requires it.
- Documentation should therefore refer to a runtime-configured top inset, not assume the scene-configured value is the only active path at all times.

### Visual touch affordance

`ClusterTouchZones` (TouchZones layer) provides GL affordances: cluster rings and screen-aligned area overlays (rules / neutral / cards).

### Interaction grammar

Canonical interaction behavior:

- **Voice input** — Press and hold on the center spine/core to begin listening; release to stop listening; submit runs once after transcript settlement. Earcon and haptic feedback occur on listening start and end. The center spine/core is the intended voice affordance (“press the organism core to speak”).
- **Playback** — Double tap to play answer; single tap to cancel playback.
- **Context exploration** — Swipe left/right reveals rules/cards panels only when relevant context exists; center release does nothing.

## Runtime Ref Contract (`VisualizationEngineRef`)

Key fields:

- activity: `activity`, `targetActivity`, `lambdaUp`, `lambdaDown`
- pulse slots: `pulsePositions`, `pulseTimes`, `pulseColors`, `lastPulseIndex`
- touch: `touchActive`, `touchWorld`, `touchInfluence`
- interaction band touch field: `touchFieldActive`, `touchFieldNdc`, `touchFieldStrength`
- scene controls: orbit/postfx/intensity/reduceMotion
- semantic snapshot: `lastEvent`, `signalsSnapshot`, panel rects

Writer split:

- App writes targets/events **only** through VisualizationController (and panel rects from AgentSurface/ResultsOverlay path).
- RuntimeLoop writes continuous derived values (`clock`, eased activity, touch influence, world/view touch mapping).

## Phase 6 Manual Verification Logging

During startup and lifecycle testing, the following subsystems emit logs (via `src/shared/logging/`). Use them as a manual verification harness:

- **AppBoot** — application boot started
- **AgentSurface** — mounted as active composition root
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
- Earcon/haptic hooks: `src/shared/feedback/earcons.ts`, `src/shared/feedback/haptics.ts` (listening start/end; assets at `assets/sound/earcon_in.wav`, `earcon_out.wav`)
- Agent roles: `src/app/agent/` — `useAgentOrchestrator.ts`, `useVisualizationController.ts`, `types.ts`, `index.ts`
- Agent AV mechanics: `src/app/agent/av/` — `avSurface.ts`, `sessionCoordinator.ts`, `remoteStt.ts`, `voiceNative.ts`, `avFacts.ts` (fact/event contract)
- Agent orchestrator-adjacent helpers: `src/app/agent/orchestrator/` — `telemetry.ts`, `artifactProjector.ts`, `transcriptSettlement.ts`, `modelPaths.ts`
- Signal hook: `src/app/hooks/useVisualizationSignals.ts`
- UI wrappers: `src/screens/voice/SemanticChannelView.tsx`, `src/app/ui/components/overlays/SemanticChannelLoadingView.tsx`
- Overlay/panels: `src/app/ui/components/overlays/ResultsOverlay.tsx`, `src/app/ui/components/panels/debug/PipelineTelemetryPanel.tsx`, `src/app/ui/components/panels/debug/VizDebugPanel.tsx`
- Visualization surface/canvas: `src/visualization/render/canvas/VisualizationSurface.tsx`, `VisualizationCanvas.tsx`, `VisualizationCanvasR3F.tsx`, `VisualizationCanvasFallback.tsx`
- Visualization interaction: `src/visualization/interaction/InteractionBand.tsx`, `InteractionProbe.tsx`, `zoneLayout.ts`, `TouchRaycaster.tsx`, `touchHandlers.ts`
- Scene/layers: `src/visualization/runtime/RuntimeLoop.tsx`, `applyVisualizationSignals.ts`, `render/layers/ContextGlyphs.tsx`, `ContextLinks.tsx`, `TouchZones.tsx`, `CameraOrbit.tsx`, `PostFXPass.tsx`
- Runtime/types: `src/visualization/runtime/runtimeTypes.ts`, `createDefaultRef.ts`, `src/visualization/scene/*`, `src/visualization/materials/*`, `src/visualization/utils/*`
- RAG feature: `src/rag/*`
- Pure utils: `src/utils/` (as needed)

## Known In-Progress Areas

- Panel gesture system from the refactor plan (header drag/snap/dismiss/restore + arbitration) is not fully implemented as a dedicated `src/screens/voice` gesture layer.
- InteractionBand native-fast migration is still in progress. Current code uses a Pan-based RNGH host with manual activation, non-collapsable host mounting, and optional probe diagnostics. Keep docs aligned to the active code path and avoid describing this layer as finalized.

**Plan D (Final Integration Pass):** Verified integration boundaries for acceptance → processing → settlement → playback → completion, telemetry ordering, and denial/stale-callback behavior; see `.cursor/plans/final_integration_pass.plan.md`.
