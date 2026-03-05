# Visualization

Visualization is a pure render subsystem. It exposes one public API:
`src/visualization/index.ts`.

## Ownership

1. **Scene contract owns aesthetics**
- Layout, colors, motion defaults, and draw-order policy live in:
  - `scene/formations.ts`
  - `scene/artDirection/*`
  - `scene/builders/*`

2. **Builders own final spatial values**
- Builders/formations compute final `position.z` data for primitives.
- Renderers do not invent fallback Z layouts.

3. **Layers own draw order only**
- `scene.layers.*.renderOrderBase` is the source of render ordering.
- Renderers derive `renderOrder = renderOrderBase + localIndex`.

4. **Renderers are dumb**
- `render/layers/*` only consume scene/ref data, place meshes, and update uniforms.
- No aesthetic constants in render layers.

5. **Engine owns runtime state/time**
- `engine/*` owns mode transitions, ramps, smoothing, pulse state, touch influence state.

6. **Interaction owns input mapping**
- `interaction/*` captures gestures/taps and writes engine ref fields.
- Interaction does not own visual styling.
- Semantic split:
  - `InteractionBand` owns continuous touch field + release-based rules/cards commit.
  - Canvas short taps remain pulse-only (`pendingTapNdc` consumed by `TouchRaycaster`).

## Scene contract (current)

- `scene.layers`: draw-order sections (`renderOrderBase` only)
  - `background`, `spineLightCore`, `spineBase`, `spineShards`, `glyphsBack`, `links`, `glyphsFront`, `spineRot`, `debugOverlay`
- `scene.presets[mode]`: schema-level mode overrides (not renderer-owned logic)
  - canonical modes: `idle`, `listening`, `processing`, `speaking`
- `scene.touch`: validated touch art-direction stub
  - `zones`, `feedback`, `glyphResponse`

## Directory map

- `engine/` — ref contract, state transforms, pulse plumbing, validation
- `scene/` — contract assembly + builders + art direction
- `render/canvas/` — canvas host, post-FX, camera sync/orbit
- `render/layers/` — scene consumers (background, spine, glyphs, links, touch zones)
- `render/dev/` — dev-only visual tooling (DevPanel, DebugZoneOverlay)
- `interaction/` — touch arbitration/mapping helpers + interaction band
- `materials/` — shader/material sources
- `utils/` — visualization-local pure helpers

## Non-negotiables

- Keep app/screen state out of visualization.
- Keep theme imports out of visualization scene/render logic; consume injected values only.
- Add new scene fields in `formations.ts` + `validateSceneDescription.ts` together.
