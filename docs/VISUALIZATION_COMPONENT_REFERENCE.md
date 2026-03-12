# Visualization Component Reference

Reference for the `src/visualization/` layer: components, ownership boundaries, and current behavior. See [ARCHITECTURE.md](./ARCHITECTURE.md), [APP_ARCHITECTURE.md](./APP_ARCHITECTURE.md), and [README.md](../README.md).

## Overview

Visualization is a pure visualization subsystem.

- It consumes injected theme primitives and a mutable runtime ref.
- It does not own app state, voice lifecycle, navigation, or RAG decisions.
- React writes targets/events into the runtime ref; render loop computes continuous visual state.

### GL state and scene description

- **Scene at runtime:** `getSceneDescription()` (scene/sceneFormations) is computed at viz ref init and stored on `visualizationRef.current.scene`. Render layers consume that scene contract directly.
- **Single aesthetic source:** All visual constants (zone colors, opacities, ratios, ring radii, edge color, etc.) live in formations / `getSceneDescription()`. Render components do viewport math and camera-facing placement only; they do not define style or zone policy. Missing scene values are a bug (no fallback constants).
- **Layer contract:** draw order is owned by `scene.layers.*.renderOrderBase`; builders supply final primitive Z values (renderers do not recompute Z layouts).
- **Preset/touch contract:** `scene.presets` is schema-level mode override data (not renderer-owned logic); `scene.touch` is validated touch-art direction state.
- **Mode-driven GL state:** Idle — planes calm, zones faint, no clusters unless last answer had evidence. Processing — planes tighten, subtle motion, no new evidence clusters. Resolved (no evidence) — planes settle, no clusters. Resolved (with evidence) — rules/cards cluster counts appear, zone outlines strengthen. Warning / low confidence — links show in full mode; optional warning pulse at center.

## Directory

