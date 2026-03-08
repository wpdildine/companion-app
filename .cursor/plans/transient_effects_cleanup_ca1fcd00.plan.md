---
name: Transient effects cleanup
overview: Correct the transient-effects architecture so events map to modulation only (no event→color in engine or art direction). Controller emits semantic events; Engine carries identity and timing; Art Direction defines static modulation tuning; Render Layers interpret modulation.
todos: []
isProject: false
---

# Transient Effects Cleanup — Architecture (Corrected)

## 1. Problem Summary

**Architecturally:** The engine previously owned effect-specific interpretation (e.g. pulse color recipes per event type). Transient tuning was split correctly for the spine light core (art direction → scene → layer) but pulse color was hardcoded or keyed by event, creating ownership drift and event→color coupling. The system must not implement event→color mapping anywhere in the engine or art direction; events must map only to transient modulation parameters that render layers interpret.

**Visually:** softFail emission works (controller emits, ref gets `lastEvent`/`lastEventTime`), but the visible response must be driven by shared modulation (hueShift, intensity, agitation, opacityBias) that layers apply—not by engine or art direction assigning colors to events.

---

## 2. Current Ownership Violations (to fix)

- **Engine:** Containing event-specific visual interpretation (RGB formulas, hue-shift rules, or pulse color lookup by event). Engine must carry only identity, timing, and (optionally) the computed modulation envelope; effect semantics come from shared definitions; visual application is in layers only.
- **Art direction:** Defining color for specific events (e.g. pulseColorRgb, tint-by-event, or any event→color map). Art direction must provide only static modulation parameters (decayMs, hueShift, intensity, agitation, opacityBias).
- **Render layers:** Branching on event names (e.g. `if (event === 'softFail')`). Layers must consume only shared modulation channels and layer-scoped response tuning.

---

## 3. Ownership constraints

**Controller**
- Responsible **only** for semantic event emission (e.g. `emitEvent(TRANSIENT_SIGNAL_SOFT_FAIL)`).
- Must contain **no** visual logic (no colors, no decay, no modulation math).

**Engine / shared runtime**
- Responsible **only** for carrying identity and timing: `lastEvent`, `lastEventTime`, pulse slot state (`pulsePositions`, `pulseTimes`, `pulseColors`, `lastPulseIndex`), and the visualization clock.
- Must **never** contain event-specific visual interpretation: no RGB formulas per event, no hue-shift rules per event, no animation logic tied to specific events.
- May **route** pulses spatially (e.g. center vs rules vs cards) but must **not** determine the visual meaning of an event (no event→color).

**Art direction**
- Provides **static transient tuning only**: modulation parameters (e.g. `decayMs`, `hueShift`, `intensity`, `agitation`, `opacityBias`) in a shared, centralized place (e.g. `scene/artDirection/transientEffects/softFail`).
- Does **not** implement event→color lookup. Authored values (including any shared target tint for layers to use when applying hueShift) must not reduce the architecture to “event → color”; effect semantics stay in modulation parameters. (Layers may still have layer-scoped authored tints for *how* they apply modulation.)

**Render layers**
- Own **runtime application** of effects: read `v.lastEvent`, `v.lastEventTime`, and transient tuning from the scene; compute decay from event age; apply modulation to uniforms (hue shift, emissive boost, opacity bias, agitation/warp, intensity).
- **Pulse layers** consume transient modulation and derive pulse color from **base palette + modulation**, not from an event→color lookup.

---

## 4. Shared transient modulation contract (tightened)

**Shared transient effect definitions** live in one place (e.g. `scene/artDirection/transientEffects`). Each effect (e.g. `softFail`) is a declarative object with:
- `decayMs`
- `modulation`: `{ hueShift, intensity, agitation, opacityBias }` (peak values, 0..1).

**No event→color lookup.** Do not define RGB or “color for event X” in art direction or engine. The important rule is **do not reduce the architecture to event→color lookup**. If some layers later need a shared authored target tint (e.g. “tint toward this color when applying hueShift”), that can live in layer presets or a shared non-event-keyed value; the constraint is that we never map event identity to a color.

