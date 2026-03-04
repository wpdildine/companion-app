# nodeMap → visualization folder refactor (revised)

## Overview

Pure refactor: rename `src/nodeMap` to `src/visualization` and restructure into `engine/`, `scene/`, `render/`, `interaction/`, `materials/`, `utils/` per the move map. No logic changes; fix all imports and add a single public entry. Optional renames (NodeMap* → Visualization*) after build is green.

---

## Three fixes (incorporated)

**Fix 1 — DevPanel location**  
Dev tools must not mix with runtime render layers.  
→ **`render/dev/DevPanel.tsx`** (not `render/DevPanel.tsx`).

**Fix 2 — Scene structure**  
- **formations** = contract (single source of truth).  
- **builders** = assembly logic.  
- **artDirection** = knobs.

```
scene/
  formations.ts
  validateSceneDescription.ts
  builders/
    spine.ts
  artDirection/
    spineArtDirection.ts
```

So: `helpers/formations/spine.ts` → **`scene/builders/spine.ts`** (not `scene/spine.ts`).

**Fix 3 — Interaction math**  
Add **empty** `zoneMath.ts` and `gestureMath.ts` in this refactor so the boundary is explicit:

```
interaction/
  InteractionBand.tsx
  TouchRaycaster.tsx
  touchHandlers.ts
  zoneMath.ts      ← new, empty
  gestureMath.ts   ← new, empty
```

---

*(Optional later: add render/adapters/ and extract scene→mesh logic from layers. Not in canonical tree.)*


## Current state

- **33 files** under `src/nodeMap`: components, helpers/formations, interaction, materials, shaders, types.
- **External import sites:** `src/app/VoiceScreen.tsx`, `src/app/hooks/useAiVizBridge.ts`, `src/ui/DevScreen.tsx`, `src/ui/DebugZoneOverlay.tsx`, `src/utils/validateVizState.ts`.
- **Important:** `validateVizState` lives in **`src/utils/validateVizState.ts`**, not in nodeMap. Move it to **`src/visualization/engine/validateVizState.ts`**.

---

## Target layout (canonical)

```
src/
  visualization/
    engine/
      types.ts
      createDefaultRef.ts
      EngineLoop.tsx
      validateVizState.ts
      applySignalsToNodeMap.ts
      triggerPulse.ts
      getPulseColor.ts

    scene/
      formations.ts
      validateSceneDescription.ts
      builders/
        spine.ts
      artDirection/
        spineArtDirection.ts

    render/
      canvas/
        VisualizationCanvasR3F.tsx
        NodeMapCanvas.tsx
        NodeMapSurface.tsx
        NodeMapCanvasFallback.tsx
        CameraOrbit.tsx
        CameraSync.tsx
        PostFXPass.tsx
        shaderDebugFlags.ts
      layers/
        Spine.tsx
        PlaneLayerField.tsx
        ContextGlyphs.tsx
        ContextLinks.tsx
        TouchZones.tsx
      dev/
        DevPanel.tsx

    interaction/
      InteractionBand.tsx
      TouchRaycaster.tsx
      touchHandlers.ts
      zoneMath.ts
      gestureMath.ts

    materials/
      basicPlaneMaterial.ts
      halftone/
        halftonePlaneMaterial.ts
        halftone.vert.ts
        halftone.frag.ts
      glyphs/
        nodes.ts
      links/
        connections.ts

    utils/
      colors.ts
      math.ts
      rng.ts

    index.ts
```

*Optional follow-up:* A later refactor can add `render/adapters/` (e.g. `sceneToSpine.ts`, `sceneToGlyphs.ts`) and move scene→mesh logic out of layer components. Not part of the canonical tree for this move.

---

## Move map (exact paths, revised)

