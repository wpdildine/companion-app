# NodeMap Component Reference

Reference for the `src/nodeMap/` visualization layer: components, ownership boundaries, and current behavior. See [ARCHITECTURE.md](ARCHITECTURE.md), [app-architecture.md](app-architecture.md), and [README.md](../README.md).

## Overview

NodeMap is a pure visualization subsystem.

- It consumes injected theme primitives and a mutable engine ref.
- It does not own app state, voice lifecycle, navigation, or RAG decisions.
- React writes targets/events into the engine ref; render loop computes continuous visual state.

### GL state and scene description

- **Scene at runtime:** `getSceneDescription()` (formations) is computed once at mount and stored on `nodeMapRef.current.scene`. All GL components read zones, pulse anchors, and cluster anchors from that single instance. Scene recomputes only when `paletteId` or `vizIntensityProfile` changes so anchors/pulses stay deterministic.
- **Single aesthetic source:** All visual constants (zone colors, opacities, ratios, ring radii, edge color, etc.) live in formations / `getSceneDescription()`. Render components do viewport math and camera-facing placement only; they do not define style or zone policy. Missing scene values are a bug (no fallback constants).
- **Mode-driven GL state:** Idle — planes calm, zones faint, no clusters unless last answer had evidence. Processing — planes tighten, subtle motion, no new evidence clusters. Resolved (no evidence) — planes settle, no clusters. Resolved (with evidence) — rules/cards cluster counts appear, zone outlines strengthen. Warning / low confidence — links show in full mode; optional warning pulse at center.

## Directory

```text
src/nodeMap/
├── index.ts
├── types.ts
├── components/
├── interaction/
├── helpers/
└── shaders/
```

## Public API (`src/nodeMap/index.ts`)

- `NodeMapCanvas`
- `NodeMapSurface`
- `NodeMapInteractionBand`
- `DevPanel`
- `triggerPulseAtCenter`
- `applySignalsToNodeMap`
- `createDefaultNodeMapRef`
- `getSceneDescription`
- `TARGET_ACTIVITY_BY_MODE`
- `withTouchStubs`
- types: `NodeMapEngineRef`, `GLSceneDescription`, etc.

## Core Components

### Surface/Canvas

- `NodeMapSurface`: layers canvas behind RN content. Canvas wrapper uses `pointerEvents="none"`; overlay content gets touches.
- `NodeMapCanvas`: runtime selector for R3F vs fallback.
- `NodeMapCanvasR3F`: Three/R3F scene path.
- `NodeMapCanvasFallback`: 2D dot fallback (non-empty, animates with activity target).

### Scene (R3F)

- `EngineLoop`: advances clock; eases activity/touch influence; resolves touch field NDC to world/view.
- `TouchRaycaster`: resolves `pendingTapNdc` into pulse position.
- `CameraOrbit`: camera placement/orbit state.
- `ContextGlyphs`: point clusters (rules/cards).
- `ContextLinks`: links between cluster nodes.
- `ClusterTouchZones`: dumb renderer; reads layout and style from `nodeMapRef.current.scene` only. Ring outlines at cluster anchors; camera-facing zone planes (rules / center / cards) when `highlighted`. No hardcoded colors, ratios, or opacities.
- `PlaneLayerField`: background drift planes; reads layerCount, planeOpacity, driftPx from ref (future: scene.backgroundPlanes.style).
- `PostFXPass`: optional post effects.

### Interaction

- `NodeMapInteractionBand`: top-layer touch capture; **only** writer of `touchFieldActive`, `touchFieldNdc`, `touchFieldStrength`. Sets `zoneArmed` from NDC vs scene zone bounds; on release in zone calls `onClusterTap`. RN owns panel visibility; GL emits events only.
- Tap mapping (in band):
  - `ndcX < -0.12` => `rules`
  - `ndcX > 0.12` => `cards`
- Band active region: below top inset (`BAND_TOP_INSET = 112`).

## Engine Ref (`types.ts`)

- Factory: `createDefaultNodeMapRef()`
- Mode type: `NodeMapMode`
- Signal type: `AiUiSignals`
- Ref type: `NodeMapEngineRef`

Ownership model:

- App writes targets/events (`targetActivity`, semantic events, toggles, etc.).
- EngineLoop writes derived/continuous values (`clock`, eased activity, touch influence, derived touch positions).

## Helpers

- `applySignalsToNodeMap.ts`: semantic signal -> engine targets/derived visual knobs.
- `triggerPulse.ts`: event pulse injection.
- `formations.ts`: cluster/build geometry helpers.
- `getPulseColor.ts`: pulse color mapping.

## Touch Ownership Contract

When `NodeMapSurface` is used:

- Canvas does not receive direct pointer events.
- `NodeMapInteractionBand` is the touch owner for map taps.
- RN UI overlays retain direct interaction (scroll, buttons, panel controls).

## Current Gaps / Cleanup Candidates

- `CameraSync.tsx` exists and is not wired.
- `PlaneLayerField.tsx` exists and is not wired in the live scene path.

