# Shared Core

`src/shared` is for platform-agnostic, cross-feature core modules only.

## Allowed

- `types/` — cross-feature contracts and shared type surfaces.
- `native/` — app-wide native integration helpers used by multiple features.

## Not allowed

- Screen/view components (use `src/screens` or `src/components`).
- Feature-specific logic that belongs in `src/rag` or `src/visualization`.
- One-off helpers used by a single feature.

## Compatibility paths

- `src/ui/*` is a compatibility facade for legacy imports.
