# Spine Control Settings

Single source of truth for spine art-direction knobs:
- Code: `src/visualization/scene/artDirection/spine` (barrel; spineArtDirection composes base + rot + shards + halftone + power presets).
- Consumer: `src/visualization/scene/builders/spine.ts` -> `buildSpineDescription()`; `buildSpineRotPlanes.ts` -> rot layer.
- Renderer: `src/visualization/render/layers/Spine.tsx`, `SpineRotLayer.tsx` (consume scene; do not define art-direction defaults).

Render-order contract (current):
- Draw order comes from `scene.layers` in `src/visualization/scene/formations.ts`
- Spine sections:
  - `layers.spineBase.renderOrderBase`
  - `layers.spineShards.renderOrderBase`
  - `layers.spineRot.renderOrderBase`
- Spine plane/mesh Z comes from builder-supplied scene values (`scene.spine.planes[i].z`, `scene.spine.shards[i].z`)

This file documents what each control block does, how to tune it, and which controls are safest to touch first.

## 1) Tuning Order (Recommended)

1. `visibility`
2. `composition`
3. `shards`
4. `halftoneProfiles`
5. `motion`
6. `envelope`

If the spine is hard to read, do not start with motion. Fix value/opacity hierarchy first.

## 2) Control Blocks

### `envelope`

- `width`: overall spine channel width in active-region NDC.
- `height`: overall stack height in active-region NDC.
- `centerY`: vertical placement of the whole channel.

Use this block for gross framing changes only.

### `visibility`

- `baseOpacity`: global alpha baseline for all core planes.
- `opacityBoostFromHalftone`: multiplies opacity response by mode halftone intensity.
- `halftoneOpacityScale`: extra alpha multiplier for center halftone membrane plane.
- `shardOpacityScale`: global alpha multiplier for shard field.
- `halftoneDebugFlat`: debug lock to flatten halftone behavior.
- `blend`: normal/additive baseline for non-accent materials.

If support planes vanish, increase `baseOpacity` and/or `planeOpacityScale` before changing colors.

### `composition`

- `planeCount`: currently fixed at 5.
- `planeWidthScale`: per-plane width hierarchy.
- `planeHeightScale`: per-plane height hierarchy.
- `planeOffsetX`: horizontal misregistration (decon offset).
- `planeOffsetY`: vertical misregistration.
- `planeZOffset`: per-plane local z perturbation.
- `planeOpacityScale`: core opacity ladder (ghost/support/hero/support/ghost).
- `planeColors`: per-plane tonal hierarchy.
- `planeAccent`: additive accent flags per plane.
- `planeRenderOrder`: deterministic painter’s order.
- `planeGap`: negative values increase overlap/occlusion.
- `zStep`: depth separation baseline.
- `halftoneEnabled`: center membrane shader on/off.
- `halftoneFadeMode`: `none | radial | linear | angled`.
- `halftoneFadeInner`, `halftoneFadeOuter`, `halftoneFadePower`: fade envelope/curve.
- `halftoneFadeAngle`: angled fade direction in radians.
- `halftoneFadeOffset`: shifts angled fade along its direction.
- `halftoneFadeCenterX`, `halftoneFadeCenterY`: UV center for directional/radial calculations.
- `halftoneFadeLevels`: number of posterization bands (1 disables stepping).
- `halftoneFadeStepMix`: blend between smooth and stepped fade.

Most “it looks flat” issues are resolved in this block.

### `motion`

- `driftAmpX`, `driftAmpY`, `driftHz`: global spine drift.
- `idleBreathAmp`, `idleBreathHz`: subtle idle/listening breathing.
- `perPlaneDriftScale`, `perPlaneDriftPhaseStep`: independent per-plane drift.
- `processingOverflowBoost`: processing width amplification.
- `processingExtraOverlap`: additional processing overlap (more negative = tighter bite).
- `processingHeightBoost`: processing plane height expansion.
- `processingMotionBoost`: processing drift speed multiplier.
- `processingEdgeBoost`: processing edge treatment boost.

Target behavior: noticeable after ~2-3 seconds, never twitchy.

### `halftoneProfiles`

Per mode:
- `intensity`: membrane visibility/strength driver.
- `density`: dot frequency; keep stable across modes unless intentional state grammar is needed.

Modes:
- `idle`: present but quiet
- `listening`: more legible
- `processing`: strongest
- `speaking`: calmer

### `shards`

- `countsByMode`: visible shard count budget per mode.
- `zOffsetMin`, `zOffsetMax`: bounded depth spread.
- `membraneBandOffsetY`: how much shard population stays near membrane.
- `coolPalette`, `ghostPalette`, `accentPalette`, `accentColor`: shard palette families.

If scene looks noisy, reduce count first. If it looks empty, increase shard opacity before count.

### Rotational layer (spineRot)

- **Art direction:** `scene/artDirection/spine/spineRotPreset.ts`; all knobs merged via `SPINE_ART_DIRECTION.rot`.
- **Composition by mode:** idle 2–4, listening 3–5, processing 4–6, speaking 2–3 planes; ±6°–±14° rotation; slight scale variance; coordinate convention = overlay space (local `z`, local `rotationZ`); Z from builder.
- **Motion:** Static from builder; no drift in renderer.
- **Materials:** Ghost (basicPlaneMaterial, `depthWrite=false`, `depthTest=false`, `transparent`, opacity = `plane.opacityScale * spineRot.opacityBase`); at most one plane uses halftone accent.
- **Visibility:** `planeCountByMode`; renderer returns null when count for current mode is 0. Render order and Z from builder; spineRot uses `scene.layers.spineRot.renderOrderBase` exclusively.

## 3) Practical Guardrails

- Keep `planeCount` at 5 unless renderer contract changes.
- Keep background render order below foreground; spine ordering is controlled by `scene.layers` (not hardcoded 900-range values).
- Prefer changing one block at a time and verifying on both iOS + Android.
- Avoid simultaneous large changes to `baseOpacity`, `planeOpacityScale`, and post-FX vignette.

## 4) Quick Troubleshooting Map

- Symptom: outer planes disappear
  - Check `baseOpacity`, `planeOpacityScale`, and color contrast first.
- Symptom: center membrane is invisible
  - Check `halftoneEnabled`, `halftoneOpacityScale`, `halftoneProfiles[mode].intensity`.
- Symptom: stack looks too uniform
  - Increase `planeOffsetX/Y` range and/or make `planeGap` more negative.
- Symptom: composition feels muddy
  - Lower `countsByMode`, then retune `shardOpacityScale`.
