# App Architecture: Voice Screen + NodeMap

## High-level

- Root entry: `App.tsx` re-exports `src/app/App.tsx`.
- `src/app/App.tsx` composes `SafeAreaProvider` + `VoiceScreen`.
- `VoiceScreen` owns app state (voice, mode, responses, debug flags) and composes:
  - `NodeMapSurface` (visual background)
  - `UserVoiceView` (primary RN content)
  - `NodeMapInteractionBand` (cluster touch input, conditionally enabled)
  - `DevScreen` (debug panel wrapper)

## Runtime Ownership

### App layer owns

- Voice/TTS lifecycle
- RAG request lifecycle
- Reveal/block visibility state
- Mode transitions
- Semantic event emission (`tapCard`, `tapCitation`, etc.)
- Writes to `nodeMapRef` targets via signals/helpers

### NodeMap layer owns

- Visual simulation and render-loop math
- Shader uniforms and pulse/touch rendering
- Cluster visual emphasis/overlays
- Touch field world-space derivation from NDC

NodeMap does not own app UI decisions, content visibility, navigation, or RAG logic.

## Touch Path

When in user mode and no content panels are visible:

- `NodeMapInteractionBand` is enabled.
- It captures touch and writes `touchFieldActive/touchFieldNdc/touchFieldStrength`.
- On tap end, it maps NDC X to cluster side and calls `onClusterTap`.

When debug mode is enabled or panels are visible:

- `NodeMapInteractionBand` is disabled.
- RN overlay content receives interaction priority.

### Visual touch affordance

`ClusterTouchZones` provides GL affordances:

- cluster rings around rules/cards centers
- screen-aligned GL area overlays that reflect the interaction map:
  - left active area (rules)
  - center neutral strip
  - right active area (cards)

## Engine Ref Contract (`NodeMapEngineRef`)

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
- UI wrappers: `src/ui/UserVoiceView.tsx`, `src/ui/DevScreen.tsx`, `src/ui/VoiceLoadingView.tsx`, `src/ui/DebugZoneOverlay.tsx`
- Node map surface/canvas: `src/nodeMap/components/NodeMapSurface.tsx`, `NodeMapCanvas.tsx`, `NodeMapCanvasR3F.tsx`, `NodeMapCanvasFallback.tsx`
- Node map interaction: `src/nodeMap/components/NodeMapInteractionBand.tsx`, `src/nodeMap/interaction/TouchRaycaster.tsx`, `src/nodeMap/interaction/touchHandlers.ts`
- Scene components: `EngineLoop.tsx`, `ContextGlyphs.tsx`, `ContextLinks.tsx`, `ClusterTouchZones.tsx`, `CameraOrbit.tsx`, `PostFXPass.tsx`
- Node map types/helpers: `src/nodeMap/types.ts`, `src/nodeMap/helpers/*`
- RAG feature: `src/rag/*`
- Pure utils: `src/utils/log.ts`, `src/utils/validateVizState.ts`

## Known In-Progress Areas

- Panel gesture system from the refactor plan (header drag/snap/dismiss/restore + arbitration) is not fully implemented as a dedicated `src/ui` gesture layer.
- `VoiceScreen` remains large and still carries substantial orchestration logic.

