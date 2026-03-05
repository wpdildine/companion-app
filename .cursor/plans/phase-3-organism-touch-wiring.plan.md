---
name: ""
overview: ""
todos: []
isProject: false
---

# Phase 3 — "Alive Organism" Touch Response Wiring (Tightened)

## Overview

Implement Phase 3 "Alive Organism" touch response: add organism-derived signals (focusBias, touchPresence, focusZone) in EngineLoop, expose them via scene.organism, and wire subtle visual responses in light core (beam lean + mesh bend), halftone membrane, and glyph field—without changing tap/pulse semantics or adding per-frame allocations.

---

## Architecture (unchanged)

- **InteractionBand**: writes only `touchFieldActive`, `touchFieldNdc`, `touchFieldStrength`, `zoneArmed`.
- **EngineLoop**: owns all derived/continuous values; produces organism signals and mutates `scene.organism` each frame (stub created once in getSceneDescription).
- **Scene**: has `organism` block created once in getSceneDescription(); EngineLoop only mutates its properties.
- **Render layers**: dumb—read only `scene.`; no timers, no input mapping.

---

## Step 0 — Organism signal contract

**Location:** `src/visualization/engine/types.ts`, `src/visualization/engine/createDefaultRef.ts`, and **single canonical formula location** (e.g. `src/visualization/interaction/zoneLayout.ts` or a small `organismSignals.ts` in engine).

- **Canonical focusBias formula (one place only):**
  - Define `FOCUS_RANGE_NDC = 0.5` (or similar) once—e.g. in `zoneLayout.ts` next to `NEUTRAL_HALF_WIDTH_NDC`, or in a dedicated organism constants module.
  - Everywhere use the same formula:
    - `**focusBias = clamp(ndcX / FOCUS_RANGE_NDC, -1, 1) * touchPresence`
  - When no touch: `focusBias = 0`. No second variant (no `maxRange` vs `FOCUS_RANGE_NDC` drift).
- Add to **VisualizationEngineRef** (and defaults): `focusBias`, `touchPresence`, `touchPresenceNdc` (single object ref, no alloc per frame), optional `focusZone: 'rules' | 'neutral' | 'cards' | null`.
- **Validation (required):** Extend `validateVizState` for new ref fields: range checks (focusBias in [-1,1], presence in [0,1]), and that ndc values are finite. Minimal but required—catches NaNs early.

---

## Step 1 — EngineLoop: smooth and publish organism signals

- **Named smoothing constants (for maintainability):** Define once (e.g. same place as `FOCUS_RANGE_NDC`):
  - `**TOUCH_PRESENCE_LAMBDA`_ — used in the same exponential smoothing style as existing `touchInfluence` (e.g. `k = 1 - exp(-TOUCH_PRESENCE_LAMBDA _ dt)`). Tune so release decays over ~200–600 ms.
  - `**TOUCH_NDC_LAMBDA` — for smoothing NDC toward target (reduces jitter). Same style: no allocations.
- Reuse existing easing pattern; no allocations. Use `FOCUS_RANGE_NDC` and the single formula above to compute `focusBias`.
- Smooth touchPresence (with `TOUCH_PRESENCE_LAMBDA`) and NDC (with `TOUCH_NDC_LAMBDA`); set focusZone via `getZoneFromNdcX(ndcSmoothed.x)` when active.
- Write ref + **mutate** `v.scene.organism` (stub already exists from Step 2).

---

## Step 2 — Scene contract: `scene.organism` (Option B only)

- **Option B:** `getSceneDescription()` creates the `organism` stub once with default values (e.g. presence 0, focusBias 0, ndc {0,0}, zone null, relax 1). EngineLoop **only mutates** that object’s properties each frame—no create-on-first-frame in EngineLoop, no branching.
- Type: `GLSceneOrganism` with `presence`, `focusBias`, `ndc`, `zone`, optional `relax`.
- **Validation (required):** In `validateSceneDescription`, when `scene.organism` is present: presence in [0,1], focusBias in [-1,1], ndc finite, zone in allowed set. Minimal but required.

---

## Step 3 — Light core: beam lean + bend

- **Beam lean:** Treat as **material/uniform response** (not layout). Either:
  - Compute `beamCenterXOffset` in SpineLightCoreLayer useFrame from `scene.organism.focusBias` and apply via uniform; or
  - Have builder supply a base and renderer adds organism-driven delta from scene.organism—whichever is chosen, be consistent (no mix of “builder owns offset” in one place and “renderer computes offset” in another).
- **Bend (mesh deformer) — coordinate convention (explicit):**
  - **Anchor at bottom, flex increases toward top.** Bend grows along beam height: 0 at bottom, max at top. Direction determined by `focusBias`. Displacement in **local X (overlay-space)**, not Z. This gives “organism spine flex” and avoids “flag waving.”
  - Two params: (1) bend amount/strength from touchPresence, (2) bend direction from focusBias. Vertex shader displaces in local X, with gradient 0 (bottom) → max (top).

---

## Step 4 — Halftone membrane

- Read `scene.organism.presence` (and optionally focusBias); add uniforms for intensity/density bias (5–15%). No UV/geometry change; uniforms only.

---

## Step 5 — Glyph attention bias (no buffer churn)

- **clusterId is static instance data.** Add a cluster/side attribute to glyph buffers (from `node.clusterId`). Rebuild buffers **only when the glyph set changes** (e.g. when `scene.clusters.nodes` or visibility counts change), **not every frame**. Rule: clusterId is part of instance data; buffer rebuild is on node-set change only.
- Pass `uFocusBias` (and optionally presence) from scene.organism; shader applies subtle opacity/scale boost by side. No per-frame buffer churn.

---

## Step 6 — Optional: shards flock bias

- Wire-only: add optional field (e.g. `scene.organism.shardBias`) for Phase 4. No motion change in Phase 3.

---

## Step 7 — Discrete tap vs continuous touch

- No change. Organism signals never drive `lastEvent` or pulse. One tap → one pulse; hold → no spam.

---

## Step 8 — Performance and docs

- No new meshes; no per-frame allocs; O(1) uniforms. Optional vizIntensity for future. Short doc: organism signals, where they live, tuning knobs.

---

## Definition of done

- Touch produces continuous “alive” response (lean, bend, halftone, glyph emphasis); tap still gives exactly one pulse; no allocs; determinism unchanged.
- **Explicit acceptance:** Crossing the neutral band does not “snap”—response eases smoothly through 0 (no discontinuity at focusBias = 0).

---

## Addendum — Light core bend

- Signals: focusBias, touchPresence (existing). Two deformer params: bend amount (from presence), bend direction (from focusBias). **Convention:** anchor at bottom, flex toward top; displacement in local X (overlay-space), not Z.