**Runtime and modulation state:**
- The **shared runtime may carry** the currently active transient modulation envelope/state (e.g. `ref.transientModulation`).
- **Effect semantics still come only from shared transient definitions** (art direction); the runtime does not “interpret” effects—it only carries identity, timing, and the computed modulation envelope from those definitions.
- **Layer-specific visual application still happens only in render layers**; the engine does not own effect logic or visual meaning.

All layers may optionally respond to transient modulation (spine, parallax, pulse); shared visual reactions come from shared modulation channels, not from event-specific color tables.

---

## 5. Pulse path

Pulse layers are **consumers of transient modulation**. They read `ref.transientModulation` (and optionally `lastEvent`/`lastEventTime` for decay). Pulse color is **derived** from the layer’s base palette modified by modulation (e.g. hueShift, intensity), **not** from an event→color map. Engine may write pulse **position** and **time** (routing); color is the layer’s interpretation of modulation + base palette.

---

## 6. Render-layer responsibilities

- Consume only `ref.transientModulation` and (from the scene) transient effect definitions and layer-scoped response tuning (e.g. modulationWeights, modulationTintColor where applicable). Do not branch on event names.
- Read `v.lastEvent`, `v.lastEventTime`, and transient tuning from the scene; compute decay factor from event age; apply modulation to uniforms (hue shift, emissive boost, opacity bias, agitation/warp, intensity scaling).
- Pulse layers: derive pulse color from base palette + modulation, not from an event→color lookup. All layers may optionally respond to transient modulation for shared visual reactions across parallax, spine, and pulse.

---

## 7. Art direction structure

- **Simple and centralized:** one place (e.g. `scene/artDirection/transientEffects`) with one definition per effect (e.g. `softFail.ts` or a single registry) containing **only** modulation parameters: `decayMs`, `modulation: { hueShift, intensity, agitation, opacityBias }`.
- Do not introduce multiple tuning registries or layer-specific transient effect definitions; one shared source of transient modulation tuning that all layers read from the scene.

---

## 8. Ordered implementation steps

1. **Shared transient effect definitions:** Ensure one place (e.g. `scene/artDirection/transientEffects/`) with declarative modulation-only definitions per effect (decayMs, modulation peak values). No RGB, no pulseColorRgb, no event→color.
2. **Engine / runtime:** Carry identity and timing (lastEvent, lastEventTime, pulse slot state, clock). Optionally carry the computed modulation envelope (e.g. ref.transientModulation) from shared definitions; do not add event-specific visual interpretation (no RGB formulas, no hue rules per event). May route pulse position and time only.
3. **Render layers:** Consume modulation and layer tuning; apply decay and uniforms; no event-name branching. Pulse layers derive color from base palette + modulation.
4. **Cleanup:** Remove any remaining pulseColorByEvent, pulseTuning, getPulseColorFromScene, or event→color logic from engine and art direction. Remove event-name awareness from layers.

---

## 9. Verification plan

- **Architecture:** No event→color mapping in engine or art direction. Grep for pulseColorByEvent, pulseTuning, getPulseColorFromScene, pulseColorRgb (in effect definitions), or RGB/hue formulas keyed by event type; must find none.
- **Runtime:** Controller emits only semantic events; ref carries lastEvent, lastEventTime, transientModulation; layers read modulation and apply. softFail visible via modulation-driven response (e.g. spine light core, pulse from palette + modulation).
- **Layers:** No `if (event === 'softFail')` or similar in render layers; layers use only modulation channels and weights.

---

## 10. Forbidden patterns

- **Engine:** Do not add effect-specific visual interpretation: no RGB formulas per event, no hue-shift rules per event, no animation logic tied to specific events, no “event X → this color” or pulse color lookup by event.
- **Art direction:** Do not define color for specific events (no event→RGB, no pulseColorRgb in effect definitions, no tint-by-event). Do not reduce the architecture to event→color lookup; shared or layer-scoped authored tints for *how* to apply hueShift are allowed only when not keyed by event.
- **Layers:** Do not branch on transient event names; consume only modulation channels and layer response tuning. Do not derive pulse color from an event→color map; derive from base palette + modulation.
