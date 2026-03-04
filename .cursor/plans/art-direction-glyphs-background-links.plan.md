# Art direction extension: glyphs, background, links

## Overview

Extend the spine-style art-direction pattern so **scene is the only aesthetic source** and render layers (ContextGlyphs, PlaneLayerField, optionally ContextLinks) become **dumb**: they only read `nodeMapRef.current.scene`, position meshes, assign materials, and update uniforms. No visual constants (colors, opacities, counts, radii, drift, mask params) defined in render code.

**Core rule:** Render layers must not define fallback look values except safe null-guards (return null + dev log if scene missing).

---

## Current state (brief)

- **spineArtDirection.ts** — Exports `SPINE_ART_DIRECTION` (envelope, visibility, composition, motion, halftoneProfiles, shards). Spine builder imports it; `buildSpineDescription()` is scene-driven.
- **formations.ts** — `getSceneDescription()` builds zones, clusters, links, backgroundPlanes, spine. **Cluster/glyph** layout and colors come from hardcoded `clustersLayout` / `clustersStyle` (radius 1.15, sizeBaseRules, rulesRgb/cardsRgb from zonesStyle). **backgroundPlanes** is a minimal schema: count, opacityBase, opacitySecond, driftPxNorm, hue, sat, lum. **links**: edges + segmentsPerEdge (12).
- **ContextGlyphs** — Reads `scene.clusters.nodes` for positions/sizes/colors; builds buffers from them. **Still has**: hardcoded uniforms (uBaseNodeSize 5.25, uPulseSpeed 4, uTouchRadius 3.6, uTouchStrength 2.8, uTouchMaxOffset 1.35), and decay phase/rate/depth from hardcoded seeds. No module-level FORMATION constants; visibility from engine ref (rulesClusterCount, cardsClusterCount).
- **PlaneLayerField** — Reads `scene.backgroundPlanes` for count, opacityBase/Second, hue/sat/lum. **Still has**: hardcoded z-depths (6.5, 6.7), scale multipliers (1.22, 1.6), targetIntensity/targetThreshold/targetScale formulas, panelOpacity factor 0.48, and inline shader constants (vignette 0.15/0.65, halftone 72/0.28, gridFreq 140). No mask/gradient grammar in scene.
- **ContextLinks** — Reads `scene.links` (edges, segmentsPerEdge) and `scene.clusters.nodes`; already scene-driven for topology. No style object (opacity per mode, line width) in scene.

