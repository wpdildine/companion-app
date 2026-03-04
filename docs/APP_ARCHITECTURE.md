# App Architecture: Voice Screen + Visualization

## High-level

- Root entry: `App.tsx` re-exports `src/app/App.tsx`.
- `src/app/App.tsx` composes `SafeAreaProvider` + `VoiceScreen`.
- `VoiceScreen` owns app state (voice, mode, responses, debug flags) and composes:
  - `VisualizationSurface` (visual background)
  - `UserVoiceView` (primary RN content)
  - `InteractionBand` (cluster touch input, conditionally enabled)
  - `DevScreen` (debug panel wrapper)

## Runtime Ownership

### App layer owns

- Voice/TTS lifecycle
- RAG request lifecycle
- Reveal/block visibility state
- Mode transitions
- Semantic event emission (`tapCard`, `tapCitation`, etc.)
- Writes to `visualizationRef` targets via signals/helpers

### Visualization layer owns

- Visual simulation and render-loop math
- Shader uniforms and pulse/touch rendering
- Cluster visual emphasis/overlays
- Touch field world-space derivation from NDC

Visualization does not own app UI decisions, content visibility, navigation, or RAG logic.

## Touch Path

When in user mode and no content panels are visible:

- `InteractionBand` is enabled.
- It captures touch and writes `touchFieldActive/touchFieldNdc/touchFieldStrength`.
- On tap end, it maps NDC X to cluster side and calls `onClusterTap`.

When debug mode is enabled or panels are visible:

- `InteractionBand` is disabled.
- RN overlay content receives interaction priority.

### Visual touch affordance

`ClusterTouchZones` provides GL affordances:

- cluster rings around rules/cards centers
- screen-aligned GL area overlays that reflect the interaction map:
  - left active area (rules)
  - center neutral strip
  - right active area (cards)

## Engine Ref Contract (`VisualizationEngineRef`)

Key fields:

- activity: `activity`, `targetActivity`, `lambdaUp`, `lambdaDown`
- pulse slots: `pulsePositions`, `pulseTimes`, `pulseColors`, `lastPulseIndex`
- touch: `touchActive`, `touchWorld`, `touchInfluence`
- interaction band touch field: `touchFieldActive`, `touchFieldNdc`, `touchFieldStrength`
- scene controls: orbit/postfx/intensity/reduceMotion
- semantic snapshot: `lastEvent`, `signalsSnapshot`, panel rects

Writer split:

- App writes targets/events.
- EngineLoop writes continuous derived values (`clock`, eased activity, touch influence, world/view touch mapping).

## File Map (Current)

- App shell: `src/app/App.tsx`
- Screen composition + app state: `src/app/VoiceScreen.tsx`
- UI wrappers: `src/screens/voice/UserVoiceView.tsx`, `src/screens/dev/DevScreen.tsx`, `src/screens/voice/VoiceLoadingView.tsx`
- Viz dev overlay: `src/visualization/render/dev/DebugZoneOverlay.tsx`
- Visualization surface/canvas: `src/visualization/render/canvas/VisualizationSurface.tsx`, `VisualizationCanvas.tsx`, `VisualizationCanvasR3F.tsx`, `VisualizationCanvasFallback.tsx`
- Visualization interaction: `src/visualization/interaction/InteractionBand.tsx`, `TouchRaycaster.tsx`, `touchHandlers.ts`
- Scene/layers: `src/visualization/engine/EngineLoop.tsx`, `render/layers/ContextGlyphs.tsx`, `ContextLinks.tsx`, `TouchZones.tsx`, `CameraOrbit.tsx`, `PostFXPass.tsx`
- Engine/types: `src/visualization/engine/types.ts`, `createDefaultRef.ts`, `src/visualization/scene/*`, `src/visualization/helpers/*`
- RAG feature: `src/rag/*`
- Pure utils: `src/utils/log.ts`

## Known In-Progress Areas

- Panel gesture system from the refactor plan (header drag/snap/dismiss/restore + arbitration) is not fully implemented as a dedicated `src/screens/voice` gesture layer.
- `VoiceScreen` remains large and still carries substantial orchestration logic.
