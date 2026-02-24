# UI Refactor Plan: Theme, Folder Structure, Touch, Components, Tests & README

**Boundary (architectural ownership):**  
NodeMap is a **pure visualization layer**. It does not own app state or voice lifecycle. It consumes **theme** (injected), **engine ref**, and **optional callbacks**. No theme import inside shaders or formation files.

---

## 0. Decisions and constraints

- **Skia:** Not used in this project. Do not introduce Skia; remove any references if present elsewhere.
- **Theme at runtime:** Theme is **immutable at runtime**. It is recomputed only when `isDark` changes. DevPanel overrides affect **viz palette only**, not the RN base theme (so dev sliders do not change RN text color).
- **Utils:** Code in `src/utils/` must be **pure or side-effect isolated**. No React imports, no theme imports. Prevents utils from becoming a junk drawer.
- **Engine ref ownership:** Fields in the engine ref are categorized as **Targets (App-owned)** vs **Derived (EngineLoop-owned)**. App writes targets; EngineLoop writes derived/continuous values only.

---

## 1. Refactored folder structure

**Current:** Flat `src/` with `nodeMap/`, `rag/`, `native/`, `types/`; `App.tsx` at root; single `__tests__/App.test.tsx`.

**Proposed:**

```
src/
├── theme/
│   ├── index.ts          # getTheme(isDark) → pure values only
│   └── tokens.ts         # (optional) raw hex/rgb constants
├── ui/
│   ├── VoiceLoadingView.tsx
│   ├── UserVoiceView.tsx
│   ├── DevScreen.tsx     # or re-export DevPanel
│   └── styles.ts
├── nodeMap/
│   ├── index.ts
│   ├── types.ts
│   ├── touchHandlers.ts  # callback types + stub map (no theme import)
│   ├── NodeMapCanvas.tsx
│   ├── NodeMapCanvasR3F.tsx
│   ├── NodeMapFallback.tsx
│   ├── ... (rest)
│   └── shaders/          # no theme import; receive primitives only
├── rag/
├── native/
├── types/
├── utils/
│   ├── log.ts            # logViz, logTouch; no React/theme
│   └── validateVizState.ts
App.tsx
__tests__/
├── App.test.tsx
├── theme.test.ts
├── vizState.test.ts
├── touchHandlers.test.ts
├── log.test.ts           # assert mode logs include sessionId, pulse logs include slot index
└── ui/
    └── UserVoiceView.test.tsx  # optional
```

---

## 2. Theme: pure values, injection only (no circular deps)

- **Theme returns pure values.** `getTheme(isDark)` returns a plain object: RN tokens (hex strings) and **primitive viz data** (e.g. `canvasBackground: string`, `paletteA: [number, number, number]`, `paletteB`, `nodePalette: [number, number, number][]`). No functions, no refs.
- **NodeMap consumes only primitive palette arrays.** App (or whoever owns theme) calls `getTheme(isDark)`, then passes **only the needed primitives** into NodeMap: e.g. `canvasBackground`, `paletteA`, `paletteB`, `nodePalette`. NodeMap **never imports theme**. Theme is **injected**, not globally referenced.
- **Shaders and formation files:** Never import theme. They receive palette/color data as props or uniforms (primitive arrays/numbers). So: no `import { getTheme } from '../../theme'` inside `starfieldData.ts`, `formations.ts`, or any file under `shaders/`.

This avoids circular dependency risk and keeps the viz layer decoupled from the theme module.

---

## 3. NodeMapFallback vs NodeMapCanvasR3F: avoid duplication

- **Do not duplicate:** palette wiring, touch API mapping, or engine loop logic between R3F and Fallback.
- **Shared EngineLoop:** Keep a single engine loop concept (e.g. clock, activity easing, touchInfluence). R3F uses it in `useFrame`; Fallback can use the same ref and a JS-driven tick or requestAnimationFrame if needed.
- **Renderer as strategy:** Where possible, pass a “renderer” implementation (R3F scene vs 2D fallback) so that palette wiring, touch API, and engine ref integration live in one place and are shared. Both paths consume the same engine ref and the same injected theme primitives (e.g. `canvasBackground`, palette arrays).

This keeps one source of truth for how the viz reacts to engine state and theme.

---

## 4. EngineLoop scope: avoid responsibility creep

**Single-direction rule:** Fields in the engine ref are categorized as **Targets (App-owned)** vs **Derived (EngineLoop-owned)**. That separation prevents "who owns this field?" bugs.

- **App writes targets only:** e.g. `targetActivity`, `touchActive`, `touchWorld`, `paletteId`, viz toggles; and **pulse slot start** when triggering: `pulseTimes[i] = now`, `pulsePositions[i] = …`, `pulseColors[i] = …`, `lastPulseIndex = …`. App/voice layer owns mode, transcripts, and RAG; they set targets on the ref. **submittedText snapshot / requestId are app-owned (not in engine ref)** — do not put text or request state into the ref.
- **EngineLoop writes derived/continuous only:** e.g. `activity` (eased toward targetActivity), `touchInfluence` (eased toward touch state), **clock/uTime** (used by shaders to compute pulse decay from `pulseTimes`; decay stays in shader math, not a derived field in the ref). EngineLoop must **not** mutate pulse slot arrays (positions/times/colors); it only updates uTime. It does **not** write targets and does **not** know about transcripts, RAG, logging policy, or permission state.

