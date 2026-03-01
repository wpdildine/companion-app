# UI Refactor Plan: Theme, Folder Structure, Touch, Components, Tests & README

## Single source of truth

- Product UI is RN-only (ScrollView + blocks).
- Canvas is GL-only background.
- Canvas never owns product layout or panels.
- Only NodeMapInteractionBand captures drag (optional).
- DevPanel is gated + diagnostic-only.

**UI blocks must be separate components:** You must implement these blocks as separate RN components (not DevPanel): AnswerCard, CardReferenceBlock, SelectedRulesBlock. The screen must render correctly with NodeMapSurface removed.

---

> **Current repo reality:** Canonical structure is `src/nodeMap/` with NodeMap* components (`NodeMapCanvas`, `NodeMapCanvasR3F`, `NodeMapCanvasFallback`). This plan uses that structure throughout. If you see `src/viz/` or Viz* in historical notes, treat it as legacy naming and align implementation to `src/nodeMap/` + `NodeMap*`.

---

## Execution Status (2026-03-01)

- Done: folder/theme/utils migration to `src/nodeMap`, `src/theme`, `src/ui`, `src/utils`
- Done: fallback dots path (`NodeMapCanvasFallback`) is non-empty
- Done: `App.tsx` slimmed; screen composition centered in `VoiceScreen`
- Done: `UserVoiceView` and `DevScreen` are wired into `VoiceScreen`
- Done: `NodeMapInteractionBand` is enabled in user mode when no panels are visible
- Done: GL interaction affordance now reflects tap mapping (left active / center neutral / right active) in `ClusterTouchZones`
- Partial: panel gesture/arbitration system in `src/ui` (header drag/snap/dismiss/restore + ownership arbitration) is not fully implemented

---

**Boundary (architectural ownership):**  
NodeMap is a **pure visualization layer**. It does not own app state or voice lifecycle. It consumes **theme** (injected), **engine ref**, and **optional callbacks**. No theme import inside shaders or formation files.

**Projection surface contract:**
- Canvas is a projection surface that visually aligns to RN panels.
- RN provides `panelRects` (viewport-relative, scroll-corrected) and `panelState` (active/armed/expanded).
- Canvas renders planes/clusters aligned to those rects and reacts to semantic events.
- Canvas never changes panel visibility, app state, or navigation.

**Projection surface coverage:** Yes — full-screen by default. Canvas = absolute fill behind content; ScrollView + panels = normal content above. Canvas does not intercept touches (`pointerEvents: none`) unless you explicitly add a gesture band. This is the cleanest "projection surface."

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
│   ├── NodeMapCanvasFallback.tsx
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

## 3. NodeMapCanvasFallback vs NodeMapCanvasR3F: avoid duplication

- **Do not duplicate:** palette wiring, touch API mapping, or engine loop logic between R3F and Fallback.
- **Shared EngineLoop:** Keep a single engine loop concept (e.g. clock, activity easing, touchInfluence). R3F uses it in `useFrame`; Fallback can use the same ref and a JS-driven tick or requestAnimationFrame if needed.
- **Renderer as strategy:** Where possible, pass a “renderer” implementation (R3F scene vs 2D fallback) so that palette wiring, touch API, and engine ref integration live in one place and are shared. Both paths consume the same engine ref and the same injected theme primitives (e.g. `canvasBackground`, palette arrays).
- **Fallback must render a minimal field; never return an empty View.** If fallback is blank, people "fix" it by stacking overlays again.

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
- **Wire 3D:** App (or root) gets theme and passes **only primitives** into NodeMap: canvas background, palette arrays. NodeMapCanvasR3F and NodeMapCanvasFallback use those; starfieldData and formations accept optional palette args (arrays), never theme object. Shaders get data via uniforms from the component that holds theme, not from importing theme.

---

## 7. Refactor TS UI out of the monolith

- Extract VoiceLoadingView, UserVoiceView, DevScreen into `src/ui/`; they use theme (from App/props).
- App.tsx keeps state, effects, handlers; composes NodeMapCanvas + DevScreen vs UserVoiceView + dev toggle.
- Styling via theme and optional `src/ui/styles.ts`.

---

## 8. Tests, state validation, and logging

- **State validation:** `src/utils/validateVizState.ts` for `NodeMapEngineRef`; pure, no React/theme. Use in __DEV__ or tests.
- **Unit tests:** theme (getTheme keys and valid colors), viz state (createDefaultNodeMapRef, validateVizState), touch classification if extracted, optional UI snapshots.
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

## 11. Panel gesture spec

**Panel gestures are implemented in `src/ui/` components; viz receives only emphasis events and `panelRects`/`panelState`.** Do not implement gesture logic inside viz.

### A) Active zones (where gestures can start)

**Zones:**
- Cards panel header strip = active zone
- Rules panel header strip = active zone
- (Optional) a small "grab handle" inside header; preferred if headers are dense

**Hard rule:** Gestures must only begin on the header/grab handle. Never attach drag gestures to the panel body (avoids scroll conflicts).

---

### B) Panel states (deterministic)