| From | To |
|------|----|
| **Engine** | |
| `src/nodeMap/types.ts` | `src/visualization/engine/types.ts` |
| Extract from types.ts | `src/visualization/engine/createDefaultRef.ts` (`createDefaultNodeMapRef`, `TARGET_ACTIVITY_BY_MODE`) |
| `src/nodeMap/components/EngineLoop.tsx` | `src/visualization/engine/EngineLoop.tsx` |
| `src/utils/validateVizState.ts` | `src/visualization/engine/validateVizState.ts` |
| `src/nodeMap/helpers/applySignalsToNodeMap.ts` | `src/visualization/engine/applySignalsToNodeMap.ts` |
| `src/nodeMap/helpers/triggerPulse.ts` | `src/visualization/engine/triggerPulse.ts` |
| `src/nodeMap/helpers/getPulseColor.ts` | `src/visualization/engine/getPulseColor.ts` |
| **Scene** | |
| `src/nodeMap/helpers/formations.ts` | `src/visualization/scene/formations.ts` |
| `src/nodeMap/helpers/validateSceneDescription.ts` | `src/visualization/scene/validateSceneDescription.ts` |
| `src/nodeMap/helpers/formations/spineArtDirection.ts` | `src/visualization/scene/artDirection/spineArtDirection.ts` |
| `src/nodeMap/helpers/formations/spine.ts` | `src/visualization/scene/builders/spine.ts` |
| **Render** | |
| `src/nodeMap/components/NodeMapCanvasR3F.tsx` | `src/visualization/render/canvas/VisualizationCanvasR3F.tsx` (rename in rename step) |
| `src/nodeMap/components/NodeMapCanvas.tsx` | `src/visualization/render/canvas/NodeMapCanvas.tsx` |
| `src/nodeMap/components/NodeMapSurface.tsx` | `src/visualization/render/canvas/NodeMapSurface.tsx` |
| `src/nodeMap/components/NodeMapCanvasFallback.tsx` | `src/visualization/render/canvas/NodeMapCanvasFallback.tsx` |
| `src/nodeMap/components/CameraOrbit.tsx` | `src/visualization/render/canvas/CameraOrbit.tsx` |
| `src/nodeMap/components/CameraSync.tsx` | `src/visualization/render/canvas/CameraSync.tsx` |
| `src/nodeMap/components/PostFXPass.tsx` | `src/visualization/render/canvas/PostFXPass.tsx` |
| `src/nodeMap/components/shaderDebugFlags.ts` | `src/visualization/render/canvas/shaderDebugFlags.ts` |
| `src/nodeMap/components/Spine.tsx` | `src/visualization/render/layers/Spine.tsx` |
| `src/nodeMap/components/PlaneLayerField.tsx` | `src/visualization/render/layers/PlaneLayerField.tsx` |
| `src/nodeMap/components/ContextGlyphs.tsx` | `src/visualization/render/layers/ContextGlyphs.tsx` |
| `src/nodeMap/components/ContextLinks.tsx` | `src/visualization/render/layers/ContextLinks.tsx` |
| `src/nodeMap/components/TouchZones.tsx` | `src/visualization/render/layers/TouchZones.tsx` |
| `src/nodeMap/components/DevPanel.tsx` | `src/visualization/render/dev/DevPanel.tsx` |
| **Interaction** | |
| `src/nodeMap/components/NodeMapInteractionBand.tsx` | `src/visualization/interaction/InteractionBand.tsx` (rename in rename step) |
| `src/nodeMap/interaction/TouchRaycaster.tsx` | `src/visualization/interaction/TouchRaycaster.tsx` |
| `src/nodeMap/interaction/touchHandlers.ts` | `src/visualization/interaction/touchHandlers.ts` |
| (new) | `src/visualization/interaction/zoneMath.ts` (empty) |
| (new) | `src/visualization/interaction/gestureMath.ts` (empty) |
| **Materials** | |
| `src/nodeMap/materials/basicPlaneMaterial.ts` | `src/visualization/materials/basicPlaneMaterial.ts` |
| `src/nodeMap/materials/halftone/halftonePlaneMaterial.ts` | `src/visualization/materials/halftone/halftonePlaneMaterial.ts` |
| `src/nodeMap/materials/halftone/halftone.vert.ts` | `src/visualization/materials/halftone/halftone.vert.ts` |
| `src/nodeMap/materials/halftone/halftone.frag.ts` | `src/visualization/materials/halftone/halftone.frag.ts` |
| `src/nodeMap/shaders/nodes.ts` | `src/visualization/materials/glyphs/nodes.ts` |
| `src/nodeMap/shaders/connections.ts` | `src/visualization/materials/links/connections.ts` |
| **Utils** | |
| (new or extract) | `src/visualization/utils/colors.ts` |
| (new or extract) | `src/visualization/utils/math.ts` |
| (new or extract) | `src/visualization/utils/rng.ts` |

---

## Cursor-safe execution order (do exactly this)

### Step 1 — Create new folders only

- Create `src/visualization/` and all subfolders:
  - `engine/`
  - `scene/`, `scene/builders/`, `scene/artDirection/`
  - `render/`, `render/canvas/`, `render/layers/`, `render/dev/`
  - `interaction/`
  - `materials/`, `materials/halftone/`, `materials/glyphs/`, `materials/links/`
  - `utils/`
- **No file moves yet.** No edits to existing nodeMap files.
- Add empty placeholder files so the tree exists: `interaction/zoneMath.ts`, `interaction/gestureMath.ts` (empty stubs), and `utils/colors.ts`, `utils/math.ts`, `utils/rng.ts` (empty stubs if no existing code to move).

### Step 2 — Move materials first

- Move **only** materials (and shaders into materials):
  - `nodeMap/materials/*` → `visualization/materials/`
  - `nodeMap/shaders/nodes.ts` → `visualization/materials/glyphs/nodes.ts`
  - `nodeMap/shaders/connections.ts` → `visualization/materials/links/connections.ts`
