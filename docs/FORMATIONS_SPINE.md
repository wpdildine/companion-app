# FORMATIONS_SPINE — Modern–Decon GL Scene Contract

This doc defines the **spine-first** visual system for the node-map canvas. It is the source of truth for how the “reasoning surface” looks, how it evolves across states, and what parts of the system are allowed to mutate visuals.

## Goals

- Establish a **single aesthetic control plane**: visual adjustments should be achievable by editing **`src/nodeMap/helpers/formations.ts`** (via `getSceneDescription()` and related scene helpers) without touching component logic.
- Encode a consistent **Modern–Deconstructionist** visual language: geometric discipline (modern) + controlled surface disruption (decon).
- Make state transitions feel like **structural dilation under load** (not decorative animation).

## Non-goals

- TouchZones is **not** a styling system. It may render debug affordances, but it must not introduce new “design decisions” (colors, opacities, layout constants) outside of the scene description.
- Components should not create their own palette constants or hidden defaults that can drift from scene.

---

## System overview

### Projection surface

- The R3F canvas is a **projection surface** behind RN UI.
- RN panels are layered above the canvas; the canvas provides the ambient “machine surface” and visual affordances.
- The scene description (`nodeMapRef.current.scene`) is the **only** source of truth for the GL aesthetic.

### Single source of truth

All aesthetic and layout primitives for the GL scene live in:

- `src/nodeMap/helpers/formations.ts`
  - `GLSceneDescription` types
  - `getSceneDescription()`
  - cluster node generation + link topology + pulse anchors

GL components consume **only** `nodeMapRef.current.scene` (and engine ref dynamic values like clock/activity) and must not invent independent visuals.

---

## Code organization (prevent a formations.ts god file)

`formations.ts` is the correct place for the **scene contract** and the **single assembly function** (`getSceneDescription()`), but it must not become a dumping ground.

**Rule:**

- `src/nodeMap/helpers/formations.ts` remains the **public contract + assembly layer**.
- When any area grows (spine, halftone, palettes, background, topology), move the implementation into focused helper modules under:
  - `src/nodeMap/helpers/formations/*`

Suggested split (names are guidance, not strict):

- `formations/colors.ts` — palettes + hex/rgb utilities + state color shifts
- `formations/spine.ts` — 5-plane spine layout + safe evolution + spread profiles
- `formations/halftone.ts` — halftone shader params (intensity/density ramps)
- `formations/zones.ts` — T-parti ratios + band inset + thresholds
- `formations/clusters.ts` — cluster nodes + anchors + link topology
- `formations/background.ts` — full-screen field / background plane params

**Invariant remains unchanged:** all GL aesthetics still live “under formations” and flow through `nodeMapRef.current.scene`.

---

## Parti (spatial grammar)

The screen is structured as a **T-shaped reasoning surface**:

- **Left active zone**: Rules (interactive)
- **Center strip**: AI interface / “record spine” (interactive semantics live in RN; GL shows the spine)
- **Right active zone**: Cards (interactive)
- **Top band**: non-interactive ambient whitespace

> The “cross” is a boundary + channel system. It’s structural, not ornamental.

The active zones are represented in GL (for debugging and affordance alignment) but do not dictate the RN layout.

---

## Interaction contract

### Touch semantics

- **Drag** = playful repulsion only (no reveals / no panels). Drag interaction should affect the ambient field only.
- **Tap** = semantic reveal/navigation (tap within rules/cards regions triggers cluster semantics in RN).

### Touch safety

- Touch event capture must not “trip” between GL and RN layers.
- During **Processing**, touch is disabled (see state grammar) because the visual surface intentionally overflows boundaries.

---

## State grammar (motion + surface grammar)

The system has modes (engine-level) that map to a small set of **scene-driven** parameters.

### Canonical states

- `idle`
- `listening`
- `processing`
- `speaking`

Additional interaction modes may exist (`touched`, `released`), but they must not redefine the core aesthetic identity. They modulate repulsion and highlights only.

### Core metaphor

> The structure does not animate; it **dilates under load**.

No bounces, no springiness, no organic loops. Transitions are crisp and architectural.

### Spread model (axis-aligned)

- Primary: **vertical spacing dilation** of the spine planes
- Secondary: **horizontal band widening**
- Tertiary: **depth separation** (Z layering)

Spread opens from the **center** (AI core), not from top/bottom.

### Processing overflow rule

In `processing`:

- The horizontal band widens slightly and **exceeds touch-zone boundaries**.
- Touch is disabled immediately on entry to processing.

This overflow is intentional: it communicates “machine-owned time.”

---

## Halftone (shader-driven surface stress)