Each panel can be in:
1. **Resting** — snapped to grid
2. **Dragging** — following finger, bounded
3. **Snapping** — animating back to grid
4. **Dismissed** — hidden/collapsed; restorable
5. **Expanded** — content expanded/collapsed; independent of dismissal

---

### C) Gesture semantics (tap vs drag)

**Tap (semantic, primary):**
- Tap header toggles Expanded state for that panel.
- Tap does not change canvas structure; it emits a semantic event for emphasis only.

**Drag + release (physical + reveal):**
- Dragging moves the panel physically (bounded).
- Release decides: Snap back (default) or Dismiss (if threshold crossed).
- Drag never changes app data. It only affects panel visibility and canvas emphasis.

---

### D) Drag motion (organic but bounded)

While dragging, apply physically-plausible movement:
- **Translate** follows finger with clamps:
  - X: ±24px
  - Y: 0 to +40px (downward pull allowed; no upward pull)
- **Optional "lift" cues:** Border slightly stronger; slightly increased shadow/elevation
- **Optional rotation** (Full mode only): max ±1.5°
- Never reflow text or change layout; only transform the panel container.

---

### E) Release outcomes (snap / dismiss / restore)

**1) Snap back (default)** — If drag distance is below dismissal threshold:
- Animate back to exact grid position.
- Duration: 180–260ms
- Easing: spring-like but restrained (no bouncy chaos)
- Final position must be exactly grid-aligned.

**2) Dismiss (intentional)** — If release crosses threshold:
- Dismiss the panel (slide out + fade).
- Thresholds (choose one or support both): Horizontal swipe |X| > 80px; Down pull Y > 90px
- After dismiss: Show "Undo" banner/snackbar ("Cards hidden" / "Rules hidden" + Undo); leave a small restore chip in place of the panel header.

**3) Restore** — If panel is dismissed:
- Tap restore chip OR drag it slightly inward to restore.
- Restore animation: slide in from dismissal direction, fade in, snap precisely to grid.

---

### F) Canvas coupling (required, but visual-only)

Canvas never owns logic. It only reflects events.

- **While dragging a panel:** Emit visual emphasis — dragging Cards → emphasize cards cluster; dragging Rules → emphasize rules cluster
- **On snap-back:** Reduce emphasis back to baseline.
- **On dismiss:** Visually "collapse" that cluster subtly (fade down / reduce density). Planes behind that panel should reduce.
- **On restore:** Cluster fades back in to baseline.

---

### G) Visual affordance (so zones aren't invisible)

Even in Subtle mode, headers must look "grabbable":
- Thin boundary hint or bracket line at low opacity
- Header label chip ("Cards", "Rules")
- On drag hover/armed: slightly brighter border or header underline

No hidden UI puzzles.

---

### H) Accessibility / reduce motion

If `reduceMotion=true`:
- Disable rotation
- Reduce translation clamp
- Replace spring with quick fade/collapse
- Keep all text stable

---

### I) Non-negotiables

- Panels are React-owned UI.
- Gestures start only on header/grab handle.
- Drag affects motion only; never changes app data.
- Final resting position is always grid-snapped.
- Canvas is visual-only and must not intercept touches by default.
- No DevPanels used as stand-ins for product UI.

---

## 12. Touch arbitration rules (non-negotiable)

### 1) Single gesture ownership per interaction

At any moment, exactly one of these may "own" the touch sequence:
1. Scroll (vertical ScrollView)
2. Panel Gesture (header drag / dismiss / snap)
3. Panel Tap (header tap to expand/collapse)
4. Canvas Gesture (only if you explicitly enable a NodeMapInteractionBand)

If one claims the gesture, the others must fail / not fire.

---

### 2) Gesture regions and priority

**Region ownership:**
- Panel Header Zone owns panel gestures (drag/tap).
- Panel Body is scroll/content only (no dismiss drag).
- Background / Canvas does not own touches (`pointerEvents: none`), except an optional explicit interaction band.

**Priority order:**
1. Panel Header Drag (if user starts in header and moves past threshold)
2. Scroll (if vertical intent is detected)
3. Panel Header Tap (only if no drag/scroll intent)
4. Canvas Interaction Band (optional; lowest priority unless explicitly engaged)

---

### 3) Tap vs drag discrimination (must be deterministic)

A header touch begins as "possible tap".

It becomes a drag only if movement exceeds thresholds:
- **Tap slop:** movement ≤ 8px total → still a tap candidate
- **Drag start threshold:** movement ≥ 10px → becomes a drag candidate
- Once drag starts, tap is canceled.

Also require:
- Drag must begin within header and remain within header for first 80ms (prevents accidental steals while scrolling).

---

### 4) Scroll vs panel drag discrimination

If vertical motion dominates early, scroll wins.

Define "scroll intent":
- `abs(dy) > 12px` AND `abs(dy) > abs(dx) * 1.2`

If scroll intent triggers:
- Panel drag must fail
- Panel tap must cancel
- Scroll takes over immediately

**Header lock:** If touch starts in header zone, require a larger vertical threshold or a short lock window (e.g., 80ms) before ScrollView may claim. This prevents scroll from stealing header drags.

