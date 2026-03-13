# Name Shaping

Living doc for the Name Shaping subsystem. Updated as overlay, resolver, normalization, and input-capture executables land.

## Overview

Name Shaping provides an app-level way to represent proper names (and other text) as **sound-shape signatures**: ordered sequences of coarse phonetic/structure selectors. The goal is to support input capture (e.g. touch/gesture), a debug overlay, and a resolver that matches user input to card names by signature.

**Where it lives:** `src/app/nameShaping/` is the canonical subsystem surface for shared vocabulary, types, and foundational pure transforms. Later executables (overlay, resolver, input capture) extend from there and import shared types and vocabulary from that module.

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
- **Card-name-to-signature:** `buildCardNameSignature(cardName)` in `buildCardNameSignature.ts` returns a structured result (normalizedName, baseName, fullNameSignature, baseNameSignature). Code term: **baseNameSignature**. Doc phrase: "base-name sound-shape signature".
- **Runtime state shape:** `NameShapingState` (enabled, rawEmittedSequence, normalizedSignature, resolverCandidates, selectedCandidate, activeSelector).

## Token normalization (Executable 7)

Raw emitted token sequences are normalized by `normalizeNameShapingSequence(rawTokens)` before being passed to the resolver. Rules: adjacent duplicate selectors collapse to one; adjacent BREAK runs collapse to one BREAK; leading and trailing BREAK are removed; interior BREAK is preserved; order is preserved. Output is a `NormalizedNameShapingSignature` (readonly array of selectors) suitable for `resolveProperNounBySignature`. No timing, DB, or UI—sequence-based only.

## Touch-to-selector capture (Executable 6)

When NameShaping is **enabled**, touch on the spine-adjacent interaction band can drive selector capture:

- **Region map:** `nameShapingTouchRegions.ts` exposes `getSelectorFromNdc(ndcX, ndcY)` for **interaction-band-local NDC**. The canonical map is spine-local: a narrow reserved center voice lane stays excluded from selector capture, and mirrored spine-adjacent lanes are divided into six **vertical** selector segments from top to bottom = BRIGHT, ROUND, LIQUID, SOFT, HARD, BREAK. **BREAK is still a touchable debug region** so the full vocabulary can be exercised on device; the abstract model’s “BREAK as structural separator” is unchanged.
- **Capture hook:** `useSpineNameShapingCapture(enabled, actions)` returns handlers that map touch start/move/end/cancel to state: touch start sets `activeSelector` only; move emits only on region change; end/cancel clear `activeSelector`.
- **Integration:** Handlers are passed to `InteractionBand` as `nameShapingCapture`. InteractionBand remains the single touch owner. NameShaping capture is a semantic side path on the same touch stream, and the reserved center lane remains the hold-to-speak voice affordance. The TouchZones debug layer switches to the same canonical spine-local selector regions used by capture, so the visible overlay and input mapping stay aligned.
- **Enabling for testing:** Open the Viz debug panel and use the NameShaping **Enable** control to turn capture on manually for device testing. NameShaping touch zones appear only while the debug surface is open and NameShaping is enabled.

## Later executables

This doc will be updated when:

- Resolver contract and scoring are refined or extended.
- Overlay rendering is added.
