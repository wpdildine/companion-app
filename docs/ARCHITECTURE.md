# Architecture Navigation Map

Canonical "where do I go?" doc; reference from README.

**Identity statement** — Each feature folder should contain everything required to understand that subsystem without searching the rest of the repo.

**Mental model** — app/ = entry + app orchestration; screens/ = screen views/composition; components/ = reusable UI blocks; shared/ = platform-agnostic core; rag/ and visualization/ = product features; utils/ = shared infra.

**Directory map** — src/app/ (app entry + orchestration shell; **agent/** = AgentOrchestrator, VisualizationController, ResultsOverlay, debug HUD panels; AgentSurface.tsx = composition root); src/screens/ (voice/); src/components/ (decon reusable UI blocks); src/shared/ (cross-feature contracts, feedback adapters, native diagnostics services); src/theme/ (canonical theme source: getTheme + tokens); src/rag/ (RAG: retrieval + pack logic); src/visualization/ (GL UI: runtime/, scene/, render/, interaction/, materials/, utils/). **visualization/scene/** holds the scene contract (`sceneFormations.ts`), builders (e.g. spine), and art direction. All GL aesthetics live under scene and flow through `visualizationRef.current.scene`. src/utils/ is pure/side-effect isolated utilities. **Runtime ref / viz state validation** lives in visualization/runtime/validateVizState; scene contract validation in visualization/scene/validateSceneSpec. **Scope:** visualization/ and rag/ stay narrow; no analytics, app state, or cross-feature glue in features.

**Agent substructure (src/app/agent/)** — Single lifecycle owner: `useAgentOrchestrator.ts` (orchestrator). It owns top-level lifecycle, mode, error, and audio-state truth; it decides meaning and commits from coordinator/runner results. **Play/Act** (derived interaction-phase grammar, consumed by presentation only) is specified in [docs/PLAY_ACT_CONTRACT.md](PLAY_ACT_CONTRACT.md), [docs/PLAY_ACT_REALIZATION.md](PLAY_ACT_REALIZATION.md), and consumer hardening in [docs/PLAY_ACT_BOUNDARIES.md](PLAY_ACT_BOUNDARIES.md); it must not duplicate orchestrator lifecycle or surface arbitration. **Act descriptor** (rich declarative scene/pathway projection) is specified in [docs/ACT_DESCRIPTOR_SPEC.md](ACT_DESCRIPTOR_SPEC.md); `resolveActDescriptor(SemanticEvidence)` in `src/app/agent/resolveActDescriptor.ts` is pure read-only and must not be used for orchestrator or surface control decisions. **orchestrator/** — telemetry and orchestrator-adjacent semantics/helpers (including transcript settlement coordination and runtime model-path resolution). **av/** — AV mechanism only: `avSurface` (capture/playback route mechanics), `sessionCoordinator` (native start/stop guards, iOS grace), `voiceNative` (invokeVoiceStop, getVoiceNative, guards), `remoteStt`; they do not own lifecycle or app-level state. AV emits typed mechanical facts (including session, playback, capture/STT outcomes, and bookkeeping such as listen-path and pending-capture staging) via `emitAvFact`; orchestrator commits through a single semantic ingress `applyAvFact` (private helpers allowed for readability only). **Narrow imperative adapters** at the AV seam remain for native I/O (`Voice.start`, `beginCapture`, etc.) and structured logging—these are not semantic callbacks. **Native mic plugins** (when used) emit **session/hardware facts** into this AV mechanism layer per [docs/NATIVE_MIC_CONTRACT.md](docs/NATIVE_MIC_CONTRACT.md) and do **not** own app lifecycle; orchestrator remains the semantic owner. **request/** — executeRequest (callback-driven runner; returns result for orchestrator to commit; no direct mutation of orchestrator state). **debug/** — observational only (request debug types, VizDebugPanel, etc.). Orchestrator = semantic owner; AV/request = mechanism owners; debug = observational.

**The only two rules** — (1) Screens don't do IO; screens call hooks, hooks call services. Hooks may orchestrate state and call services, but should not contain raw NativeModules or fetch logic directly. (2) Shared UI belongs in `src/components/`; feature-local UI stays in feature folders (rag/visualization/screens). **Hard constraint:** No new top-level folders under src without updating ARCHITECTURE.md (prevents infra/, core/, lib/, runtime/, manager/ sprawl). **App.tsx** must stay a thin shell.

**services/ vs helpers/ (in rag/visualization)** — services/ = IO or talking to the outside world. helpers/ = pure functions only; no side effects.

**Quick placement guide** — New RAG logic/runtime → `src/rag/` (feature-local modules; avoid creating empty helper/service roots). New GL/visualization code → visualization/runtime/, visualization/scene/, visualization/render/, visualization/interaction/, visualization/materials/. New screen/voice UI → screens/voice/. Debug HUD panels → `src/app/agent/`. Theme values → theme/. Pure utils (no React/theme) → utils/. New reusable UI block → components/.

---

**Repo map** (short)

- **src/app** — app entry + navigation. AgentSurface = composition root; agent/ = AgentOrchestrator (useAgentOrchestrator), VisualizationController (useVisualizationController), ResultsOverlay. See docs/APP_ARCHITECTURE.md. **Normalized UI controls** live in src/app/ui/components/controls/ and remain presentation/composition-only.
- **src/rag/** — RAG feature (`ask.ts`, runtime/context/provider logic, pack IO, types.ts).
- **src/visualization/** — Pure visualization layer (runtime/, scene/, render/, interaction/, materials/, utils/). VisualizationCanvas, VisualizationSurface, VisualizationCanvasR3F, InteractionBand, DevPanel. No app state or theme import; receives injected theme primitives + runtime ref. **GL canvas draw order:** (1) background field, (2) spine light core, (3) spine (base + shards + rot layer), (4) links/glyphs, (5) TouchZones (debug overlay), (6) post FX pass. Runtime ref / viz state validation: visualization/runtime/validateVizState; scene contract: visualization/scene/validateSceneSpec.
- **src/shared/** — platform-agnostic core: `types/`, `native/`, `feedback/`, `config/` (app-wide shared config e.g. endpointConfig).
- **src/theme/** — canonical theme source (`getTheme`, `tokens`).
- **src/screens/** — screen-level view composition (`voice/`).
- **src/components/** — reusable UI blocks (`decon/`).
- **src/utils/** — log. Pure or side-effect isolated; no React/theme imports.

**Two non-negotiables**

- Screens don't do IO (hooks/services do).
- reusable cross-screen UI belongs in components/; feature-specific code stays in feature folders.

---

**These docs (don't contradict)** — README = what the app is and how it works. ARCHITECTURE = where code goes. AGENT_RULES = how to change code without bloat/drift. When you change structure (e.g. rename folders), update ARCHITECTURE first, then README, then AGENT_RULES if needed.
