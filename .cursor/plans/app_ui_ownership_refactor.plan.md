---
name: ""
overview: ""
todos: []
isProject: false
---

# App-layer UI ownership refactor (revised)

---

## Audit: Panel/Overlay/HUD inventory (expansion pass)

**1. Owning layer**
App-layer React/RN presentation. This audit only identifies and classifies; no invariant is broken.

**2. Broken invariant**
N/A (audit only).

**3. Audited search scope**

- **Included:** All app-layer React/RN files under `src/app/`**, `src/screens/`**, `src/components/\*\*`.
- **Excluded:** Everything under `src/nameShaping/`** (entire tree). Everything under `src/visualization/`** unless clearly an app-layer RN panel mistakenly living there (none found).

**4. Search heuristics used**

- **Filename patterns:** `*Panel`*, `*Overlay`*, `\*View\*.tsx` under app, screens, components.
- **Content patterns:** `function *Panel`, `*Overlay`, `onClose`, `ScrollView`, `Pressable`, `closeBtn`, `SectionTitle` / `sectionTitle`, `maxHeight` / `maxWidth`, `position: 'absolute'`, `zIndex`, bordered/translucent container styling.

**5. Found panel/overlay/HUD files**

| File                       | Location         | Panel-like traits                                                                                                                             |
| -------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| ResultsOverlay.tsx         | app/agent        | Overlay, scroll, reveal state, panel rects, content stack — **already in plan** (→ overlays/)                                                 |
| PipelineTelemetryPanel.tsx | app/agent        | HUD, ScrollView, close button, onClose, SectionTitle, maxHeight/maxWidth, bordered panel — **was missing from plan**                          |
| VizDebugPanel.tsx          | app/agent        | HUD wrapper, ScrollView, close button, onClose, section titles (Reference Stubs, NameShaping), maxHeight/maxWidth — **was missing from plan** |
| DeconPanel.tsx             | components/decon | Panel shell, title/subtitle/body, optional decon — **already in plan** (→ molecules/SurfacePanel or ContentPanel or organisms/)               |
| CardReferenceBlock.tsx     | components/decon | Section using DeconPanel — **already in plan** (→ organisms/)                                                                                 |
| SelectedRulesBlock.tsx     | components/decon | Section using DeconPanel — **already in plan** (→ organisms/)                                                                                 |
| VoiceLoadingView.tsx       | screens/voice    | Loading surface (title, spinner, hint) — **already in plan** (→ molecules/SemanticChannelLoadingView)                                         |
| UserVoiceView.tsx          | screens/voice    | Scroll container for content — **already in plan** (stay in screens/voice; rename SemanticChannelView)                                        |

**6. Classification for each**

| File                       | Classification                    | Proposed destination                                                                                    |
| -------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| ResultsOverlay.tsx         | User-facing overlay               | src/app/ui/components/overlays/ResultsOverlay.tsx                                                       |
| PipelineTelemetryPanel.tsx | **Debug/developer panel**         | src/app/ui/components/panels/debug/PipelineTelemetryPanel.tsx                                           |
| VizDebugPanel.tsx          | **Debug/developer panel**         | src/app/ui/components/panels/debug/VizDebugPanel.tsx                                                    |
| DeconPanel.tsx             | Panel shell (molecule if generic) | molecules/SurfacePanel.tsx or ContentPanel.tsx (or organisms/)                                          |
| CardReferenceBlock.tsx     | Content section (organism)        | organisms/CardReferenceBlock.tsx                                                                        |
| SelectedRulesBlock.tsx     | Content section (organism)        | organisms/SelectedRulesBlock.tsx                                                                        |
| VoiceLoadingView.tsx       | Loading view                      | Full-surface → organism; composable sub-view → molecule. SemanticChannelLoadingView.tsx in that folder. |
| UserVoiceView.tsx          | Screen composition only           | Stay in screens/voice; rename SemanticChannelView                                                       |

**7. Files explicitly excluded**

