# Spine and Name Shaping Touch Refactor — Authoritative Execution Plan

## BLOCK 1 — REFACTOR INTENT

This refactor is **not** a cosmetic cleanup and **not** a final UX pass. It is a **structural unification pass** whose purpose is to make the spine touch surface, Name Shaping grammar, and render/debug consumers derive from a stable shared model instead of partially duplicated geometry and partially ad hoc routing.

**Outcome of this refactor:**
- One authoritative native-touch-driven physical spine touch surface definition
- One Name Shaping mode-specific layout derived from that surface
- One semantic interpreter for Name Shaping regions
- One transform layer for overlay/debug/render consumers
- Clearer routing and precedence rules inside the existing physical touch owner
- Preserved startup and performance boundaries
- Preserved separation between app/nameShaping semantics and visualization mechanics

**This refactor should NOT attempt to:**
- Finalize the product UX, activation gestures, or long-term grammar claim model
- It should create an authoritative structural base that later UX iterations can safely build on

---

## BLOCK 2 — HARD ARCHITECTURAL INVARIANTS

Non-negotiable during the refactor:

| # | Invariant |
|---|-----------|
| 1 | **InteractionBand.tsx** remains the single physical touch owner for the spine surface. No new competing touch owner may be introduced. |
| 2 | **Native touch** remains the authoritative input path. Do not make GL raypicking or mesh picking the primary source of touch semantics. |
| 3 | **Band-local NDC** remains the canonical semantic input basis for spine touch interpretation in this pass. Do not introduce a second canonical semantic coordinate system. |
| 4 | **Name Shaping** remains an app-level semantic subsystem in **src/app/nameShaping/**. Do not move subsystem ownership into visualization, agent, or rag. |
| 5 | **Spine rendering** is not the semantic owner of Name Shaping, but the spine is the central visual and interaction anchor for the shared surface. The layout must remain spine-centered even if spine rendering does not own the semantics. |
| 6 | **Full RAG initialization** must remain deferred. No layout or Name Shaping touch refactor may accidentally trigger heavy pack/RAG startup work. |
| 7 | **Routing and layout** may evolve together, but no block may silently redefine gesture precedence without documenting it and testing it. |
| 8 | **Do not change Name Shaping selector vocabulary or region semantics** during this refactor. Preserve the current semantic system; this pass is structural only. |

---

## BLOCK 3 — AUTHORITATIVE TARGET MODEL

Target model:

- **One** physical touch owner
- **One** shared physical spine touch-surface model (grammar-agnostic; lives in **visualization/interaction**, not under a grammar-specific subsystem like nameShaping)
- **One or more** mode-specific grammar layouts over that surface
- **One** semantic interpreter per grammar
- **One** explicit transform layer for non-touch consumers
- **Routing** decided by mode + region + precedence

**Conceptual layers (implementation must respect these):**

| Layer | Name | Responsibility |
|-------|------|----------------|
| 1 | Physical Surface | Defines where touch can happen on the spine surface |
| 2 | Grammar Layout | Defines how a particular grammar partitions that surface |
| 3 | Semantic Interpreter | Defines what a touch in one of those regions means |
| 4 | Routing / Precedence | Defines which grammar/behavior interprets the touch under current conditions |
| 5 | Visual Consumers | Overlays, guides, and debug/render meshes consume the same layout via explicit transforms |

Any implementation choice that blurs these layers should be considered suspect.

---

## BLOCK 4 — FILE OWNERSHIP MODEL

| File | Ownership |
|------|-----------|
| **src/visualization/interaction/spineTouchSurfaceLayout.ts** | Authoritative for the **shared physical spine touch surface** in band-local NDC. Grammar-agnostic; lives in visualization/interaction so it is not semantically owned by Name Shaping or any single grammar. |
| **src/app/nameShaping/nameShapingTouchLayout.ts** | Authoritative for **Name Shaping layout** only (partitioning of shared surface). **Consumes** spineTouchSurfaceLayout from visualization. |
| **src/app/nameShaping/nameShapingTouchRegions.ts** | Authoritative for **semantic interpretation** of the Name Shaping layout. Must not own duplicate geometry. |
| **src/app/nameShaping/nameShapingLayoutTransforms.ts** | Authoritative for **projection** of canonical layout data into overlay/debug/render coordinate spaces. |
| **src/app/nameShaping/nameShapingInteractionRouting.ts** | If extracted: owns **pure mode/region/precedence** interpretation rules. No geometry ownership. |
| **InteractionBand.tsx** | Remains physical touch owner and event source; must **consume** shared helpers, not embed layout truth. |
| **NameShapingTouchGuideOverlay.tsx** | **Consumes** shared layout and transform helpers. Must not redefine layout boundaries. |
| **TouchZones.tsx** | **Consumes** shared layout and transform helpers for Name Shaping-related debug/mesh geometry. Must not redefine layout boundaries. |
| **Spine.tsx** | Remains visual anchor and envelope reference; **not** the semantic owner of Name Shaping. May parameterize layout alignment indirectly; must not become the source of Name Shaping semantics. |

---

## BLOCK 5 — SPINE AS FIRST-CLASS ALIGNMENT DEPENDENCY

The spine is **not** just another render consumer. It is the **central visual and interaction anchor** of the shared surface.

The shared physical spine touch surface must remain explicitly **spine-centered** in:
- **Horizontal alignment** (center strip aligned with spine)
- **Vertical active-region alignment** (active band below bandTopInsetPx matches spine envelope)

The refactor must treat the spine as the organizing axis for:
- The center strip
- The 7-selector stack
- The voice lane
- The visible guide overlay
- Any debug mesh representation of the touch surface

**Goal:** Not to make Name Shaping derive semantically from Spine.tsx, but to ensure all touch/layout consumers remain **visibly and spatially aligned** with the spine/backplane that the user perceives as the interactive object.

This must be stated in acceptance criteria where alignment is relevant.

---

## BLOCK 6 — PHASE 1: SHARED PHYSICAL SPINE TOUCH SURFACE

**Deliverable:** A new module defining the shared physical spine touch surface in band-local NDC. This module is **grammar-agnostic** and must live in a **neutral** location (visualization/interaction), not under Name Shaping, so the shared surface is not semantically owned by one grammar.

**File:** `src/visualization/interaction/spineTouchSurfaceLayout.ts`  
**Tests:** `src/visualization/interaction/spineTouchSurfaceLayout.test.ts`

**Scope (locked for this pass):** The first shared model is **envelope + center strip only**. Define only the total interactive envelope and the center strip bounds actually used today. **Do not** add left/right side lanes to the shared surface in this pass. **zoneLayout.ts rules/cards semantics are explicitly out of scope** for shared-surface unification in this pass; do not unify them unless a later block proves it necessary. In the current code, rules/cards come from zoneLayout.ts (full-width NDC), not spine-local lanes; there are no "optional side lanes" in this pass — side lanes are deferred until a concrete consumer requires them.

**This module MUST describe:**
- Total interactive envelope (band-local NDC)
- Center strip bounds only
- Normalized region helpers for the envelope and center strip
- Enough metadata for downstream grammar layouts (e.g. Name Shaping)
- Spine-centered placement assumptions

**Scope rule:** zoneLayout.ts rules/cards semantics are **explicitly out of scope** for shared-surface unification in this pass. Do not absorb them into this module; rules/cards remain owned by zoneLayout.ts. This stops scope creep.

**This module MUST NOT:**
- Encode Name Shaping selectors
- Encode routing precedence
- Depend on screen-space pixel math
- Depend on GL mesh geometry
- Depend on debug-only assumptions

**Acceptance criteria:**
- [ ] All region geometry is expressible from one authoritative object
- [ ] Center strip is explicitly defined relative to the shared surface
- [ ] Spine-centered placement is represented clearly
- [ ] At least one pure test verifies horizontal and vertical bounds
- [ ] At least one pure test verifies region containment and normalized helpers

**Required tests:**
- Envelope bounds test
- Center strip placement test
- Normalized helper output test
- Spine-centered symmetry/alignment test (if geometry is symmetrical)

---

## BLOCK 7 — PHASE 2: NAME SHAPING MODE-SPECIFIC LAYOUT

**Deliverable:** A mode-specific Name Shaping layout **derived from** the shared surface.

**File:** `src/app/nameShaping/nameShapingTouchLayout.ts`  
**Tests:** `src/app/nameShaping/nameShapingTouchLayout.test.ts`

**Region count (locked for tests):** **Chosen model — no ambiguity:** Partition the center strip into **7 total regions**, with the **middle region reserved as the voice lane** and the **other 6 as selectors**. There are not 7 selector regions plus a separate eighth voice region; voice is one of the seven. Ordering top-to-bottom: BRIGHT, ROUND, LIQUID, voice, SOFT, HARD, BREAK (voice at index 3 in 0-based order). Tests, ids, region ordering, and routing expectations must all assume exactly 7 regions with voice as the middle one.

**This layout MUST describe:**
- Those 7 regions (6 selectors + voice) with stable ids and bounds
- Reserved voice lane semantics as one of the seven
- Any mode-specific side regions only if truly needed
- Per-region ids
- Per-region labels/metadata
- Stable ordering

**This layout MUST NOT:**
- Redefine the underlying physical surface
- Own touch routing
- Own render transforms
- Own selection state
- Own debug-only behavior

**Acceptance criteria:**
- [ ] Name Shaping layout is fully derivable from the shared surface
- [ ] Selector ordering is explicit and stable
- [ ] The layout does not duplicate surface bounds
- [ ] Region ids/labels are testable and consumable by overlay/capture/debug systems
- [ ] Voice lane treatment is explicit instead of implicit

**Required tests:**
- Region count test (exactly 7 regions, with voice as one of the seven)
- Selector order test (BRIGHT, ROUND, LIQUID, voice, SOFT, HARD, BREAK)
- Selector bounds containment test
- Voice lane test (one region, explicit)
- Regression test for region ids and metadata

---

## BLOCK 8 — PHASE 3: SEMANTIC INTERPRETER

**Deliverable:** A pure semantic interpreter that maps band-local NDC points to Name Shaping semantic regions using the shared Name Shaping layout.

**Principle:** Interpretation is **metadata-driven once layout regions are named**. If the Name Shaping layout already declares a region's kind or selector metadata, the interpreter must **read that metadata** rather than re-deriving semantics from vertical ordering. Do not infer selector or voice from y-position when the layout already provides it; that keeps the interpreter genuinely thin.

**File:** `src/app/nameShaping/nameShapingTouchRegions.ts` (refactor)  
**Tests:** `src/app/nameShaping/nameShapingTouchRegions.test.ts`

**This interpreter MUST:**
- Accept normalized points (band-local NDC)
- Consume the Name Shaping layout (no inline layout constants)
- Return region identity / selector identity / special region status (e.g. voice)
- Distinguish out-of-bounds from in-bounds non-selector areas if relevant

**This interpreter MUST NOT:**
- Own layout constants
- Reimplement segment boundaries
- Depend on touch event APIs directly
- Mutate runtime state
- Silently infer selector identity from y-ordering when region metadata already names the selector — **prefer metadata-driven interpretation over positional re-derivation** so the interpreter stays thin.

**Acceptance criteria:**
- [ ] Geometry ownership remains outside the interpreter
- [ ] All semantic point resolution is centralized here
- [ ] Callers can treat it as authoritative for Name Shaping point interpretation

**Required tests:**
- One test per selector region
- Edge-boundary tests between selectors
- Out-of-bounds tests
- Voice lane tests
- Non-selector area tests (if applicable)

---

## BLOCK 9 — PHASE 4: EXPLICIT TRANSFORM LAYER

**Deliverable:** A transform helper layer that projects canonical band-local layout data into screen-space overlay geometry and render/debug mesh geometry.

**File:** `src/app/nameShaping/nameShapingLayoutTransforms.ts`  
**Tests:** `src/app/nameShaping/nameShapingLayoutTransforms.test.ts`

**Input convention (locked design choice):** Transform helpers must **prefer consuming a precomputed active-band envelope** (e.g. active height in px, center NDC, or a small envelope descriptor); they must **not** own raw bandTopInsetPx or inset logic directly. Block D must explicitly avoid becoming another owner of inset semantics; Block I handles vertical-envelope cleanup later. That keeps the transform layer clean; active-region math stays in one place upstream.

**This layer MUST:**
- Consume canonical layout definitions and precomputed envelope inputs
- Produce target-coordinate geometry (overlay px, render/debug descriptors)
- Centralize remapping logic

**This layer MUST NOT:**
- Redefine region semantics
- Embed overlay-specific labels or UI state
- Own touch meaning

**Acceptance criteria:**
- [ ] Overlay and debug/render consumers can both derive from the same transform layer
- [ ] There is no duplicate hand-written remapping in each consumer
- [ ] Transform math is explicit and unit tested

**Required tests:**
- Corners map correctly
- Top/bottom/center map correctly
- Center strip remains centered in target geometry
- Sample target envelopes produce stable outputs
- Transform results are consistent across repeated calls

---

## BLOCK 10 — PHASE 5: CONSUMER MIGRATION

**Deliverable:** Migrate consumers to use shared layout and transform inputs.

**Consumers and requirements:**

| Consumer | Requirement |
|----------|-------------|
| **NameShapingTouchGuideOverlay.tsx** | Must render from shared Name Shaping layout and transform helpers. Must not carry duplicate segment constants. |
| **TouchZones.tsx** | Must render Name Shaping-related zones from shared layout and transforms. Must not independently reinterpret region math. |
| **useSpineNameShapingCapture.ts** | Must depend on the semantic interpreter and shared layout. Must not embed bespoke region math. |

**Acceptance criteria:**
- [ ] All three consumers can be traced back to the same layout source
- [ ] Old duplicated constants are removed or clearly marked for removal
- [ ] Changing the shared layout changes all consumers consistently

**Required tests:**
- If components are hard to unit test directly, extract and test **pure geometry/data builder helpers**
- Minimum: overlay region data helper tests; debug zone geometry builder tests; capture point-sequence interpretation tests

---

## BLOCK 11 — PHASE 6: ROUTING CLARIFICATION

**Deliverable:** Clarify semantic routing and precedence in a testable way **without** prematurely imposing a final state machine.

**Files:** `InteractionBand.tsx`, optionally `AgentSurface.tsx`, optionally **extract** `src/app/nameShaping/nameShapingInteractionRouting.ts`

**Non-goal / preserved behavior:** Routing clarification in this refactor is intended to **preserve existing default user-visible spine semantics** unless a later UX-specific change explicitly alters them. Do not redesign hold-to-speak or rules/cards behavior; do not "simplify" by changing behavior while touching routing code.

**Current truthful model:** One physical touch owner; multiple semantic grammars; mode + region + precedence decide interpretation.

**The refactor MUST clarify:**
- When Name Shaping is eligible
- When legacy hold-to-speak is eligible
- When legacy left/right release semantics are eligible
- What the voice lane does while Name Shaping is active
- How debug/panel mode suppresses or changes live touch interpretation

**This phase MAY** extract a pure routing helper.

**This phase MUST NOT:**
- Invent a heavyweight state machine just because it sounds cleaner
- Erase existing mixed semantics without deliberate review
- Assume exclusive claiming if the real code still needs overlap

**Acceptance criteria:**
- [ ] Precedence decisions are easier to reason about than before
- [ ] Suppression rules are explicit
- [ ] There is one obvious place to inspect touch interpretation decisions
- [ ] Route selection can be tested without rendering

**Required tests:**
- Debug open vs closed
- Name Shaping enabled vs disabled
- Voice lane touched vs selector touched
- Hold-to-speak eligible vs suppressed
- Rules/cards swipe eligible vs suppressed
- Expected semantic interpretation for representative combinations

---

## BLOCK 12 — PHASE 7: ENVELOPE / ALIGNMENT CLEANUP

**Deliverable:** Reduce duplicated physical envelope assumptions (bandTopInsetPx, active vertical region, spine-centered horizontal placement).

**Files likely involved:** InteractionBand.tsx, Spine.tsx, TouchZones.tsx, NameShapingTouchGuideOverlay.tsx, sceneFormations.ts, builders/spine.ts, SpineLightCoreLayer.tsx

**Concrete step:** Introduce a small shared helper for **active-band vertical-envelope derivation and center-NDC alignment** (e.g. a pure function or small module that takes `bandTopInsetPx` and canvas height and returns `activeHeightRatio` and `centerNdcY`, or an equivalent envelope descriptor). Consumers that currently reimplement `(h - bandTopInsetPx) / h` and `-(bandTopInsetPx / h)` should call this helper instead.

**This phase MUST:**
- Identify duplicated assumptions
- Move shared calculations into that helper or the shared surface model
- Preserve spine-centered alignment
- Improve vertical and horizontal consistency

**This phase MUST NOT:**
- Pretend the app already has a fully solved canonical physical surface model
- Break current visual alignment while chasing abstraction purity

**Acceptance criteria:**
- [ ] Fewer duplicated active-region calculations
- [ ] Shared helper(s) or layout values clearly own vertical and horizontal alignment logic
- [ ] Spine-centered strip placement remains explicit
- [ ] Known drift risks are reduced

**Required tests:**
- Extracted envelope helper tests
- Vertical active-region regression tests
- Horizontal center-strip regression tests
- Drift-prevention regression tests (if known problem cases can be encoded)

---

## BLOCK 13 — PHASE 8: PERFORMANCE / STARTUP SAFETY

**Deliverable:** Verify and preserve lightweight initialization boundaries.

**This phase MUST explicitly preserve:**
- Native touch as authoritative input
- No GL-first event routing
- No eager full RAG init
- No accidental pack-heavy startup work caused by layout/routing changes

**Acceptance criteria:**
- [ ] No new code path in the refactor triggers full RAG init just to support layout
- [ ] No new code path moves authoritative touch handling into GL/raycast land
- [ ] Any new helper that touches lazy bootstrapping is isolated and reviewed

**Required tests:**
- If lazy-init helpers are introduced: unit test them
- If not: add assertions where feasible; keep logic localized
- At minimum: preserve existing boundaries in comments and review notes

---

## BLOCK 14 — PHASE 9: DOC / PLAN ALIGNMENT

**Deliverable:** Update living Name Shaping doc and related architecture notes to match post-refactor structure.

**Files:** `docs/NAME_SHAPING.md`, and any README/ARCHITECTURE sections that mention lane structure

**Docs MUST clearly distinguish:**
- Shared physical spine touch surface
- Name Shaping mode-specific layout
- Semantic interpretation
- Routing/precedence model
- Native touch authority
- Spine as central alignment anchor

**Docs MUST remove:** Stale geometry language (e.g. "mirrored spine-adjacent lanes") if it no longer reflects the code.

**Acceptance criteria:**
- [ ] Docs match the implemented structural model
- [ ] Stale geometry assumptions are removed
- [ ] The subsystem boundary remains legible to future work

---

## BLOCK 15 — REQUIRED TEST STRATEGY

**Mandatory rule:** If a block contains logic, it must either have **direct unit tests** or **extract a pure helper that has unit tests**. The refactor must avoid hiding important logic inside component bodies where it cannot be tested.

**Minimum required test coverage areas:**
- Physical surface geometry
- Name Shaping layout partitioning
- Semantic interpreter
- Transform helpers
- Routing/precedence helpers (if extracted)
- Envelope/alignment helpers
- Existing pure signature-generation functions remain covered

---

## BLOCK 16 — EXECUTION ORDER

| Step | Phase | Deliverable |
|------|--------|-------------|
| 1 | Phase 1 | Establish shared physical spine touch surface |
| 2 | Phase 2 | Establish Name Shaping mode-specific layout |
| 3 | Phase 3 | Establish semantic interpreter |
| 4 | Phase 4 | Establish transform layer |
| 5 | Phase 5a | Migrate capture hook to interpreter |
| 6 | Phase 5b | Migrate overlay to shared layout |
| 7 | Phase 5c | Migrate TouchZones/debug geometry to shared layout |
| 8 | Phase 6 | Clarify routing and precedence |
| 9 | Phase 7 | Reduce envelope/alignment duplication |
| 10 | Phase 8 | Verify perf/startup boundaries |
| 11 | Phase 9 | Update docs |

**Rationale:** Lock down geometry and semantics before deeper routing cleanup; routing clarification can proceed where the code forces it.

---

## BLOCK 17 — CODING EXPECTATIONS (NON-GOALS)

**Do NOT:**
- Redesign selector vocabulary or change Name Shaping region semantics (this refactor is structural only)
- Introduce new ownership layers casually
- Move subsystem ownership out of `src/app/nameShaping/`
- Embed new duplicated layout constants into overlay/render/capture consumers
- Replace native touch authority with GL picking
- "Clean up" by inventing a grand state machine unless specifically asked

**Do:**
- Prefer explicit small helpers over clever abstraction
- Prefer declarative layout data over opaque logic
- Prefer testable pure helpers whenever behavior becomes nontrivial

---

## CONSTRAINTS PRESERVED

Throughout the refactor, preserve the following:

- InteractionBand remains the single physical touch owner; native touch remains authoritative; band-local NDC remains the canonical semantic input basis.
- Name Shaping stays in `src/app/nameShaping/`; spine is not the semantic owner but remains the central alignment anchor.
- Full RAG init stays deferred; no layout/touch refactor triggers heavy pack/RAG startup.
- Routing and layout changes do not silently redefine gesture precedence without documentation and tests.
- **Name Shaping selector vocabulary is not being redesigned in this refactor.**
- **Name Shaping selector-region semantics are not being redesigned in this refactor.**  
  (Both protect the semantic system while you rearrange layout authority; do not mutate semantics — this pass is structural unification only.)
- **Routing clarification in this refactor is intended to preserve existing default user-visible spine semantics** unless a later UX-specific change explicitly alters them. The app should still work the same for users throughout and after the refactor.

---

## BLOCK 18 — SHORTEST AUTHORITATIVE SUMMARY

This refactor turns the current partially duplicated spine/Name Shaping touch implementation into a **layered, testable, native-touch-authoritative architecture** centered on:

- A **shared physical spine surface** (band-local NDC)
- A **Name Shaping-specific grammar layout** derived from that surface
- A **pure semantic interpreter**
- **Explicit projection helpers** for overlay/debug/render
- **Clearer routing/precedence rules**

All while:
- Preserving **spine-centered alignment**
- Keeping **InteractionBand** as the sole physical touch owner
- Maintaining **existing performance/startup boundaries**

---

## Implementation todos (tracking)

- [ ] Phase 1: spineTouchSurfaceLayout.ts + tests (in visualization/interaction; envelope + center strip only)
- [ ] Phase 2: nameShapingTouchLayout.ts + tests
- [ ] Phase 3: Refactor nameShapingTouchRegions.ts + tests
- [ ] Phase 4: nameShapingLayoutTransforms.ts + tests
- [ ] Phase 5a: useSpineNameShapingCapture consumes interpreter
- [ ] Phase 5b: NameShapingTouchGuideOverlay consumes shared layout/transforms
- [ ] Phase 5c: TouchZones consumes shared layout/transforms
- [ ] Phase 6: Routing clarification (optional nameShapingInteractionRouting.ts)
- [ ] Phase 7: Envelope/bandTopInsetPx cleanup
- [ ] Phase 8: Perf/startup verification
- [ ] Phase 9: docs/NAME_SHAPING.md and related docs
