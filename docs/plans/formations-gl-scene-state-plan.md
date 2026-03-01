# Formations as GL Scene State (revised)

Evolve [formations.ts](../src/nodeMap/helpers/formations.ts) into the single source of truth for GL aesthetics and scene description. RN owns semantics and touch; GL owns physics and draw list. TouchZones (née ClusterTouchZones) is a dumb renderer; all style and zone policy live in formations / getSceneDescription().

---

## Core rule

- **Semantics in RN**: panel visibility, expand/collapse, navigation, what “cards/rules” data is. GL can request semantics via events (e.g. `onClusterTap`), but cannot decide outcomes.
- **Physics / draw list in GL**: repulsion fields, shear/offset of planes, pulse bursts, zone highlight (“armed”), layout perturbation. All visual constants and zone layout come from **getSceneDescription()**; render components do not define style or zone policy.

---

## Single Aesthetic Source of Truth (contract)

- **All visual constants** (colors, opacities, ratios, band top inset px, ring radii, edge color, plane count, drift amounts, link curvature, etc.) **must originate from getSceneDescription()** (or formations.ts) and **must not be hardcoded in render components**.
- **Render components** may:
  - Compute camera-facing placement from viewport (viewWidth, viewHeight, fov, aspect).
  - Apply scene-provided style and bounds.
  - Map ref state (e.g. zoneArmed, vizIntensity) to armed/active/inactive visuals.
- **Render components may not**: define zone layout policy, colors, opacities, ratios, inset, ring geometry, or any other aesthetic constant.
- **Renderers may not introduce fallback constants** if scene fields are missing; missing scene values must be treated as a bug (fix at the source in formations / scene description).

This makes “edit aesthetics freely” enforceable: one file (formations / scene description) is the one-stop aesthetic surface.

---

## Single source of truth for anchors

Pulses and zone rings must not drift relative to glyphs/links. Today:

- Renderers use `buildTwoClusters()` for node positions (ContextGlyphs, ContextLinks).
- EngineLoop uses `getTwoClusterCenters()` for pulse origins.
- ClusterTouchZones uses `getTwoClusterCenters()` for ring placement.

**Rule:** There is **one** source of truth for anchors. Everything reads from **getSceneDescription()** (or the same shared formation instance). No component calls `getTwoClusterCenters()` or `buildTwoClusters()` directly for positions/anchors; they come from the scene description (e.g. `scene.clusterAnchors`, `scene.pulseAnchors`).

- **EngineLoop**: Pulse origins come from `scene.pulseAnchors.rules` / `scene.pulseAnchors.cards` / `scene.pulseAnchors.center` (or equivalent). Stop calling `getTwoClusterCenters()` once scene exposes anchors.
- **TouchZones**: Ring positions from `scene.clusterAnchors` or `scene.pulseAnchors` (same values).
- **ContextGlyphs / ContextLinks**: Node positions and topology from scene (cluster anchors + per-node layout derived from formation). Optional later; document as next consolidation milestone if not done in first pass.

---

## getSceneDescription() shape (formations.ts or sceneDescription.ts)

One function returns a single object. Suggested structure:

| Key | Purpose |
|-----|--------|
| **zones.layout** | Ratios (leftRatio, centerRatio, rightRatio), bandTopInsetPx, dead-strip NDC threshold (e.g. ±0.12). |
| **zones.style** | Colors (rules, cards, center), opacities (area base, center area, ring base, highlight), edge color (MESH_EDGE_COLOR), ring geometry (inner/outer radii, segments e.g. 0.95, 1.15, 48). |
| **clusters** | Anchor positions (rules center, cards center) + max counts (8 each). **clusters.style** (optional): rules/cards colors, node size ranges, jitter params for glyphs. |
| **pulseAnchors** | Same as cluster centers: rules, cards, center. EngineLoop and TouchZones read from here so pulses and rings stay aligned. |
| **backgroundPlanes.style** | Count (3–6), opacity by mode, drift ranges. |
| **links.style** (optional, later) | Segments per edge, curvature intensity; topology and per-node style seeds derivable from scene so ContextLinks/ContextGlyphs don’t re-author aesthetics. |

Implementations can keep calling `buildTwoClusters()` / `getTwoClusterCenters()` **inside** getSceneDescription() to build this object, so there is still only one call site and one exported API for anchors and style.

**Scene at runtime**

- `getSceneDescription()` is computed once at mount (or when palette changes) and stored on `nodeMapRef.current.scene` (or provided via React context); all GL components read from that single instance. Do not introduce a second global or duplicate scene source.
- Scene recomputes only when `paletteId` or `vizIntensityProfile` changes; otherwise it is stable to keep anchors/pulses deterministic.