| File / path                          | Reason                                                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **src/nameShaping/** (entire tree)   | nameShaping isolated; do not classify, move, rename, or refactor. NameShapingDebugOverlay, NameShapingTouchGuideOverlay stay in nameShaping.                                   |
| **src/visualization/** (entire tree) | Viz layer; not app-layer presentation. DevPanel.tsx, DebugZoneOverlay.tsx are visualization debug tooling (runtime ref, viz toggles, zone outlines); not mistakenly app-layer. |
| src/app/App.tsx                      | Root shell; not a panel.                                                                                                                                                       |
| src/app/AgentSurface.tsx             | Composition root; not a panel.                                                                                                                                                 |
| src/app/VoiceScreen.tsx              | Legacy re-export; not a panel.                                                                                                                                                 |
| src/screens/voice/panelState.ts      | Types/state only; not a React component.                                                                                                                                       |

**8. Proposed additions to the refactor plan**

- Add **panels/user/** and **panels/debug/** to the target structure.
- **Move** PipelineTelemetryPanel and VizDebugPanel from app/agent to **src/app/ui/components/panels/debug/** (no behavior change; path and import updates only).
- Treat debug panels as part of app UI structure (same ownership tree as overlays and organisms), not “leave in agent.” AgentSurface continues to compose and mount them; it imports from app/ui.

**9. Migration map additions**

- PipelineTelemetryPanel.tsx: **Move** from src/app/agent/PipelineTelemetryPanel.tsx → src/app/ui/components/panels/debug/PipelineTelemetryPanel.tsx. Update agent/index.ts and AgentSurface to import from app/ui.
- VizDebugPanel.tsx: **Move** from src/app/agent/VizDebugPanel.tsx → src/app/ui/components/panels/debug/VizDebugPanel.tsx. Update internal import path to nameShaping (e.g. relative to new location). Update agent/index.ts and AgentSurface to import from app/ui.

**10. Self-audit (audit pass)**

- nameShaping not audited or referenced for move; fully excluded.
- visualization not used as a source of app-layer panels; DevPanel and DebugZoneOverlay confirmed as viz-layer.
- All app/agent and components/ and screens/ TSX files considered; only PipelineTelemetryPanel and VizDebugPanel were missing from the prior plan.
- Classification and destinations assigned; panels/debug/ added to structure.

---

## Refined principles

- **nameShaping/ = isolated subsystem.** It stays narrowly about that subsystem’s runtime, UI, and debug overlays. It does **not** become a grab-bag for app presentation. No bifurcation: app UI consolidation lives under `src/app/ui/`; nameShaping files stay in place and out of the central app UI move.
- **app/ui/ = reusable app presentation.** Scattered reusable UI (panel shells, content sections, overlays, loading views) consolidates under `src/app/ui/`.
- **Channel/surface/view names = by function, not legacy “voice” wording.** Names should reflect what the component actually is (e.g. semantic/conversational/result-channel surface), not the old “voice” umbrella.

## Order of work

1. **Move first:** Move the scattered reusable UI pieces into `src/app/ui/` (components, overlays, theme scaffold). **Rename VoiceLoadingView during the move** to SemanticChannelLoadingView (or ChannelLoadingView) so the new UI tree does not fossilize the old "voice" framing. **Do not move UserVoiceView in Phase 1;** rename only in place during Phase 2.
2. **Naming pass second:** Rename UserVoiceView → SemanticChannelView in screens/voice (file, component, props). VoiceScreen.tsx unchanged this pass.

---

## 1. Owning layer / invariant

- **Owning layer:** App-layer React/React Native presentation (structure and ownership). No runtime invariant is broken; this is a deliberate consolidation and restructure.
- **Scope:** Audit app/, screens/, and components/ for presentation-only UI; move true app UI into src/app/ui/; leave visualization/, orchestrator, speech/session, RAG, and dev-only panels out of scope.

---

## 2. What was wrong with the previous framing

The earlier plan framed the refactor as “move src/components/decon/” only. The real need is to **audit all app-layer React presentation** (panel shells, overlays, content sections, screen composition) and **consolidate** under src/app/ui/, so that:

- Panel shells, overlays, and result presentation are not scattered across agent/, screens/, and components/
- Naming reflects structure (e.g. no vague “decon” in ownership)
- Theme and reuse have a single, clear home (app/ui/theme, app/ui/components)

---

## 3. Audited file list and classification

### Stay put (do not move)

| File                               | Role                       | Reason                                                                                                                 |
| ---------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| src/app/App.tsx                    | Root shell                 | Entry point; not a reusable UI block                                                                                   |
| src/app/AgentSurface.tsx           | Top-level composition root | Composes viz, overlay, band, debug; stays as composition owner                                                         |
| src/app/VoiceScreen.tsx            | Legacy re-export           | Compatibility shim; **rename only later** if it still matters externally                                               |
| src/app/nameShaping/ (entire tree) | **nameShaping isolated**   | Do not classify, move, rename, or refactor. NameShapingDebugOverlay, NameShapingTouchGuideOverlay stay in nameShaping. |

### Move to src/app/ui/

| Current file                                | Type                               | Target                                                                                                                                                                                        |
| ------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| src/components/decon/DeconPanel.tsx         | Panel shell (conditional — see §5) | src/app/ui/components/molecules/SurfacePanel.tsx or ContentPanel.tsx **if** generic shell; else organism this pass                                                                            |
| src/components/decon/CardReferenceBlock.tsx | Content section (organism)         | src/app/ui/components/organisms/CardReferenceBlock.tsx                                                                                                                                        |
| src/components/decon/SelectedRulesBlock.tsx | Content section (organism)         | src/app/ui/components/organisms/SelectedRulesBlock.tsx                                                                                                                                        |
| src/app/agent/ResultsOverlay.tsx            | User-facing overlay                | src/app/ui/components/overlays/ResultsOverlay.tsx                                                                                                                                             |
| src/app/agent/PipelineTelemetryPanel.tsx    | **Debug/developer panel**          | src/app/ui/components/panels/debug/PipelineTelemetryPanel.tsx                                                                                                                                 |
| src/app/agent/VizDebugPanel.tsx             | **Debug/developer panel**          | src/app/ui/components/panels/debug/VizDebugPanel.tsx                                                                                                                                          |
| src/screens/voice/VoiceLoadingView.tsx      | Loading view                       | **Criterion:** If it renders a **full-surface state** → organism; if it is a **composable sub-view** → molecule. Place SemanticChannelLoadingView.tsx in that folder; **rename during move**. |

### Leave in place (structure); rename in naming pass

| Current file                        | Role                                           | Action                                                                                                                                                                                |
| ----------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| src/screens/voice/UserVoiceView.tsx | Semantic/conversational/result-channel surface | **Stay in screens/voice/** for this pass. **Do not move UserVoiceView in Phase 1;** rename only in place during Phase 2 to SemanticChannelView.tsx (component + export + props type). |

---

## 4. Naming pass (after moves)

Apply after the migration. Only remaining rename in this pass:

| Current name    | New name                | Location                                                                                       |
| --------------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| UserVoiceView   | **SemanticChannelView** | src/screens/voice/SemanticChannelView.tsx (file rename + component + SemanticChannelViewProps) |
| VoiceScreen.tsx | No change this pass     | Rename only later if it still matters externally                                               |

VoiceLoadingView is already renamed during the move (→ SemanticChannelLoadingView or ChannelLoadingView).

Result:

- **voice** = interaction mode where needed (e.g. hold-to-speak).
- **semantic channel** = the actual surface concept (scrollable result/conversation surface and its loading state).
- **nameShaping** = distinct subsystem; no app presentation mixed in.

---

## 5. Identified categories (for the audit)

- **Panel shells:** DeconPanel is **expected** to become a panel molecule **if it is a generic shell** (title/subtitle/body slot, no domain-specific assumptions). **Cursor should verify this, not assume.** If it is generic enough to move, prefer a name that will age well with multiple panel families — e.g. **SurfacePanel** or **ContentPanel** rather than the very generic **Panel**. If it still contains a lot of domain-specific logic or assumptions, keep it as an organism during this pass instead of promoting to molecule.
- **Overlays:** ResultsOverlay (user-facing) → overlays/; PipelineTelemetryPanel, VizDebugPanel, NameShaping → stay (dev-only; nameShaping isolated).
- **Content sections:** CardReferenceBlock, SelectedRulesBlock → organisms.
- **Screen composition:** UserVoiceView → stay in screens/voice; rename to SemanticChannelView in naming pass. **Guardrail:** Do not move screen composition components into app/ui/components unless they are actually reusable UI. That protects components like UserVoiceView from being moved into the new UI tree just because they are React — they stay in screens/ unless they are clearly reusable app UI.
- **Debug/developer panels:** PipelineTelemetryPanel and VizDebugPanel move to app/ui/components/panels/debug/ so all app-layer presentation (including debug HUDs) lives under app/ui. They remain dev-only in behavior; only location and ownership change.
- **nameShaping:** All nameShaping UI stays in nameShaping; fully excluded from this refactor.

---

## 6. Proposed target structure

```
src/app/ui/
  components/
    atoms/                    # (empty; for future)
    molecules/
      SurfacePanel.tsx        # or ContentPanel.tsx; ex-DeconPanel, if verified as generic shell
      SemanticChannelLoadingView.tsx   # ex-VoiceLoadingView (rename during move)
    organisms/
      CardReferenceBlock.tsx
      SelectedRulesBlock.tsx
    overlays/
      ResultsOverlay.tsx      # ex-app/agent/ResultsOverlay
    panels/
      user/                   # Keep empty unless a file is clearly a panel shell (not a content organism). Do not invent moves into panels/user/.
      debug/
        PipelineTelemetryPanel.tsx   # ex-app/agent
        VizDebugPanel.tsx             # ex-app/agent
    index.ts                  # barrel
  theme/
    tokens.ts
    index.ts
  index.ts                    # re-export components + theme
```

**Out of this refactor:** Do not add `src/app/ui/screens/` in this pass. It is a possible second move and not needed yet. Keep screen-composition components (e.g. SemanticChannelView) in screens/voice.

**agent/index.ts:** **Remove re-exports** for moved UI (ResultsOverlay, PipelineTelemetryPanel, VizDebugPanel) from agent/index.ts. All consumers import these from app/ui. Do not preserve re-exports in agent for these; that would keep a shadow path. Update AgentSurface and any other call sites to import from app/ui.

### components/ index — temporary compatibility only

- **Keep** `src/components/index.ts` as a **temporary compatibility shim only** (e.g. `export * from '../app/ui'`) so existing imports from `components` still resolve.
- **Prefer direct imports from src/app/ui.** All new and updated call sites should import from `src/app/ui` (or relative paths into app/ui), not from `src/components`.
- **Do not add new imports through src/components.** Otherwise the repo will keep importing through components/ and you will have only moved the clutter, not fixed the ownership. The shim exists to avoid breaking existing references during the move; do not expand its usage.

---

## 7. File-by-file migration map

**Anti-drift:** Do not move or rename any file not listed in this migration map unless required for import correctness. Reduces opportunistic cleanup.

**Phase 1: Move**

| #   | Current location                            | Action                                      | New location                                                                                                                                                                                         |
| --- | ------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | src/components/decon/DeconPanel.tsx         | Move + rename **if verified generic shell** | src/app/ui/components/molecules/SurfacePanel.tsx or ContentPanel.tsx (matching type names); else move to organisms/ as-is. Do not use bare name Panel.                                               |
| 2   | src/components/decon/CardReferenceBlock.tsx | Move                                        | src/app/ui/components/organisms/CardReferenceBlock.tsx; internal import SurfacePanel/ContentPanel (or DeconPanel) from appropriate path                                                              |
| 3   | src/components/decon/SelectedRulesBlock.tsx | Move                                        | src/app/ui/components/organisms/SelectedRulesBlock.tsx; internal import SurfacePanel/ContentPanel (or DeconPanel) from appropriate path                                                              |
| 4   | src/app/agent/ResultsOverlay.tsx            | Move                                        | src/app/ui/components/overlays/ResultsOverlay.tsx; update imports (organisms, molecules, shared, rag, viz, agent types)                                                                              |
| 5   | src/screens/voice/VoiceLoadingView.tsx      | Move **and rename**                         | **Criterion:** full-surface → organisms/; composable sub-view → molecules/. SemanticChannelLoadingView.tsx (or ChannelLoadingView.tsx) in that folder; fix theme import                              |
| 6   | src/app/agent/PipelineTelemetryPanel.tsx    | Move                                        | src/app/ui/components/panels/debug/PipelineTelemetryPanel.tsx; update agent index and AgentSurface imports                                                                                           |
| 7   | src/app/agent/VizDebugPanel.tsx             | Move                                        | src/app/ui/components/panels/debug/VizDebugPanel.tsx; update internal import to nameShaping (relative from new path); update agent index and AgentSurface imports                                    |
| 8   | src/components/decon/ + index               | Remove / shim                               | Delete decon files. Set src/components/index.ts to **temporary compatibility shim only**: `export * from '../app/ui'`. Prefer direct imports from app/ui; do not add new imports through components. |

**Phase 2: Naming pass**

| #   | Current                             | Rename to                                                                                |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | src/screens/voice/UserVoiceView.tsx | SemanticChannelView.tsx (file, component, UserVoiceViewProps → SemanticChannelViewProps) |

**Consumer updates:** AgentSurface and all importers use **direct imports from src/app/ui** (not from src/components). Update for new paths: ResultsOverlay, SemanticChannelLoadingView, PipelineTelemetryPanel, VizDebugPanel, and (after naming pass) SemanticChannelView. screens/voice/index.ts, app/agent/index.ts (re-export from app/ui or remove and use app/ui), tests.

---

## 8. Theme scaffold

- Add **src/app/ui/theme/tokens.ts:** Minimal tokens from existing component values (spacing, radius, color, typography, motion); no redesign.
- Add **src/app/ui/theme/index.ts:** Re-export tokens; optional re-export of Theme/getTheme from src/theme.
- Components may keep current StyleSheet constants; theme is the place for future tokens/recipes.

---

## 9. Tests to update / add

- Update **tests/resultsOverlayReferences.test.tsx:** mock path `../src/app/ui`, mock Panel (or DeconPanel if kept as organism), CardReferenceBlock, SelectedRulesBlock; fix ResultsOverlay import.
- Update any test importing ResultsOverlay, VoiceLoadingView, decon, PipelineTelemetryPanel, or VizDebugPanel from old paths; use direct app/ui imports.
- After naming pass: update tests that reference UserVoiceView to SemanticChannelView.
- Add only minimal smoke if useful (e.g. barrel import test). No large new suite.

---

## 10. Out-of-scope files

- **src/visualization/** — entire tree (including DevPanel, DebugZoneOverlay; viz-layer tooling, not app-layer).
- **Orchestrator / runtime:** useAgentOrchestrator, request flow, voice/session, haptics, STT.
- **RAG / model / runtime logic.**
- **nameShaping/** — **fully excluded;** do not classify, move, rename, or refactor anything under nameShaping.
- App.tsx, AgentSurface.tsx, VoiceScreen.tsx — composition root / compat; no move. VoiceScreen rename only later if needed.
- **app/ui/screens/:** Out of this refactor entirely; do not add. A possible second move, not needed yet.
- No new markdown docs or architecture essays. Do not create or edit ARCHITECTURE.md (or other docs) in this refactor.

---

## 11. Patch summary (ordered steps)

**Phase 1 — Move**

1. Create directories: src/app/ui/theme/, src/app/ui/components/atoms/, molecules/, organisms/, overlays/, panels/user/, panels/debug/.
2. Add theme scaffold: tokens.ts, theme/index.ts.
3. **Verify DeconPanel:** If it is a generic shell (title/subtitle/body, no domain-specific assumptions), add Panel (from DeconPanel) under molecules/ with Panel types; otherwise move DeconPanel to organisms/ for this pass.
4. Move CardReferenceBlock, SelectedRulesBlock to organisms/; internal import Panel or DeconPanel from appropriate path.
5. Move VoiceLoadingView to app/ui as **SemanticChannelLoadingView.tsx** (or ChannelLoadingView.tsx) — rename file, component, and props during move; fix theme import. **Single criterion:** full-surface state → organisms/; composable sub-view → molecules/.
6. Move ResultsOverlay to app/ui/components/overlays/; update internal imports.
7. Move PipelineTelemetryPanel to app/ui/components/panels/debug/; move VizDebugPanel to app/ui/components/panels/debug/ (update VizDebugPanel’s internal import path to nameShaping).
8. Add barrels: components/index.ts (export overlays, organisms, molecules, panels/debug), app/ui/index.ts.
9. Update AgentSurface and all call sites to **direct imports from src/app/ui**. **Remove** re-exports of ResultsOverlay, PipelineTelemetryPanel, VizDebugPanel from agent/index.ts (do not preserve shadow re-exports). Update screens/voice/index.ts for SemanticChannelLoadingView.
10. Update **tests**/resultsOverlayReferences.test.tsx.
11. Remove src/components/decon. Set src/components/index.ts as **temporary compatibility shim only** (`export * from '../app/ui'`). Do not add new imports through src/components.