This prevents "pulling panels" when the user is just scrolling.

---

### 5) Dismiss cannot trigger on incidental movement

Dismiss requires:
- Drag already active
- AND crossing a clear threshold: `abs(dx) > 80px` OR `dy > 90px`
- AND release velocity is not near-zero (optional safety)
- Otherwise → snap back.

This prevents accidental dismiss while peeking.

---

### 6) Active-zone activation cannot conflict with drag-to-dismiss

If you're using "active zones" (expand/collapse) on headers:
- Tap toggles expanded
- Drag moves panel physically
- Drag does not toggle expanded on release unless you explicitly want it.

**Rule:** If a drag sequence occurred (past threshold), expand/collapse is not triggered.

---

### 7) Canvas interaction (if present) must not steal from UI

**Default:** Canvas does not receive pointer events.

**Current pass:** `NodeMapInteractionBand` is ON only in user mode with no panels visible (`!debugEnabled && !anyPanelVisible`), and OFF otherwise.

When `NodeMapInteractionBand` is on:
- It must remain subordinate to product UI interactions.
- It must disable when panels are visible so panel/header gestures and content scroll can own touch.
- Its active-map affordance must stay explicit in GL (`ClusterTouchZones` overlay bands).

**Priority:** Panel header gestures > scroll > canvas band

---

### 8) "No double fire" acceptance criteria

Codex must satisfy these tests:
- A scroll gesture never dismisses a panel.
- A panel drag never scrolls the page.
- A panel drag never triggers a tap action.
- A tap never triggers drag motion.
- Canvas never intercepts taps/scroll in content.
- Only one handler logs as "claimed" per interaction.

---

## 13. Pickable zones, debug overlay, and UI pass scope

### Pickable zones (explicit and limited)

Given zones drive panels, make them explicit:
- **Cards zone** = Cards panel header strip (or grab handle)
- **Rules zone** = Rules panel header strip (or grab handle)

Not the whole panel body. Not the whole screen. This avoids gesture conflicts with scroll and content interaction.

---

### Debug zone overlay

Yes — and you should, at least in debug mode.

**Best approach:** A debug-only visualization that renders:
- A translucent rectangle outline for each zone (cards header, rules header)
- Label text ("Cards zone", "Rules zone")
- Current state: **inactive** (thin faint outline), **armed** (brighter outline), **active** (bright outline + subtle fill)

Can be done in the canvas (as 2D overlay planes) or as an RN overlay. Use measured header rects.

---

### UI pass deliverables (tight scope)

1. **Real components:** DeconPanel, CardReferenceBlock, SelectedRulesBlock
2. **Dummy "resolved" payload** renders those blocks
3. **Zone behavior:** Header tap toggles expand/collapse; header drag moves panel (bounded) and snaps/dismisses
4. **Gesture arbitration enforced:** Scroll never dismisses; drag never triggers tap; only header is draggable
5. **Debug zone highlight:** Shows pickable header areas and active/armed state

---

### Projection surface this pass (minimal)

- Full-screen canvas mounted behind (even if it just draws a calm plane)
- No cluster logic required yet
- Just prove layering + no touch interception + debug zone overlay alignment
- **Acceptance:** Fallback must render a minimal field; never return an empty View

---

### Debug zone visualization spec

Add a `debugShowZones` toggle (default off). When on:
- Draw outlines using the measured header rects
- Draw a small label at top-left of each rect
- Color/opacity varies by state: **inactive** (low opacity), **armed** (medium), **active** (higher + subtle fill)

That makes it obvious what is "pickable," and you'll immediately see if rects are wrong due to scroll offset.

---

## Suggested order of work

1. **Folder structure** – Create `src/theme/`, `src/ui/`, `src/utils/`; add theme (pure), touchHandlers, log, validateVizState. Ensure no theme import in nodeMap data/shaders.
2. **Theme module** – Implement getTheme(isDark) returning pure values only. Wire App and DevPanel to theme; inject primitives into NodeMap (canvas background, palette arrays). DevPanel overrides only viz palette.
3. **Shared engine / renderer strategy** – Clarify shared EngineLoop and single place for palette/touch/engine wiring; Fallback and R3F use same contract. Keep EngineLoop pure (math + ref mutation only; no transcripts, RAG, logging, or permission state).
4. **Touch API + stubs** – In nodeMap; double-tap and drag in NodeMapCanvasR3F. Document that touch may move to an interaction layer later.
5. **Extract UI components** – Move views into src/ui/; slim App.tsx.
6. **State validation + tests** – validateVizState, theme tests, vizState tests, touch tests, **log tests** (mode + sessionId, pulse + slot index).
7. **Panel gesture spec + touch arbitration** – Implement draggable Cards/Rules panels per §11; enforce touch arbitration per §12 (single ownership, tap/drag/scroll discrimination, no double fire).
8. **Pickable zones + debug overlay** – Per §13: real components (DeconPanel, CardReferenceBlock, SelectedRulesBlock), zone behavior, `debugShowZones` overlay for header rects and state.
9. **README** – Project structure, boundary, refactor summary, no Skia.
