# App Architecture: Agent Surface + Visualization

## High-level

- Root entry: `App.tsx` re-exports `src/app/App.tsx`.
- `src/app/App.tsx` composes `SafeAreaProvider` + **AgentSurface**.
- **AgentSurface** is the top-level composition root for the agent experience. It composes:
  - **VisualizationSurface** (visual background)
  - **UserVoiceView** (scrollable RN content) wrapping **ResultsOverlay**
  - **InteractionBand** (cluster touch input, conditionally enabled)
  - **DevScreen** (debug panel wrapper when enabled)

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

**Emits:** Normalized lifecycle state (`idle` | `listening` | `retrieving` | `thinking` | `speaking` | `complete` | `error`) and optional listener callbacks (e.g. `onListeningStart`, `onTranscriptUpdate`, `onGenerationEnd`) for the VisualizationController.

**Does not know:** Visualization rendering, panel layout, render-layer internals, scene.motion or scene.organism details.

**Where:** `src/app/agent/useAgentOrchestrator.ts`, types in `src/app/agent/types.ts`.

### AgentSurface

**Owns:** Top-level user-facing composition.

- Composing VisualizationSurface, UserVoiceView, ResultsOverlay, InteractionBand, DevScreen
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

## Touch Path

When in user mode and no content panels are visible:

- `InteractionBand` is enabled.
- It captures touch and writes `touchFieldActive/touchFieldNdc/touchFieldStrength`.
- On touch release, it maps final NDC X to cluster side and calls `onClusterRelease` (center strip commits nothing).
- No semantic action is emitted on touch start/move; those phases are continuous organism response only.

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
- **Lifecycle === 'thinking' | 'retrieving'** → InteractionBand **disabled**.
- Otherwise InteractionBand **enabled**.

When the band becomes disabled, InteractionBand clears ref fields so the engine does not retain phantom touch influence.

### Zone layout: single source of truth

Touch zone boundaries (rules / neutral / cards) are defined in **active-region NDC** in `src/visualization/interaction/zoneLayout.ts`. Scene layout ratios in `formations.ts` are derived from that constant so TouchZones overlays align with what InteractionBand treats as left/center/right.

**Invariant:** NDC for zone classification **MUST** be active-region NDC (from `toNdc(bandRect, canvasSize)` in InteractionBand), **not** screen NDC.

### Visual touch affordance

`ClusterTouchZones` (TouchZones layer) provides GL affordances: cluster rings and screen-aligned area overlays (rules / neutral / cards).

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

## File Map (Current)

- App shell: `src/app/App.tsx`
- Composition root: `src/app/AgentSurface.tsx`
- Legacy alias: `src/app/VoiceScreen.tsx` (re-exports AgentSurface)
- Agent roles: `src/app/agent/` — `useAgentOrchestrator.ts`, `useVisualizationController.ts`, `ResultsOverlay.tsx`, `types.ts`, `index.ts`
- Signal hook: `src/app/hooks/useVisualizationSignals.ts`
- UI wrappers: `src/screens/voice/UserVoiceView.tsx`, `src/screens/dev/DevScreen.tsx`, `src/screens/voice/VoiceLoadingView.tsx`
- Viz dev overlay: `src/visualization/render/dev/DebugZoneOverlay.tsx`
- Visualization surface/canvas: `src/visualization/render/canvas/VisualizationSurface.tsx`, `VisualizationCanvas.tsx`, `VisualizationCanvasR3F.tsx`, `VisualizationCanvasFallback.tsx`
- Visualization interaction: `src/visualization/interaction/InteractionBand.tsx`, `zoneLayout.ts`, `TouchRaycaster.tsx`, `touchHandlers.ts`
- Scene/layers: `src/visualization/engine/EngineLoop.tsx`, `applySignalsToVisualization.ts`, `render/layers/ContextGlyphs.tsx`, `ContextLinks.tsx`, `TouchZones.tsx`, `CameraOrbit.tsx`, `PostFXPass.tsx`
- Engine/types: `src/visualization/engine/types.ts`, `createDefaultRef.ts`, `src/visualization/scene/*`, `src/visualization/materials/*`, `src/visualization/utils/*`
- RAG feature: `src/rag/*`
- Pure utils: `src/utils/log.ts`

## Known In-Progress Areas

- Panel gesture system from the refactor plan (header drag/snap/dismiss/restore + arbitration) is not fully implemented as a dedicated `src/screens/voice` gesture layer.