```text
src/visualization/
├── index.ts
├── runtime/
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
- `applyVisualizationSignals`
- `createDefaultVisualizationRef`
- `getSceneDescription`
- `validateSceneSpec`
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

- `RuntimeLoop` (runtime/): advances clock; eases activity/touch influence; resolves touch field NDC to world/view; owns the shared visualization mode transition state used by motion/runtime consumers.
- `TouchRaycaster` (interaction/): resolves `pendingTapNdc` into pulse position.
- `CameraOrbit` (render/canvas/): camera placement/orbit state.
- `ContextGlyphs` (render/layers/): point clusters (rules/cards).
- `ContextLinks` (render/layers/): links between cluster nodes.
- `TouchZones` (render/layers/): dumb renderer; reads layout/style from `visualizationRef.current.scene` only. Ring outlines at cluster anchors; camera-facing zone planes (rules / center / cards) when `showTouchZones` is enabled in the ref. No hardcoded colors, ratios, or opacities.
- `Spine` (render/layers/): 5-plane spine + shard field + center halftone membrane; consumes builder-supplied `scene.spine`. Renders `SpineRotLayer` as child (same overlay group). Halftone targeting is plane-scoped: default is center plane only; `spineUseHalftonePlanes` adds halftone accents on center + `planeAccent` planes (not global-all planes). Spread/aperture/profile-facing motion now derives from the shared runtime transition rather than a separate layer-local mode ramp.
- `SpineRotLayer` (render/layers/): rotational planes in overlay space; consumes `scene.spineRot` and `scene.layers.spineRot`; rendered under the same group as Spine (no duplicate camera-facing transform). Returns null when `planeCountByMode` for current mode is 0.
- `BackgroundLayer` (`render/layers/BackgroundLayer.tsx`): background drift planes + panel projection planes; consumes `scene.backgroundPlanes`, `scene.layers`, and `scene.planeField`.
- `PostFXPass` (render/canvas/): optional post effects.

### Interaction

- `InteractionBand` (interaction/): top-layer touch capture; **only** writer of `touchFieldActive`, `touchFieldNdc`, `touchFieldStrength`. Sets `zoneArmed` from NDC vs scene zone bounds; on release in left/right zone calls `onClusterRelease` (center commits nothing). RN owns panel visibility; GL emits events only.
- Legacy callback note: `onClusterTap` may still appear in wiring as a compatibility alias, but release is the semantic commit phase.
- Tap mapping (in band):
  - `ndcX < -0.12` => `rules`
  - `ndcX > 0.12` => `cards`
- Band active region: below scene-configured top inset (`scene.zones.layout.bandTopInsetPx`; fallback `112`).
- Continuous vs discrete split:
  - touch start/move => continuous organism field updates only
  - touch end => semantic commit (`rules/cards`) based on final release position
  - touch cancel => clear only; no semantic callback
  - short tap in canvas => pulse-only path (`pendingTapNdc` -> `TouchRaycaster`)

## Runtime Ref (`runtime/runtimeTypes.ts`)

- Factory: `createDefaultVisualizationRef()` (runtime/createDefaultRef.ts)
- Mode type: `VisualizationMode`
- Signal type: `VisualizationSignals`
- Ref type: `VisualizationEngineRef`

Ownership model:

- App writes targets/events (`targetActivity`, semantic events, toggles, etc.).
- RuntimeLoop writes derived/continuous values (`clock`, eased activity, touch influence, derived touch positions, organism signals).
- RuntimeLoop also owns transition-aware visualization runtime state: requested mode (`currentMode`), display-facing read mode (`displayMode`), and shared handoff state (`modeTransitionFrom`, `modeTransitionTo`, `modeTransitionT`).

### Shared mode transitions

Visualization mode transitions are standardized through runtime-owned transition state.

- `currentMode` = requested visualization mode written from app semantics.
- `modeTransitionFrom` / `modeTransitionTo` / `modeTransitionT` = shared canonical handoff state.
- `displayMode` = runtime-facing read mode for discrete consumers that still need a mode value.

Rules:

- Shared consumers should interpolate from the runtime transition state when possible.
- Render layers must not invent independent mode-transition state machines.
- Local smoothing is acceptable only as render-time derivation from the runtime transition boundary, not as a second semantic source.

## Phase 3: Organism signals

Touch produces a continuous “alive” response (beam lean, bend, halftone tension, glyph attention) without affecting the discrete tap-to-pulse path.

**Where they live**

- **Ref (runtime):** `focusBias`, `touchPresence`, `touchPresenceNdc`, `focusZone`. Written only in RuntimeLoop.
- **Scene:** `scene.organism` — stub created once in `getSceneDescription()`; RuntimeLoop mutates its properties each frame (`presence`, `focusBias`, `ndc`, `zone`, `relax`, optional `shardBias`).
- **Constants:** `FOCUS_RANGE_NDC`, `TOUCH_PRESENCE_LAMBDA`, `TOUCH_NDC_LAMBDA`, and `computeFocusBias()` live in `interaction/zoneLayout.ts`.

**Tuning knobs**

- **zoneLayout.ts:** `FOCUS_RANGE_NDC` (focusBias scale), `TOUCH_PRESENCE_LAMBDA` (presence decay when released), `TOUCH_NDC_LAMBDA` (NDC jitter smoothing).
- **SpineLightCoreLayer:** beam lean amplitude (~5%), bend amplitude scale, presence opacity boost.
- **Spine (halftone):** organism intensity/skew plus density bias (e.g. 0.1, 0.02, 0.12).
- **Glyph shader (materials/glyphs/nodes):** attention opacity cap (0.12), size multiplier from attention.

No deep animation tuning in this phase; tap pulse path is unchanged.

## Phase 5: Atmospheric systems

Three systems provide environmental layering so the spine feels embedded in space rather than on a flat background:

- **Background field** — Environmental texture, halftone depth, vignette, slow drift, overall field tone. Owned by `BackgroundLayer`. The slowest-moving layer.
- **Back plane layer** — Large rear structural slabs or ghost planes behind the spine; architectural anchoring. Not “more spine planes”; distinct scene layer and renderer (BackPlaneLayer).
- **Context glyph atmosphere** — Contextual fragments in front of and behind the spine; ambient semantic field. Rendered as glyphsBack (softer, behind spine) and glyphsFront (more legible, in front). Not decorative UI icons.

**Canonical render order** (draw order via `scene.layers.*.renderOrderBase`): far background → back plane → glyphsBack → spine light core / base / shards → links → glyphsFront → spineRot → debug/foreground. Builders own placement and Z; renderers consume scene only. Glyph “behind/in front” of spine is enforced by render order when `depthWrite=false`.

**Where they live:** Background field — `scene/artDirection/backgroundFieldArtDirection.ts`, `scene/builders/backgroundField.ts`, `render/layers/BackgroundLayer.tsx`. Back plane layer — `scene/artDirection/backPlaneArtDirection.ts`, `scene/builders/backPlane.ts`, `render/layers/BackPlaneLayer.tsx`. Context glyph atmosphere — `scene/artDirection/contextGlyphsArtDirection.ts`, `scene/builders/contextGlyphs.ts`, `render/layers/ContextGlyphs.tsx`, `materials/glyphs/nodes.ts`. Glyph atmosphere is distinct from spine structure: glyphs are contextual semantic fragments (rules/cards cluster nodes) with front/back strata and relaxed attractor drift; the spine is the main structural stack (planes, shards, light core) owned by spine builders and renderers.

## Helpers

- `runtime/applyVisualizationSignals.ts`: semantic signal -> runtime targets/derived visual knobs.
- `runtime/triggerPulse.ts`: event pulse injection.
- `scene/sceneFormations.ts`: cluster/build geometry helpers.
- `runtime/getPulseColor.ts`: pulse color mapping.

## Touch Ownership Contract

When `VisualizationSurface` is used:

- Canvas does not receive direct pointer events.
- `InteractionBand` is the touch owner for map taps.
- RN UI overlays retain direct interaction (scroll, buttons, panel controls).

## Current Gaps / Cleanup Candidates

- `CameraSync.tsx` exists and is not wired.
- `scene.presets` exists as schema-level data and is not yet resolved/applied by a dedicated visual resolver.
