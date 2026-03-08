# Visualization

Visualization is a pure render subsystem. It exposes one public API:
`src/visualization/index.ts`.

## Ownership

1. **Scene contract owns aesthetics**
- Layout, colors, motion defaults, and draw-order policy live in:
  - `scene/formations.ts`
  - `scene/artDirection/*`
  - `scene/builders/*`

## Transient Effects Ownership (System-Wide)

Transient effects are data-driven; render layers respond to **shared modulation channels** derived from event identity + timing.

1. **Orchestrator/Controller** owns semantic event emission (what happened, when). It emits transient event identity only (e.g. via `emitEvent`).
2. **Engine / shared runtime** carries event identity + timing (`lastEvent`, `lastEventTime`) only.
3. **Shared effect definitions** live in `scene/artDirection/transientEffects/`. Each effect is data-only: decayMs and modulation peak values. No runtime logic in these files.
4. **Render-side helpers** derive modulation from event identity + timing + shared effect definitions.
5. **Render layers** consume only the derived modulation channels plus layer-scoped **response tuning** from their presets (e.g. `modulationWeights`, `modulationTintColor` on the light-core preset). Render-side helpers may interpret event identity for pulse routing, but render layers should not embed event-specific branching.

**Shared modulation contract:** modulation channels are `hueShift`, `intensity`, `agitation`, `opacityBias` (0..1). Layers apply these with their weights to produce pixels.

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
- `scene.motion`: motion-grammar output (runtime-mutated scalar signals)
  - `energy`, `tension`, `openness`, `settle`, `breath`, `attention`, `microMotion`, `phase`, `phaseT`

## Motion grammar

- Runtime engine: `engine/MotionGrammarEngine.ts`
- Active template: `scene/artDirection/motionGrammar/organismGrammar.ts` (barrel in `motionGrammar/index.ts`)
- Tick owner: `engine/EngineLoop.tsx` (runs after organism derivation; mutates existing `scene.motion` object only)
- Validation: `scene/validateSceneDescription.ts` enforces finite ranges and valid phase.

Tuning rule: adjust behavior in `scene/artDirection/motionGrammar/*` first; render layers should consume `scene.motion` and avoid hardcoded choreography constants.

## Directory map

- `engine/` — ref contract, state transforms, pulse plumbing, validation
- `scene/` — contract assembly + builders + art direction
- `scene/artDirection/transientEffects/` — shared transient effect definitions (data-driven; one file per effect)
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
