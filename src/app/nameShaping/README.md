# Name Shaping Layout

This folder is organized by subsystem role rather than by file type.

## Subfolders

- `foundation/`
  - Canonical shared vocabulary and pure transforms.
  - Keep this layer free of UI, pack bootstrap, resolver side effects, and touch ownership.
  - Examples: selectors, shared types, card-name signature generation, token normalization.

- `layout/`
  - Geometry, routing, and interpretation for the Name Shaping touch grammar.
  - This layer maps the shared spine touch surface into Name Shaping regions, but it does not own native touch itself.
  - Examples: touch layout, NDC region interpretation, layout transforms, interaction routing.

- `resolver/`
  - In-memory proper-name lookup and deterministic scoring.
  - This layer should stay independent from UI surfaces and should not pull in full RAG startup.
  - Examples: resolver index build, candidate scoring/ranking.

- `runtime/`
  - Feature-local state and runtime hooks that wire the subsystem together.
  - This is where explicit commit flow, resolver synchronization, and capture hooks live.
  - Examples: `useNameShapingState`, `useNameShapingController`, `useSpineNameShapingCapture`.

- `ui/`
  - Debug and prototype-facing Name Shaping surfaces.
  - These are preserved for inspection and future work, but they are not the canonical source of subsystem truth.
  - Examples: debug overlay, on-surface touch guide.

## Import guidance

- Prefer importing shared public APIs from [`index.ts`](./index.ts) when you are outside this folder.
- Inside this folder, import directly from the relevant subfolder so dependencies stay obvious.
- Do not move touch ownership into this folder. `InteractionBand` remains the single native touch owner in `src/visualization/interaction/`.

## Paused status

Name Shaping is currently paused after prototype/refactor work.

- Preserve the canonical foundation.
- Preserve the current explicit-commit runtime path.
- Treat debug surfaces and commit tracing as experimental scaffolding.
- Re-profile Android resolver cost before resuming richer live interaction work.
