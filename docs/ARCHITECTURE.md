# Architecture Navigation Map

Canonical "where do I go?" doc; reference from README.

**Identity statement** — Each feature folder should contain everything required to understand that subsystem without searching the rest of the repo.

**Mental model** — app/ = entry + navigation; rag/ and nodeMap/ = product features; theme/, ui/, utils/ = shared infra; shared/ = reusable building blocks (no feature logic).

**Directory map** — src/app/ (app entry + navigation); src/rag/ (RAG: retrieval + pack logic); src/nodeMap/ (GL UI: rendering + viz-only — components/, interaction/, helpers/, shaders/, types.ts). **nodeMap/helpers/** can contain a **formations** subfolder: `formations.ts` is the public contract + assembly; `formations/*.ts` (e.g. spine.ts, later halftone.ts, zones.ts) hold focused scene builders. All GL aesthetics live under formations and flow through `nodeMapRef.current.scene`. src/theme/ (getTheme, tokens — pure values, injected); src/ui/ (VoiceLoadingView, UserVoiceView, DevScreen, DebugZoneOverlay); src/utils/ (log, validateVizState — pure/side-effect isolated); src/shared/ (components/, hooks/, services/, helpers/, types/). **Scope:** nodeMap/ and rag/ stay narrow; no analytics, app state, or cross-feature glue in features.

**The only two rules** — (1) Screens don't do IO; screens call hooks, hooks call services. Hooks may orchestrate state and call services, but should not contain raw NativeModules or fetch logic directly. (2) **shared/ is for truly cross-feature code; if it's only used by rag or viz, it stays in rag/ or viz/.** **Hard constraint:** No new top-level folders under src without updating ARCHITECTURE.md (prevents infra/, core/, lib/, engine/, manager/ sprawl). **App.tsx** must shrink below ~500 lines over time.

**services/ vs helpers/ (in rag/viz)** — services/ = IO or talking to the outside world. helpers/ = pure functions only; no side effects. **shared/services vs rag/viz services** — Feature-specific service stays in rag/ or viz/; only move to shared/services after reuse in a second feature.

**Quick placement guide** — New RAG logic/UI → rag/components/, rag/hooks/, rag/services/, rag/helpers/. New GL/node map code → nodeMap/components/, nodeMap/helpers/, nodeMap/shaders/, etc. New screen/voice UI → ui/. Theme values → theme/. Pure utils (no React/theme) → utils/. New reusable UI → shared/components/. New reusable hook/util → shared/hooks/, shared/helpers/. New shared IO → shared/services/.

---

**Repo map** (short)

- **src/app** — app entry + navigation.
- **src/rag/** — RAG feature (components/, hooks/, services/, helpers/, types.ts).
- **src/nodeMap/** — Pure visualization layer (NodeMapCanvas, NodeMapSurface, etc.). components/, interaction/, helpers/, shaders/, types.ts. helpers/ can contain formations/ (formations.ts = contract + assembly; formations/*.ts = spine, halftone, etc.). No app state or theme import; receives injected theme primitives + engine ref. **GL canvas draw order:** (1) background field, (2) spine, (3) links/glyphs, (4) TouchZones (debug overlay).
- **src/theme/** — getTheme(isDark), tokens. Pure values only; injected into RN and nodeMap.
- **src/ui/** — VoiceLoadingView, UserVoiceView, DevScreen, DebugZoneOverlay, panel state types.
- **src/utils/** — log, validateVizState. Pure or side-effect isolated; no React/theme imports. **Validation split:** Engine ref / viz state validation lives in utils/validateVizState; scene contract validation is separate (e.g. nodeMap/helpers/validateSceneDescription or component-level dev assertions), not in validateVizState.
- **src/shared/** — reusable components, hooks, services, helpers, types.

**Two non-negotiables**

- Screens don't do IO (hooks/services do).
- shared/ is for truly cross-feature code; if it's only used by rag or viz, it stays in rag/ or viz/.

---

**These docs (don't contradict)** — README = what the app is and how it works. ARCHITECTURE = where code goes. AGENT_RULES = how to change code without bloat/drift. When you change structure (e.g. rename folders), update ARCHITECTURE first, then README, then AGENT_RULES if needed.
