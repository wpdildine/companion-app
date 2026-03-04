# Visualization Component Reference

Reference for the `src/visualization/` layer: components, ownership boundaries, and current behavior. See [ARCHITECTURE.md](./ARCHITECTURE.md), [APP_ARCHITECTURE.md](./APP_ARCHITECTURE.md), and [README.md](../README.md).

## Overview

Visualization is a pure visualization subsystem.

- It consumes injected theme primitives and a mutable engine ref.
- It does not own app state, voice lifecycle, navigation, or RAG decisions.
- React writes targets/events into the engine ref; render loop computes continuous visual state.

### GL state and scene description

- **Scene at runtime:** `getSceneDescription()` (scene/formations) is computed once at mount and stored on `visualizationRef.current.scene`. All GL components read zones, pulse anchors, and cluster anchors from that single instance. Scene recomputes only when `paletteId` or `vizIntensityProfile` changes so anchors/pulses stay deterministic.
- **Single aesthetic source:** All visual constants (zone colors, opacities, ratios, ring radii, edge color, etc.) live in formations / `getSceneDescription()`. Render components do viewport math and camera-facing placement only; they do not define style or zone policy. Missing scene values are a bug (no fallback constants).
- **Mode-driven GL state:** Idle — planes calm, zones faint, no clusters unless last answer had evidence. Processing — planes tighten, subtle motion, no new evidence clusters. Resolved (no evidence) — planes settle, no clusters. Resolved (with evidence) — rules/cards cluster counts appear, zone outlines strengthen. Warning / low confidence — links show in full mode; optional warning pulse at center.

## Directory

```text
src/visualization/
├── index.ts
├── engine/
├── scene/
├── render/
│   ├── canvas/
│   ├── layers/
│   └── dev/
├── interaction/
├── materials/
└── utils/
```

## Public API (`src/visualization/index.ts`)

- `VisualizationCanvas`
- `VisualizationSurface`
- `VisualizationCanvasR3F`
- `InteractionBand`
- `DevPanel`
- `triggerPulseAtCenter`
- `applySignalsToVisualization`
- `createDefaultVisualizationRef`
- `getSceneDescription`
- `validateSceneDescription`
- `TARGET_ACTIVITY_BY_MODE`
- `withTouchStubs`
- `validateVizState`
- types: `VisualizationEngineRef`, `GLSceneDescription`, etc.

## Core Components

### Surface/Canvas

- `VisualizationSurface`: layers canvas behind RN content. Canvas wrapper uses `pointerEvents="none"`; overlay content gets touches.
- `VisualizationCanvas`: runtime selector for R3F vs fallback.
- `VisualizationCanvasR3F`: Three/R3F scene path.
- `VisualizationCanvasFallback`: 2D dot fallback (non-empty, animates with activity target).

### Scene (R3F)

- `EngineLoop` (engine/): advances clock; eases activity/touch influence; resolves touch field NDC to world/view.
- `TouchRaycaster` (interaction/): resolves `pendingTapNdc` into pulse position.
- `CameraOrbit` (render/canvas/): camera placement/orbit state.
- `ContextGlyphs` (render/layers/): point clusters (rules/cards).
- `ContextLinks` (render/layers/): links between cluster nodes.
- `TouchZones` (render/layers/): dumb renderer; reads layout and style from `visualizationRef.current.scene` only. Ring outlines at cluster anchors; camera-facing zone planes (rules / center / cards) when `highlighted`. No hardcoded colors, ratios, or opacities.
- `PlaneLayerField` (render/layers/): background drift planes; reads layerCount, planeOpacity, driftPx from ref (future: scene.backgroundPlanes.style).
- `PostFXPass` (render/canvas/): optional post effects.

### Interaction

- `InteractionBand` (interaction/): top-layer touch capture; **only** writer of `touchFieldActive`, `touchFieldNdc`, `touchFieldStrength`. Sets `zoneArmed` from NDC vs scene zone bounds; on release in zone calls `onClusterTap`. RN owns panel visibility; GL emits events only.
- Tap mapping (in band):
  - `ndcX < -0.12` => `rules`
  - `ndcX > 0.12` => `cards`
- Band active region: below top inset (`BAND_TOP_INSET = 112`).

## Engine Ref (`engine/types.ts`)

- Factory: `createDefaultVisualizationRef()` (engine/createDefaultRef.ts)
- Mode type: `VisualizationMode`
- Signal type: `AiUiSignals`
- Ref type: `VisualizationEngineRef`

Ownership model:

- App writes targets/events (`targetActivity`, semantic events, toggles, etc.).
- EngineLoop writes derived/continuous values (`clock`, eased activity, touch influence, derived touch positions).

## Helpers

- `engine/applySignalsToVisualization.ts`: semantic signal -> engine targets/derived visual knobs.
- `engine/triggerPulse.ts`: event pulse injection.
- `scene/formations.ts`: cluster/build geometry helpers.
- `engine/getPulseColor.ts`: pulse color mapping.

## Touch Ownership Contract

When `VisualizationSurface` is used:

- Canvas does not receive direct pointer events.
- `InteractionBand` is the touch owner for map taps.
- RN UI overlays retain direct interaction (scroll, buttons, panel controls).

## Current Gaps / Cleanup Candidates

- `CameraSync.tsx` exists and is not wired.
- `PlaneLayerField.tsx` exists and is not wired in the live scene path.