- Fix **every import** that points at the old paths (inside nodeMap and, if any, outside).
- **Build.** Ensure green before proceeding.

### Step 3 — Move render components

- Move **components** into render:
  - Canvas-related → `render/canvas/` (NodeMapCanvasR3F, NodeMapCanvas, NodeMapSurface, Fallback, CameraOrbit, CameraSync, PostFXPass, shaderDebugFlags).
  - Layer components → `render/layers/` (Spine, PlaneLayerField, ContextGlyphs, ContextLinks, TouchZones).
  - DevPanel → `render/dev/DevPanel.tsx`.
  - EngineLoop → `engine/EngineLoop.tsx` (can be done in same batch or with engine step).
- Fix all imports (internal and from app/ui).
- **Build.** Ensure green.

### Step 4 — Move engine, scene, interaction

- Move engine: types, createDefaultRef (extract from types), EngineLoop if not done, validateVizState from utils, applySignalsToNodeMap, triggerPulse, getPulseColor.
- Move scene: formations.ts, validateSceneDescription.ts, builders/spine.ts, artDirection/spineArtDirection.ts.
- Move interaction: NodeMapInteractionBand → InteractionBand, TouchRaycaster, touchHandlers; ensure zoneMath.ts and gestureMath.ts exist (empty or stubbed).
- Fix all imports. Remove `src/nodeMap` and `src/utils/validateVizState.ts`.
- **Build.** Ensure green.

### Step 5 — Public entry and renames

- Add `src/visualization/index.ts` with the public surface (getSceneDescription, validateSceneDescription, createDefaultRef / createDefaultNodeMapRef, VisualizationCanvasR3F or NodeMapCanvasR3F, engine ref type, NodeMapCanvas, NodeMapSurface, InteractionBand, DevPanel, triggerPulseAtCenter, applySignalsToNodeMap, withTouchStubs, TouchCallbacks).
- Point app, ui, and utils imports to `../visualization` or `../visualization/engine` as appropriate.
- Apply renames: **NodeMapCanvasR3F** → **VisualizationCanvasR3F**, **NodeMapInteractionBand** → **InteractionBand**; optionally **NodeMapEngineRef** → **VisualizationEngineRef**, **createDefaultNodeMapRef** → **createDefaultRef**.
- **Build and test.** Green.

### Step 6 — Refactor rules and docs

- Add `src/visualization/README.md` (or `docs/visualization/ARCHITECTURE.md`) with the four rules (scene = aesthetic source; layers dumb; interaction no visuals; engine owns time/state).
- Update ARCHITECTURE.md, README.md, AGENT_RULES.md, APP_ARCHITECTURE.md, NODEMAP_COMPONENT_REFERENCE.md (or rename to VISUALIZATION_COMPONENT_REFERENCE.md), FORMATIONS_SPINE.md, SPINE_CONTROL_SETTINGS.md, and docs/plans/* to use visualization paths and new names.

### Step 7 (optional follow-up) — Extract adapters

- Add `render/adapters/` and extract scene→mesh logic from Spine.tsx into `sceneToSpine.ts`, from ContextGlyphs into `sceneToGlyphs.ts`. Keep layers dumb: call adapters, then update uniforms/transforms.

---

## Refactor rules (for README / ARCHITECTURE in visualization)

1. **Scene is the only aesthetic source** — Layout/colors/motion in `scene/formations.ts` and `scene/artDirection/*` (and materials). Renderers do not define default look constants.
2. **Render layers are dumb** — `render/layers/*` read `ref.current.scene`, update uniforms/transforms; no layout/color/motion constants. (Optional later: move scene→mesh logic into `render/adapters/`.)
3. **Interaction never owns visuals** — `interaction/*`: touch capture, mapping to engine ref, tap vs drag; zone/hit and gesture math in zoneMath.ts / gestureMath.ts.
4. **Engine owns time and state** — State transitions, ramps, smoothing in `engine/*`.
5. **Dev is separate** — Dev tools live under `render/dev/`, not mixed with runtime layers.

---

## Summary of changes from original plan

- **DevPanel** → `render/dev/DevPanel.tsx`.
- **Scene** → `scene/builders/spine.ts` (and `scene/formations.ts`, `scene/artDirection/*`).
- **Interaction** → add empty `zoneMath.ts` and `gestureMath.ts` in Step 1 or early.
- **Utils** → `utils/colors.ts`, `utils/math.ts`, `utils/rng.ts` (stubs or moved from existing).
- **Execution** → Step 1: folders only. Step 2: materials first, fix imports, build. Step 3: render components, fix imports, build. Then engine/scene/interaction, index, renames, docs, and optional adapters extraction.
