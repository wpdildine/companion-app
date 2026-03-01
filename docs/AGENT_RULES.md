# AI Agent Rules

Drop-in doc for Cursor/Copilot. Goal: keep code small, reusable, non-duplicative; prefer improving existing code over adding parallel paths.

**1) Prime directive** — Do not add new code until you have searched for an existing place. Before implementing: locate closest existing module; reuse existing types/utilities; avoid new helper unless truly new and general.

**Prefer modifying over new files** — When changing behavior, prefer modifying existing functions over adding new files. New files require a justification in the PR/notes. This stops "new file reflex."

**Before creating a new file, search for (procedural):** similar file names; similar exported functions; similar types; similar comments. If similar logic exists, extend or merge instead of duplicating. Make this explicit so the agent follows it every time.

**2) Navigation rules** — Use the repo Architecture Map (README / docs/ARCHITECTURE.md) as first reference. Feature-specific work stays in rag/ or nodeMap/; reusable UI in ui/; theme in theme/; pure utils in utils/; reusable work goes in shared/. If unsure: default to the relevant feature folder (rag/ or nodeMap/); only move to shared/ after a real second use. **Hard constraint:** No new top-level folders under src without updating ARCHITECTURE.md (allow-list: app, rag, nodeMap, shared, theme, ui, utils). (Prevents accidental infra/, core/, lib/, engine/, manager/ sprawl.)

**3) Anti-bloat** — Prefer files under ~200 lines, functions under ~60; split by responsibility. No duplicate "almost-the-same" helpers: merge or add option/parameter; never formatThing(), formatThing2(), normalizeX() in 3 places. helpers/ is not a dumping ground: only if used by multiple files or a clearly named transformation; if used once, keep local.

**4) Reuse-first workflow** — When adding behavior: (1) search for same concept (names, types, comments, call sites), (2) if found extend existing, (3) if not implement in obvious module, (4) extract shared helper only after usage proves it.

**5) No silent coercion / no rounding / no auto-fallbacks** — Do not change semantics quietly: no silent coercing null→empty string, rounding "because nicer," trimming/fixups that hide errors, no automatic fallbacks that hide failures. Allowed: explicit documented normalization, explicit sentinels, structured errors. If behavior changes, be explicit and test-covered.

**6) Contracts over guesses** — Prefer typed I/O, explicit enums/discriminated unions, structured errors. Represent missing as null/undefined/Option, explicit status/sentinels (documented). Never hide missingness.

**7) Patterns** — Screens/components thin: wire hooks to views; no business logic or IO in screens. One "brain" per unit (one hook per screen/flow for state, transitions, services). IO behind services/; UI does not call IO directly. Hooks orchestrate state and call services; they must not contain raw NativeModules or fetch logic.

**8) Tests** — When changing semantics: update or add tests; prefer small targeted tests; keep regression suites passing.

**9) Output** — Minimal scoped changes; no reformatting unrelated code; no rename of public APIs unless necessary; small reviewable diffs.

**10) PR checklist** — No duplicated helpers; new files have justification in PR/notes; architecture map still makes sense; behavior changes have tests; no silent smoothing; code stays compact. If unsure, request clarification; do not invent new abstraction.

**Where to put it:** `docs/AGENT_RULES.md`. In README near top: "AI agents must follow: docs/AGENT_RULES.md". If Cursor supports Project Instructions, paste Prime directive + Anti-bloat + No smoothing sections verbatim.
