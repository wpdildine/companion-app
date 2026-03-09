# Architecture Navigation Map

Canonical "where do I go?" doc; reference from README.

**Identity statement** — Each feature folder should contain everything required to understand that subsystem without searching the rest of the repo.

**Mental model** — app/ = entry + app orchestration; screens/ = screen views/composition; components/ = reusable UI blocks; shared/ = platform-agnostic core; rag/ and visualization/ = product features; utils/ = shared infra.

**Directory map** — src/app/ (app entry + orchestration shell; **agent/** = AgentOrchestrator, VisualizationController, ResultsOverlay, debug HUD panels; AgentSurface.tsx = composition root); src/screens/ (voice/); src/components/ (decon reusable UI blocks); src/shared/ (cross-feature contracts, feedback adapters, native diagnostics services); src/theme/ (canonical theme source: getTheme + tokens); src/rag/ (RAG: retrieval + pack logic); src/visualization/ (GL UI: engine/, scene/, render/, interaction/, materials/, utils/). **visualization/scene/** holds formations (contract + assembly), builders (e.g. spine), artDirection. All GL aesthetics live under scene and flow through `visualizationRef.current.scene`. src/utils/ is pure/side-effect isolated utilities. **Engine ref / viz state validation** lives in visualization/engine/validateVizState; scene contract validation in visualization/scene/validateSceneDescription. **Scope:** visualization/ and rag/ stay narrow; no analytics, app state, or cross-feature glue in features.

**The only two rules** — (1) Screens don't do IO; screens call hooks, hooks call services. Hooks may orchestrate state and call services, but should not contain raw NativeModules or fetch logic directly. (2) Shared UI belongs in `src/components/`; feature-local UI stays in feature folders (rag/visualization/screens). **Hard constraint:** No new top-level folders under src without updating ARCHITECTURE.md (prevents infra/, core/, lib/, engine/, manager/ sprawl). **App.tsx** must stay a thin shell.

**services/ vs helpers/ (in rag/visualization)** — services/ = IO or talking to the outside world. helpers/ = pure functions only; no side effects.

**Quick placement guide** — New RAG logic/runtime → `src/rag/` (feature-local modules; avoid creating empty helper/service roots). New GL/visualization code → visualization/engine/, visualization/scene/, visualization/render/, visualization/interaction/, visualization/materials/. New screen/voice UI → screens/voice/. Debug HUD panels → `src/app/agent/`. Theme values → theme/. Pure utils (no React/theme) → utils/. New reusable UI block → components/.

---

**Repo map** (short)

- **src/app** — app entry + navigation. AgentSurface = composition root; agent/ = AgentOrchestrator (useAgentOrchestrator), VisualizationController (useVisualizationController), ResultsOverlay. See docs/APP_ARCHITECTURE.md.
- **src/rag/** — RAG feature (`ask.ts`, runtime/context/provider logic, pack IO, types.ts).
- **src/visualization/** — Pure visualization layer (engine/, scene/, render/, interaction/, materials/, utils/). VisualizationCanvas, VisualizationSurface, VisualizationCanvasR3F, InteractionBand, DevPanel. No app state or theme import; receives injected theme primitives + engine ref. **GL canvas draw order:** (1) background field, (2) spine light core, (3) spine (base + shards + rot layer), (4) links/glyphs, (5) TouchZones (debug overlay), (6) post FX pass. Engine ref / viz state validation: visualization/engine/validateVizState; scene contract: visualization/scene/validateSceneDescription.
- **src/shared/** — platform-agnostic core: `types/`, `native/`, `feedback/`.
- **src/theme/** — canonical theme source (`getTheme`, `tokens`).
- **src/screens/** — screen-level view composition (`voice/`).
- **src/components/** — reusable UI blocks (`decon/`).
- **src/utils/** — log. Pure or side-effect isolated; no React/theme imports.

**Two non-negotiables**

- Screens don't do IO (hooks/services do).
- reusable cross-screen UI belongs in components/; feature-specific code stays in feature folders.

---

**These docs (don't contradict)** — README = what the app is and how it works. ARCHITECTURE = where code goes. AGENT_RULES = how to change code without bloat/drift. When you change structure (e.g. rename folders), update ARCHITECTURE first, then README, then AGENT_RULES if needed.