**Phase 2 — Naming pass**

1. Rename UserVoiceView → SemanticChannelView (file, component, props) in screens/voice; update screens/voice/index.ts and AgentSurface (and any other importers).
2. Re-run tests and typecheck.

---

## 12. Self-audit

- nameShaping is never used as a home for app presentation; it stays isolated.
- Refactor root is src/app/ui/; all moved reusable UI lives under it.
- VoiceLoadingView renamed during the move (→ SemanticChannelLoadingView or ChannelLoadingView); no fossilized Voice name in app/ui.
- src/components/index.ts is temporary compatibility shim only; no new imports added through src/components; consumers use direct app/ui imports.
- DeconPanel → SurfacePanel or ContentPanel (not bare Panel) only if verified as generic shell; otherwise kept as organism this pass.
- UserVoiceView not moved in Phase 1; rename only in place in Phase 2. Screen composition not moved into app/ui/components unless clearly reusable UI.
- app/ui/screens/ not added; out of this refactor entirely.
- Naming pass only: UserVoiceView → SemanticChannelView. VoiceScreen.tsx not renamed this pass.
- Audit complete: PipelineTelemetryPanel and VizDebugPanel included; destination panels/debug/. nameShaping fully excluded; visualization not used as app-layer panel source.
- Audited file list and classification are complete; all app-layer panel/overlay/HUD files accounted for.
- All consumers and tests updated for moves and renames; behavior preserved; no logic changes.
- No file moved or renamed that is not in the migration map, except when required for import correctness.
