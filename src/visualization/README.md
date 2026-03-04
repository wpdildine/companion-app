# Visualization

3D visualization engine: scene contract, engine ref, render layers, interaction, materials. Single public surface: `src/visualization/index.ts`.

## Rules

1. **Scene is the only aesthetic source** — Layout, colors, and motion live in `scene/formations.ts` and `scene/artDirection/` (and materials/shaders). Renderers do not define default look constants.

2. **Render layers are dumb** — `render/layers/` only read `ref.current.scene`, update uniforms/transforms; no layout/color/motion constants.

3. **Interaction never owns visuals** — `interaction/` does touch capture and mapping to engine ref; tap vs drag decisions only.

4. **Engine owns time and state** — State transitions, ramps, and smoothing live in `engine/`.
