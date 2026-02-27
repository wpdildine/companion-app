# Architecture Navigation Map

Canonical "where do I go?" doc; reference from README.

**Identity statement** — Each feature folder should contain everything required to understand that subsystem without searching the rest of the repo.

**Mental model** — app/ = entry + navigation; rag/ and viz/ = product features; shared/ = reusable building blocks (no feature logic).

**Directory map** — src/app/ (app entry + navigation); src/rag/ (RAG: retrieval + pack logic); src/viz/ (GL UI: rendering + viz-specific behavior only — components/, interaction/ for 3D raycasting and in-scene UI, hooks/, services/, helpers/, shaders/, types.ts); src/shared/ (components/, hooks/, services/, helpers/, types/, theme/). **Scope:** viz/ and rag/ stay narrow; no analytics, app state, shared utils, or cross-feature glue in features.

**The only two rules** — (1) Screens don't do IO; screens call hooks, hooks call services. Hooks may orchestrate state and call services, but should not contain raw NativeModules or fetch logic directly. (2) Shared is not a dumping ground; feature-specific code lives in that feature. **Hard constraint:** No new top-level folders under src without updating ARCHITECTURE.md (prevents infra/, core/, lib/, engine/, manager/ sprawl). **App.tsx** must shrink below ~500 lines over time.

**services/ vs helpers/ (in rag/viz)** — services/ = IO or talking to the outside world. helpers/ = pure functions only; no side effects. **shared/services vs rag/viz services** — Feature-specific service stays in rag/ or viz/; only move to shared/services after reuse in a second feature.

**Quick placement guide** — New RAG logic/UI → rag/components/, rag/hooks/, rag/services/, rag/helpers/. New GL/viz code (including nodeMap canvas) → viz/components/, viz/hooks/, etc. New reusable UI → shared/components/. New reusable hook/util → shared/hooks/, shared/helpers/. New shared IO → shared/services/.

---

**Repo map** (short)

- **src/app** — app entry + navigation.
- **src/rag/** — RAG feature (components/, hooks/, services/, helpers/, types.ts).
- **src/viz/** — GL UI (rendering + viz-specific only). components/ (scene), interaction/ (3D raycasting, in-scene UI), hooks/, services/, helpers/, shaders/, types.ts.
- **src/shared/** — reusable components, hooks, services, helpers, types, theme.

**Two non-negotiables**

- Screens don't do IO (hooks/services do).
- shared contains no feature logic.