Halftone is **surface stress**, not a wallpaper texture.

### Where it appears

- Primary: horizontal band edges
- Secondary: outer spine planes

It must not flood the whole canvas or appear inside evidence zones.

### What drives it

- **Intensity is time-in-state driven** (deterministic):
  - `idle`: 0
  - `listening`: low precursor
  - `processing`: ramps to max
  - `speaking`: decays to 0
- **Density is dynamic**:
  - `listening`: sparse (larger dots)
  - `processing`: denser (smaller dots)

### Constraints

- Axis-aligned pattern only (no rotated grids).
- No flicker, no jitter, no random opacity noise.
- If it’s noticeable as “texture first,” it’s too strong.

---

## Spine definition

The spine is the persistent “AI channel.”

### Composition

- **5 planes** stacked vertically.
- Axis-aligned rectangles; no rotation.
- Slight Z layering (subtle).
- Seeded variation is allowed within strict bounds.

### Safe evolution

Spine can “evolve” across use (e.g. per query) using **seeded, bounded** parameter changes that interpolate over time.

Allowed evolutions:

- small width/height variance
- slight offset or misalignment (decon accent)
- state-driven color shift

Not allowed:

- plane count changes
- wild drift / detaching
- rotating into a different visual identity

---

## Canonical parameter table (identity lock)

These are the baseline intended multipliers for the modern–decon identity.

|      State | Vertical spread | Band width | Depth spread | Halftone intensity | Halftone density |
| ---------: | --------------: | ---------: | -----------: | -----------------: | ---------------: |
|       Idle |            1.00 |       1.00 |         1.00 |               0.00 |              n/a |
|  Listening |            1.15 |       1.00 |         1.00 |          0.05–0.08 |              1.0 |
| Processing |            1.30 |  1.08–1.12 |    1.15–1.20 |         up to 0.30 |          1.5–2.0 |
|   Speaking |           →1.00 |      →1.00 |        →1.00 |              →0.00 |             →1.0 |

### Timing

- Ramp-in to processing: ~200–250ms (cubic easing)
- Ramp-out to speaking/idle: ~200–350ms
- No overshoot, no spring.

---

## Ownership rules (to prevent drift)

### Scene owns aesthetics

The following must be scene-owned (read from `nodeMapRef.current.scene`):

- zone layout ratios and band inset
- zone colors and per-zone opacities
- cluster node positions + colors
- link topology + segmentsPerEdge
- pulse anchors
- background plane parameters

### Components are “dumb renderers”

Components like `TouchZones`, `ContextGlyphs`, `ContextLinks`, and `PlaneLayerField`:

- may do camera math / viewport math
- may do geometry buffering
- may apply scene style values at runtime
- must not create independent palettes, constants, or fallback visuals that drift from scene

If the scene is missing, components should **dev-error and return null** (no silent fallbacks).

---

## Acceptance criteria

1. **Aesthetic edits live in formations**

- Changing `getSceneDescription().zones.style` must update TouchZones, glyph colors, link colors, and pulse anchors consistently.

2. **Processing overflow implies touch off**

- When mode is `processing`, the horizontal band may exceed zone boundaries and touch is disabled immediately.

3. **Listening is precursor, not processing**

- Listening introduces only a subtle halftone precursor and modest spread. No overflow.

4. **No drift through hidden defaults**

- There must be no duplicate constants in components that override scene style (e.g. hardcoded RGBs).
- If new aesthetic logic is added, it must live under `src/nodeMap/helpers/formations/*` and be composed by `getSceneDescription()`.

---

## Implementation notes (how it wires today)

- `nodeMapRef.current.scene` is set by the screen mounting the viz (e.g. VoiceScreen) via `getSceneDescription()`.
- TouchZones is a debug affordance renderer and should remain **stylistically neutral** beyond faithfully rendering scene style.
- **Spine:** Scene spine is **envelopeNdc** (viewport-relative). Same convention as TouchZones: vertical axis = active region (below bandTopInsetPx); **centerY = 0** = center of that active region (centerY is in active-region NDC, not full viewport NDC). **scene.spine.style** (color, opacity, blend, zStep) and **scene.spine.transitionMsIn / transitionMsOut / easing** supply all renderer inputs so the spine component defines no local constants or timing. **Profiles** are canonical-only (`idle`, `listening`, `processing`, `speaking`); the renderer maps non-canonical modes (e.g. touched, released) to a canonical state before indexing.

---

## Next steps (future work)

- Halftone on band edges (shader/visual); spine types and halftoneProfiles already in scene.
- Processing overflow / touch off when mode is processing (already specified in state grammar).
