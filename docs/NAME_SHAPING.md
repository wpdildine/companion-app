# Name Shaping

Living doc for the Name Shaping subsystem. Updated as overlay, resolver, normalization, and input-capture executables land.

## Overview

Name Shaping provides an app-level way to represent proper names (and other text) as **sound-shape signatures**: ordered sequences of coarse phonetic/structure selectors. The goal is to support input capture (e.g. touch/gesture), a debug overlay, and a resolver that matches user input to card names by signature.

**Where it lives:** `src/app/nameShaping/` is the canonical subsystem surface for shared vocabulary, types, and foundational pure transforms. Layout and touch interpretation extend from there; the **shared physical spine touch surface** lives in `src/visualization/interaction/` (grammar-agnostic).

## Architecture: touch and layout

- **Single touch owner:** `InteractionBand` (in `src/visualization/interaction/`) is the only physical touch owner for the spine surface. Native touch is the authoritative input path; band-local NDC is the canonical semantic input basis.
- **Shared physical spine touch surface:** `spineTouchSurfaceLayout.ts` (in `src/visualization/interaction/`) defines the grammar-agnostic envelope and center strip in band-local NDC. Rules/cards semantics remain in `zoneLayout.ts`; they are not part of the shared surface in this pass.
- **Name Shaping mode-specific layout:** `nameShapingTouchLayout.ts` partitions the shared center strip into **7 total regions**: the middle region is the reserved voice lane, the other 6 are selectors (BRIGHT, ROUND, LIQUID, SOFT, HARD, BREAK). Ordering top-to-bottom: BRIGHT, ROUND, LIQUID, voice, SOFT, HARD, BREAK.
- **Semantic interpreter:** `nameShapingTouchRegions.ts` maps band-local NDC points to selector/voice using the Name Shaping layout only (metadata-driven; no duplicate geometry).
- **Layout transforms:** `nameShapingLayoutTransforms.ts` projects canonical layout into overlay and render/debug coordinate spaces. It consumes a precomputed active-band envelope and does not own inset semantics.
- **Routing:** `nameShapingInteractionRouting.ts` encodes precedence (when center hold vs Name Shaping vs rules/cards apply). InteractionBand uses these rules; routing clarification preserves existing default user-visible spine semantics.

The spine is the central visual and interaction anchor; all touch/layout consumers stay aligned with it.

## Canonical selector vocabulary

Selectors are **coarse sound-shape families**, not letters. The fixed vocabulary is:

| Selector | Meaning |
| -------- | ------- |
| **BRIGHT** | Front/open vowel energy. Typical: a, e, i, ai, ay, ee, ea, ie. |
| **ROUND** | Back/rounded vowel energy. Typical: o, u, oo, ou, ow, au, aw, or, ur, er, ar. |
| **LIQUID** | Flowing connector sounds. Typical: r, l, w, y. |
| **SOFT** | Hiss/breath/friction. Typical: s, sh, z, zh, f, v, th, h, x. |
| **HARD** | Stop/impact/dense consonant. Typical: b, p, d, t, g, k, c, q, j, ch, m, n. |
| **BREAK** | Explicit separator (syllable break, manual segment break, commit boundary). Structural, not phonetic. |

## Design rules

- A **name signature** is an ordered sequence of selectors. Repetition is allowed.
- Raw emitted selector sequences preserve order and repetition.
- **BREAK** is structural only; it does not denote a phonetic sound. Token normalization (Executable 7) defines how BREAK is handled in normalized signatures.
- The canonical ordering for UI/debug is: BRIGHT, ROUND, LIQUID, SOFT, HARD, BREAK (see `SELECTOR_ORDER` in code).

## Code surface

- **Constants and types:** `src/app/nameShaping/nameShapingConstants.ts`, `src/app/nameShaping/nameShapingTypes.ts`.
- **Barrel:** `src/app/nameShaping/index.ts` — import from here for shared truth.
- **Shared physical surface:** `src/visualization/interaction/spineTouchSurfaceLayout.ts` (envelope + center strip).
- **Name Shaping layout:** `src/app/nameShaping/nameShapingTouchLayout.ts` (7 regions over center strip).
- **Semantic interpreter:** `src/app/nameShaping/nameShapingTouchRegions.ts` (`getSelectorFromNdc`, `isVoiceLaneNdc`).
- **Transforms:** `src/app/nameShaping/nameShapingLayoutTransforms.ts` (NDC → overlay/render).
- **Card-name-to-signature:** `buildCardNameSignature(cardName)` in `buildCardNameSignature.ts`.
- **Runtime state shape:** `NameShapingState` (enabled, rawEmittedSequence, normalizedSignature, resolverCandidates, selectedCandidate, activeSelector).

## Token normalization (Executable 7)

Raw emitted token sequences are normalized by `normalizeNameShapingSequence(rawTokens)` before being passed to the resolver. Rules: adjacent duplicate selectors collapse to one; adjacent BREAK runs collapse to one BREAK; leading and trailing BREAK are removed; interior BREAK is preserved; order is preserved. Output is a `NormalizedNameShapingSignature` (readonly array of selectors) suitable for `resolveProperNounBySignature`. No timing, DB, or UI—sequence-based only.

## Touch-to-selector capture (Executable 6)

When NameShaping is **enabled**, touch on the spine-adjacent interaction band can drive selector capture:

- **Region map:** The center strip is partitioned into **7 regions** (6 selectors + 1 voice). `nameShapingTouchLayout.ts` defines them; `nameShapingTouchRegions.ts` exposes `getSelectorFromNdc(ndcX, ndcY)` for **interaction-band-local NDC**. The reserved center (voice) region is excluded from selector capture; the other six are BRIGHT, ROUND, LIQUID, SOFT, HARD, BREAK top to bottom. **BREAK** is a touchable debug region so the full vocabulary can be exercised on device.
- **Capture hook:** `useSpineNameShapingCapture(enabled, actions)` returns handlers that map touch start/move/end/cancel to state: touch start sets `activeSelector` only; move emits only on region change; end/cancel clear `activeSelector`.
- **Integration:** Handlers are passed to `InteractionBand` as `nameShapingCapture`. InteractionBand remains the single touch owner. NameShaping capture is a semantic side path on the same touch stream; the voice region remains the hold-to-speak affordance. The overlay and TouchZones debug layer consume the same shared layout and transforms, so the visible guide and input mapping stay aligned.
- **Enabling for testing:** Open the Viz debug panel and use the NameShaping **Enable** control to turn capture on manually for device testing. NameShaping touch zones appear only while the debug surface is open and NameShaping is enabled.

## Later executables

This doc will be updated when:

- Resolver contract and scoring are refined or extended.
- Overlay rendering is added.
