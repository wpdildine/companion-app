# Viz Component Reference

Reference for the `src/nodeMap/` visualization layer: elements, responsibilities, and redundancy notes. See [ARCHITECTURE.md](ARCHITECTURE.md) for placement rules, [app-architecture.md](app-architecture.md) for high-level data flow and voice/RAG integration, and [README.md](../README.md) for product context.

---

## Overview

The viz layer is the **GL UI** for the node map: a fullscreen Three.js/R3F visualization (node clusters, connections) that drives activity and pulses from app mode (idle, listening, processing, speaking, touched, released). It is a **pure visualization layer**—injected theme primitives, engine ref, and touch callbacks; no direct IO or app state.

---

## Directory Structure

```
src/nodeMap/
├── index.ts              # Public exports
├── types.ts               # VizEngineRef, VizMode, AiUiSignals, etc.
├── components/            # React components
├── interaction/          # Touch handling (raycaster, callbacks)
├── helpers/               # Pure functions
└── shaders/               # GLSL vertex/fragment
```

---

## Components

### Canvas & Surface

| Component | Purpose |
|-----------|---------|
| **VizCanvas** | Root container with R3F fallback. Dynamically loads `VizCanvasR3F` when available; uses `VizCanvasFallback` when R3F fails or is skipped (e.g. Android). Wraps R3F in `VizErrorBoundary` so crashes fall back to 2D. |
| **VizSurface** | Wrapper that layers the GL canvas behind content. Canvas uses `pointerEvents="none"`; content (ScrollView, etc.) overlays with `pointerEvents="box-none"`. Use for seamless layering: canvas = animated field, UI = readable panels on top. |
| **VizCanvasR3F** | R3F implementation: `Canvas` with `EngineLoop`, `TouchRaycaster`, `CameraOrbit`, `ClusterTouchZones`, `ContextGlyphs`, `ContextLinks`, `PostFXPass`. Touch: tap → raypick → pulse; double-tap / long-press / drag via callbacks. |
| **VizCanvasFallback** | 2D fallback when R3F is unavailable. Dark background; intended to show a sphere-projected grid of dots that pulse with activity. Polls `vizRef.targetActivity` every 120ms. |

### Scene Elements (R3F children)

| Component | Purpose |
|-----------|---------|
| **EngineLoop** | Render-loop only: advances `clock`, smooths `activity` toward `targetActivity`, eases `touchInfluence`. Converts `touchFieldNdc` → `touchWorld` / `touchView` via raycaster. Drives event pulses (`lastEvent` → `tapCitation`, `tapCard`, `chunkAccepted`, `warning`) at cluster centers. Updates `autoRotX/Y/Z`. |
| **TouchRaycaster** | Processes `pendingTapNdc` from canvas tap: raycast to camera-facing plane at origin, triggers pulse at 3D hit. |
| **CameraOrbit** | Positions camera from `orbitTheta` / `orbitPhi` (drag-to-explore). Radius 13.5. |
| **ClusterTouchZones** | Visual touch affordances: ring meshes at rules/cards cluster centers. Visible when `rulesClusterCount` / `cardsClusterCount` > 0; opacity varies with `touchInfluence`. |
| **ContextGlyphs** | Two clusters (rules left, cards right): point cloud with custom shader. Breathing, drift, glow, pulse, touch repulsion. Visibility gated by `rulesClusterCount` / `cardsClusterCount` and `vizIntensity`. |
| **ContextLinks** | Bezier curve segments between cluster nodes. Flow + pulse in shader. Visibility: `vizIntensity === 'full'` and `confidence < 0.7`. |
| **PlaneLayerField** | 1–2 translucent planes (plan C2) with drift; optional panel planes (answer, cards, rules) positioned from `panelRects`. Uses `layerCount`, `planeOpacity`, `driftPx`, `hueShift`, `reduceMotion`. |
| **PostFXPass** | Post-processing: vignette, chromatic aberration, grain. Renders scene to render target, then fullscreen quad with shader. Gated by `postFxEnabled`. |
| **DevPanel** | Developer overlay: palette, easing, viz toggles, state cycle. Writes only into engine ref. Gate: long-press on status header sets `devEnabled`. |

### Interaction

| Component | Purpose |
|-----------|---------|
| **VizInteractionBand** | Optional overlay that captures drag/tap and drives the canvas-owned touch field (`touchFieldActive`, `touchFieldNdc`, `touchFieldStrength`). On tap end, maps NDC to cluster: `ndc[0] < -0.12` → rules, `ndc[0] > 0.12` → cards; calls `onClusterTap`. Selection zones are highlighted in GL via stronger `ClusterTouchZones` emphasis when interaction mode is active. |

---

## Interaction Layer

| File | Purpose |
|------|---------|
| **TouchRaycaster.tsx** | R3F component; processes `pendingTapNdc` each frame, raycasts, writes pulse. |
| **touchHandlers.ts** | `TouchCallbacks` interface and `withTouchStubs()`—fills missing handlers with no-ops so callers can pass only what they need. |

