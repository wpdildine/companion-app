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
- **BREAK** is structural only; it does not denote a phonetic sound. Normalization may treat it specially in a later executable.
- The canonical ordering for UI/debug is: BRIGHT, ROUND, LIQUID, SOFT, HARD, BREAK (see `SELECTOR_ORDER` in code).

## Code surface

- **Constants and types:** `src/app/nameShaping/nameShapingConstants.ts`, `src/app/nameShaping/nameShapingTypes.ts`.
- **Barrel:** `src/app/nameShaping/index.ts` — import from here for shared truth.
- **Card-name-to-signature:** `buildCardNameSignature(cardName)` in `buildCardNameSignature.ts` returns a structured result (normalizedName, baseName, fullNameSignature, baseNameSignature). Code term: **baseNameSignature**. Doc phrase: "base-name sound-shape signature".
- **Runtime state shape:** `NameShapingState` (enabled, rawEmittedSequence, normalizedSignature, resolverCandidates, selectedCandidate, activeSelector). Shape only in Block 1; no normalization or resolver behavior yet.

## Later executables

This doc will be updated when:

- Normalization rules (e.g. whether BREAK appears in normalized signatures) are defined.
- Resolver contract and scoring are implemented.
- Overlay and input-capture behavior are added.