Paths below use **src/visualization/**; if the nodeMap→visualization refactor is not done yet, use **src/nodeMap/** equivalents (e.g. `scene/artDirection/` under nodeMap/helpers/formations or nodeMap/helpers).

---

## 1. New art direction files

Create alongside **spineArtDirection.ts** (e.g. under `src/visualization/scene/artDirection/` or `src/nodeMap/helpers/formations/`):

### 1.1 glyphArtDirection.ts

Pure tuning object; export a single const (e.g. `GLYPH_ART_DIRECTION`) similar to `SPINE_ART_DIRECTION`. No renderer logic, no Three.js types unless helpful.

Include:

- **Counts per mode** — idle / listening / processing / speaking (e.g. max visible or count-by-mode for two clusters).
- **Placement envelope** — radiusX, radiusY, verticalBias, left/right bias (for rules vs cards clusters).
- **Size range** — min/max size, per-mode size multipliers.
- **Shape mix** — circle vs diamond weights if applicable (otherwise omit or 1/0).
- **Color palettes** — cool / ghost / accent (or rules/cards aligned with zones.style so zone color and glyph color never drift).
- **Motion** — orbitHz, jitterAmp, driftHz, driftAmp.
- **Mode intensity scaling** — e.g. processing stronger, speaking calmer.

Ensure glyph colors are driven by the same source as zones (e.g. zones.style.rulesColor / cardsColor) so “zone white, glyph blue” cannot happen.

### 1.2 backgroundArtDirection.ts

Pure tuning object; export e.g. `BACKGROUND_ART_DIRECTION`.

Include:

- **Plane count** — e.g. 2–4.
- **Per-plane opacity ladder** — opacityScale[] or opacityBase/opacitySecond + array for more planes.
- **Per-plane scale ladder** — widthScale, heightScale (or single scale per plane) so renderer can size planes.
- **Z offsets / depths** — behind spine, so planes feel deep but don’t fight UI (replace hardcoded 6.5, 6.7).
- **Drift** — ampX, ampY, hz (and optionally link to existing driftPxNorm if kept).
- **Gradient/mask grammar** — radial/linear/angled; fade inner/outer/power; optional center offset or angled mask params; optional stepped/quantized fade (levels + stepMix).
- **State modulation** — e.g. listening “precursor” halftone feel, processing “expands/breathes” (intensity/threshold/scale targets per mode or formulas driven by mode).

### 1.3 linkArtDirection.ts (optional, minimal)

Export e.g. `LINK_ART_DIRECTION`. Keep minimal; links are signal layer, never dominant.

Include:

- **Opacity per mode** — idle/listening/processing/speaking.
- **Max edges / density** — cap for topology or display.
- **Line width / strength** — for shader or geometry.
- **Color and subtle jitter** — if needed; otherwise inherit from scene.

---

## 2. Scene wiring (formations.ts)

- **Glyphs**  
  - Use **glyphArtDirection** to derive cluster layout (radius, zJitter, sizeBase/Jitter rules/cards) and colors (rulesRgb/cardsRgb from zones.style so one source of truth).  
  - Extend scene so glyph **motion/shader knobs** are available: either add **scene.glyphStyle** (uBaseNodeSize, uPulseSpeed, uTouchRadius, uTouchStrength, uTouchMaxOffset, orbitHz, jitterAmp, driftHz, driftAmp, modeIntensityScale) or extend **scene.clusters.style** with these.  
  - **scene.clusters.nodes** (and maxPerCluster) remain the single source for positions/sizes/colors/count; ContextGlyphs must not assume 16 nodes or hardcode palette.

- **Background**  
  - Use **backgroundArtDirection** to build **scene.backgroundPlanes** with full config: count, per-plane opacity (array or opacityBase/Second), per-plane scale (and/or zDepths), drift (ampX, ampY, hz; keep driftPxNorm if used), hue/sat/lum, and **mask params** (fadeMode: radial|linear|angled, fadeInner, fadeOuter, fadePower, centerX/Y, angle, levels, stepMix, etc.).  
  - Extend **GLSceneBackgroundPlanes** type so PlaneLayerField can read everything from scene (no component-level constants for look).

- **Links (optional)**  
  - If adopting linkArtDirection: add **scene.links.style** (opacityByMode, lineWidth, strength, color/jitter).  
  - Keep **scene.links.edges** and **scene.links.segmentsPerEdge**; topology from scene.

**Important:** getSceneDescription() (or the builder that assembles the scene) must build clusters from zones.style + glyphArtDirection so that changing zones.style.rulesColor/cardsColor updates both zones and glyph colors. Same for background: all PlaneLayerField aesthetic inputs come from scene.backgroundPlanes.

---

## 3. Renderer changes (dumb layers)

### 3.1 ContextGlyphs.tsx

- Remove any module-level FORMATION / buildTwoClusters constants (already reads scene.clusters.nodes).
- Read `const scene = nodeMapRef.current?.scene`. If missing or missing required fields (e.g. scene.clusters?.nodes), **return null** and in __DEV__ **log a clear error**: e.g. “Set nodeMapRef.current.scene = getSceneDescription() at mount.”
- Build geometry buffers **only** from scene-provided nodes (positions, sizes, colors, etc.). No hardcoded palette, no assumed node count.
- **Remove hardcoded uniforms**: uBaseNodeSize, uPulseSpeed, uTouchRadius, uTouchStrength, uTouchMaxOffset (and any other visual knobs) must come from **scene.glyphStyle** (or scene.clusters.style extended). Same for decay phase/rate/depth if they become tunable — either from scene or from a single seeded generator whose params come from scene.
- Per-frame motion: derive from engine state (v.clock, v.currentMode) and **scene motion knobs** (from glyphArtDirection / scene.glyphStyle).

### 3.2 PlaneLayerField.tsx

- Read **scene.backgroundPlanes**. If missing, **return null** and in __DEV__ log the same style of error (set scene at mount).
- Use **scene-provided mask params** to control gradient/radial/angled fade in the shader (uniforms driven from scene: fadeInner, fadeOuter, fadePower, etc.). This is where “radial gradient mask on the mesh” is driven from.
- **Remove hardcoded** z-depths (6.5, 6.7), scale multipliers (1.22, 1.6), targetIntensity/targetThreshold/targetScale formulas, and panelOpacity factor. All must come from **scene.backgroundPlanes** (and optional mode-based modulation from backgroundArtDirection).
- Keep billboarding and “fill background” logic; drive sizes, opacity, drift, and mask from scene only.
- Ensure background still renders when other layers fail (no overlaying React panels to “fix” visuals).

### 3.3 ContextLinks.tsx (optional)

- If linkArtDirection adopted: read **scene.links.style** for opacity per mode, line width, strength, color.
- Enforce **segmentsPerEdge >= 1** when rendering; else dev log + return null.
- Topology (edges) from scene only; no ad hoc computation in the component.

---

## 4. Acceptance criteria (explicit checks)

1. **One-stop tuning** — Changing colors, opacities, counts, drift, mask style, etc. in the artDirection files (and thus in scene) produces visible changes without editing render components.
2. **No drift** — Changing zones.style.rulesColor/cardsColor in scene updates both zone and glyph colors (no “zone white, glyph blue”).
3. **Mode modulation** — idle/listening/processing/speaking produce visibly different background and glyph intensity/behavior as defined by artDirection.
4. **Guardrails** — If scene is missing (or required sub-object missing), render layers **do not** silently fall back to hardcoded constants; they **return null** and emit a **dev error** message.
5. **Performance** — No geometry regeneration every frame; useMemo keyed on scene node arrays (or stable scene refs); only uniforms/transforms updated per frame.
6. **No interaction coupling** — TouchZones and interaction band do not own visuals; they only set engine ref fields. All visual reaction via engine ref + scene knobs.

---

## 5. Deliverables

- **New files:** glyphArtDirection.ts, backgroundArtDirection.ts, (optionally) linkArtDirection.ts.
- **formations.ts** updated so getSceneDescription() (and any builders) use these art direction objects and the scene includes:
  - glyphStyle (or extended clusters.style) for glyph shader/motion knobs,
  - extended backgroundPlanes (mask params, per-plane opacity/scale/z, state modulation),
  - (optional) links.style.
- **ContextGlyphs.tsx** and **PlaneLayerField.tsx** updated to consume scene-driven config only; no visual constants in component.
- **Optional:** ContextLinks.tsx consumes scene.links.style and topology.
- **Docs:** Short update (e.g. in visualization README or ARCHITECTURE): “Art direction files are the only place to tune aesthetics for spine/glyphs/background; render layers are dumb.”

---

## 6. Suggested implementation order

1. Add **glyphArtDirection.ts** and **backgroundArtDirection.ts** (and optionally linkArtDirection.ts) with constants matching current behavior where possible.
2. Extend **scene types** in formations (GLSceneBackgroundPlanes, clusters.style or glyphStyle, links.style).
3. Update **getSceneDescription()** to use art direction and populate the new/updated scene fields.
4. **ContextGlyphs**: remove hardcoded uniforms and decay params; read from scene; add null guard + dev log.
5. **PlaneLayerField**: remove hardcoded z/scale/intensity/threshold/panelOpacity; read mask and all knobs from scene; add null guard (already returns null + log when bp missing).
6. **ContextLinks** (optional): read scene.links.style; enforce segmentsPerEdge >= 1.
7. **Docs** and **acceptance pass** (one-stop tuning, no drift, mode modulation, guardrails, performance, no interaction coupling).