If EngineLoop stays **pure (math + ref mutation on derived fields only)**, it stays healthy.

---

## 5. Touch handlers: location and evolution

- **Current location:** `src/nodeMap/touchHandlers.ts` is correct for now (callback types + stub map). NodeMapCanvasR3F (and NodeMapCanvas) use it.
- **Evolution rule:** If touch begins to **alter mode**, **trigger analytics**, or **trigger haptics**, move the contract **upward early** (e.g. `src/interaction/` or handlers owned by App). Until then, nodeMap is the right place; avoid hard-coding app behavior inside nodeMap.

---

## 6. Normalize color system (theme → RN and 3D, injected)

- **Theme module** (`src/theme/index.ts`): `getTheme(isDark)` returns pure values only:
  - RN: `text`, `textMuted`, `background`, `surface`, `border`, `primary`, `success`, `error`, `warning`.
  - Viz (primitives only): `canvasBackground` (hex), `paletteA`, `paletteB` (RGB 0–1), `nodePalette` (array for formations). Optional: mode colors for shaders as arrays.
- **Wire RN:** App and DevPanel/DevScreen use theme; replace hardcoded colors. DevPanel overrides change only viz palette (e.g. passed into nodeMap), not RN theme.
- **Wire 3D:** App (or root) gets theme and passes **only primitives** into NodeMap: canvas background, palette arrays. NodeMapCanvasR3F and NodeMapFallback use those; starfieldData and formations accept optional palette args (arrays), never theme object. Shaders get data via uniforms from the component that holds theme, not from importing theme.

---

## 7. Refactor TS UI out of the monolith

- Extract VoiceLoadingView, UserVoiceView, DevScreen into `src/ui/`; they use theme (from App/props).
- App.tsx keeps state, effects, handlers; composes NodeMapCanvas + DevScreen vs UserVoiceView + dev toggle.
- Styling via theme and optional `src/ui/styles.ts`.

---

## 8. Tests, state validation, and logging

- **State validation:** `src/utils/validateVizState.ts` for VizEngineRef; pure, no React/theme. Use in __DEV__ or tests.
- **Unit tests:** theme (getTheme keys and valid colors), viz state (createDefaultVizRef, validateVizState), touch classification if extracted, optional UI snapshots.
- **Logging tests (required):** At least one test must assert:
  - Mode change logs include a session identifier (e.g. `sessionId` or equivalent).
  - Pulse logs include slot index (or equivalent).
  Otherwise logging discipline will decay. Add `__tests__/log.test.ts` (or similar) and keep it as part of the refactor.

---

## 9. Structured logging (utils)

- **`src/utils/log.ts`:** `logViz`, `logTouch` with consistent prefix and optional payload. No React imports, no theme imports. Can take sessionId/slot index as arguments so callers pass them in; tests then assert on the structured output.
- Optional debug flag to gate verbose logs. Callers (App, nodeMap) use these helpers instead of ad-hoc `console.log` for mode and pulse events.

---

## 10. README update

- **Project structure:** Document `src/theme/` (pure values, injected into RN and nodeMap), `src/ui/`, `src/nodeMap/` (pure viz; consumes injected theme primitives + engine ref + callbacks), `src/rag/`, `src/utils/` (pure/side-effect isolated; no React/theme).
- **Boundary:** Short note that NodeMap is a pure visualization layer and does not own app state or voice lifecycle.
- **Refactor summary:** Single theme (RN + viz primitives), theme immutable at runtime (isDark only; DevPanel = viz only), unified touch API with stubs, shared engine/strategy for R3F vs Fallback, logging tests for mode and pulse.
- **Step 4 (Modify your app):** Point to `src/theme`, `src/ui`, `src/nodeMap` for where to add features. Mention Skia is not used.

---

## Suggested order of work

1. **Folder structure** – Create `src/theme/`, `src/ui/`, `src/utils/`; add theme (pure), touchHandlers, log, validateVizState. Ensure no theme import in nodeMap data/shaders.
2. **Theme module** – Implement getTheme(isDark) returning pure values only. Wire App and DevPanel to theme; inject primitives into NodeMap (canvas background, palette arrays). DevPanel overrides only viz palette.
3. **Shared engine / renderer strategy** – Clarify shared EngineLoop and single place for palette/touch/engine wiring; Fallback and R3F use same contract. Keep EngineLoop pure (math + ref mutation only; no transcripts, RAG, logging, or permission state).
4. **Touch API + stubs** – In nodeMap; double-tap and drag in NodeMapCanvasR3F. Document that touch may move to an interaction layer later.
5. **Extract UI components** – Move views into src/ui/; slim App.tsx.
6. **State validation + tests** – validateVizState, theme tests, vizState tests, touch tests, **log tests** (mode + sessionId, pulse + slot index).
7. **README** – Project structure, boundary, refactor summary, no Skia.