---

## Helpers

| File | Purpose |
|------|---------|
| **triggerPulse.ts** | `triggerPulseAtCenter(vizRef)` — sets next pulse slot at center with `chunkAccepted` color. Public API for events (transcript, answer received). |
| **applySignalsToViz.ts** | Single bridge: App writes to vizRef only via this (plus intensity/reduceMotion). Derives `currentMode` from `phase`; stores `lastEvent`/`lastEventTime`; derives `rulesClusterCount`, `cardsClusterCount`, `layerCount`, `deconWeight`, `planeOpacity`, `driftPx`, `hueShift` from signals. |
| **formations.ts** | `buildCrystallineSphere()`, `buildTwoClusters()`, `getTwoClusterCenters()`. Node positions, cluster topology, edge definitions. |
| **getPulseColor.ts** | Single source for pulse color. `getPulseColor()` and `getPulseColorWithHue()` — palette by `paletteId`, event type, mode. No theme import. |
| **validateVizState.ts** | Pure validation of VizEngineRef shape/ranges. Use in `__DEV__` or tests. |

---

## Shaders

| File | Purpose |
|------|---------|
| **nodes.ts** | Node cloud: `nodeVertex`, `nodeFragment`. Breathing, leaf drift, pulse intensity, glow, touch repulsion. `uActivity`, `uPulsePositions/Times/Colors`, `uTouchWorld`, `uTouchInfluence`. |
| **connections.ts** | Connection layer: `connectionVertex`, `connectionFragment`. Bezier curve, flow along path, pulse, `uActivity`. |

---

## Types (`types.ts`)

- **VizMode** — `idle` \| `listening` \| `processing` \| `speaking` \| `touched` \| `released`
- **AiUiSignals** — `phase`, `grounded`, `confidence`, `retrievalDepth`, `cardRefsCount`, `event`
- **VizEngineRef** — Mutable engine state: clock, activity, pulse slots, touch state, orbit angles, post FX, panel rects, etc.
- **TARGET_ACTIVITY_BY_MODE** — Target activity per mode
- **createDefaultVizRef()** — Factory for default engine ref

---

## Redundancy & Orphaned Code

### Unused / Orphaned Components

| Item | Status | Notes |
|------|--------|-------|
| **CameraSync** | **Unused** | Exists in `components/CameraSync.tsx` but never imported. Syncs orthographic camera bounds to canvas; current scene uses perspective camera via `CameraOrbit`. |
| **PlaneLayerField** | **Unused** | Exists in `components/PlaneLayerField.tsx` but never imported by `VizCanvasR3F` or any other component. Renders translucent planes and panel overlays. |

### Incomplete Implementation

| Item | Issue |
|------|-------|
| **VizCanvasFallback** | Builds `NODES` (72 `NodePoint`) and `activity`/`tick` state, but the JSX returns only `<View style={...} />` with no children. The dots are never rendered; fallback shows a solid background only. |

### Duplicate / Overlapping Logic

| Area | Notes |
|------|-------|
| **Touch handling** | `VizCanvasR3F` has inline touch handlers (tap, double-tap, long-press, drag) that drive `touchFieldActive`, `touchFieldNdc`, `pendingTapNdc`, and orbit. When used inside `VizSurface`, the canvas has `pointerEvents="none"`, so these handlers never run. `VizInteractionBand` is the actual touch source in that layout. The R3F touch logic is only active if `VizCanvas` is used standalone with `inputEnabled` and pointer events enabled. |
| **Cluster centers** | `getTwoClusterCenters()` is called in `EngineLoop` (ref, once), `ClusterTouchZones` (useMemo), and `ContextLinks` (via `buildTwoClusters`). `buildTwoClusters()` is called in `ContextGlyphs`, `ContextLinks`, and `getTwoClusterCenters`. Formation is stable; no functional redundancy, but multiple call sites. |
| **Pulse uniforms** | `ContextGlyphs` and `ContextLinks` both copy `pulsePositions`, `pulseTimes`, `pulseColors` from vizRef into shader uniforms each frame. Necessary—each shader needs them. |
| **getPulseIntensity** | Same GLSL `getPulseIntensity()` function duplicated in `nodes.ts` and `connections.ts`. Could be extracted to a shared include if GLSL tooling supports it. |

---

## Recommendations

1. **Remove or wire orphaned components** — Either integrate `CameraSync` and `PlaneLayerField` into the scene, or remove them to reduce confusion.
2. **Fix VizCanvasFallback** — Render the built `NODES` (e.g. as positioned Views or a simple 2D canvas) so the fallback provides a meaningful visual.
3. **Clarify touch ownership** — Document that when `VizSurface` is used, `VizInteractionBand` owns touch; R3F touch handlers are for standalone canvas usage.
4. **Update app-architecture.md** — Align file map and component names with current `src/viz/` structure.