---

## TouchZones (ClusterTouchZones) as dumb renderer

**Rename / role:** Conceptually “TouchZones”; component name can stay ClusterTouchZones or become TouchZones.

**Remove from the component (move to scene description):**

- Zone colors (RULES_ZONE_COLOR, CARDS_ZONE_COLOR, CENTER_ZONE_COLOR).
- All opacities (area base, center, ring, highlight).
- Ratios (leftRatio, centerRatio, rightRatio).
- Top inset (bandTopInsetPx).
- Edge color (MESH_EDGE_COLOR).
- Ring geometry (0.95, 1.15, 48).

**Keep in the component (only):**

- Viewport math: viewWidth, viewHeight, activeHeight from fov, aspect, bandTopInsetPx (value from scene).
- Camera-facing plane placement: position overlay group, set each plane’s position/scale from scene layout + viewport.
- Reading ref state: vizIntensity, rulesClusterCount, cardsClusterCount, zoneArmed (when added).
- Mapping ref state to “armed” / “active” / “inactive” visuals using scene.style (e.g. which color/opacity to use when armed).
- Edges: still render lineSegments for debug/outline, but edge color and ring radii come from scene.

No constants; all numbers come from the scene object passed in (from getSceneDescription() or from ref that holds a snapshot).

---

## Touch: RN only writes touchField*

Only the RN gesture layer (NodeMapInteractionBand) writes `touchFieldActive`, `touchFieldNdc`, `touchFieldStrength`. NodeMapCanvasR3F must not write these when the band is the intended source (or remove canvas touch-field writes entirely). GL uses touchWorld/touchInfluence for distortion and emits onClusterTap; RN owns panel visibility.

---

## Zone state (inactive / armed / active)

- **Engine ref:** Add `zoneArmed: 'rules' | 'cards' | null` (and optionally `zoneReleasedThisFrame`). NodeMapInteractionBand sets zoneArmed from NDC (e.g. x &lt; -0.12 → rules, x &gt; 0.12 → cards); clears on touch end; on release in zone calls onClusterTap.
- **TouchZones:** Reads zoneArmed and existing “highlighted” to drive visuals (inactive / armed / active) using **scene.style** only.
- **Deterministic / testable:** Zone bounds and state derivable from scene + ref; DebugZoneOverlay can show same bounds and state.

---

## Links and glyph styling (next consolidation milestone)

Even if link visibility stays ref-driven (vizIntensity, confidence), **topology and per-node style** are currently baked in ContextLinks (bezier style, segments) and ContextGlyphs (size/decay by index). To fully satisfy “edit aesthetics without breaking other elements”:

- **Document:** Topology and per-node style seeds should be derivable from scene description (or formation output), not re-authored inside each component. This is the next consolidation step after zones and anchors are migrated.
- **Optional in first pass:** Keep ContextGlyphs/ContextLinks reading from buildTwoClusters() for positions; later switch to scene.clusterAnchors + scene.clusters.style (and links.style) so formations controls all aesthetic assumptions.

---

## Implementation order (revised)

| Step | Task |
|------|------|
| 1 | Define getSceneDescription() and types: zones.layout, zones.style, clusterAnchors, pulseAnchors, backgroundPlanes.style, (optional) clusters.style, links.style. Implement by delegating to existing buildTwoClusters/getTwoClusterCenters internally. |
| 2 | ClusterTouchZones: Remove all hardcoded constants; accept scene (or ref to scene snapshot); read layout + style from scene; keep only viewport math, camera-facing placement, armed/active mapping from ref. |
| 3 | EngineLoop: Stop calling getTwoClusterCenters(); read pulse origins from scene.pulseAnchors (rules, cards, center). Ensure scene is available in the R3F tree (e.g. from ref or context). |
| 4 | Add zoneArmed (and optionally zoneReleasedThisFrame) to NodeMapEngineRef; NodeMapInteractionBand sets/clears zoneArmed; TouchZones reads it for armed state. |
| 5 | NodeMapCanvasR3F: Stop writing touchField* so only RN band drives touch field. |
| 6 | Mount PlaneLayerField (or background planes component) driven by scene.backgroundPlanes.style + ref. |
| 7 | (Optional) ContextGlyphs / ContextLinks: Switch to cluster anchors and style from getSceneDescription(); document any remaining topology/style as “next consolidation.” |
| 8 | Document mode-driven GL state and Single Aesthetic Source of Truth in ARCHITECTURE or viz doc. |

No dependency version changes. All changes stay within nodeMap/, app/, ui/, utils/.
