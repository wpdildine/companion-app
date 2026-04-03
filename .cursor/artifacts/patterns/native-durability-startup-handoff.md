# BOUNDARY ARTIFACT (pattern)

**Seam moved:** Yes — native durability authority for Cycle 1 startup handoff is explicit at `scripts/native-overrides` + apply/regen plumbing, not only in generated trees.

---

# Pattern: native durability authority — startup handoff (BootSplash)

## Authority

- **Durable native customization** for Cycle 1 startup handoff lives in **`scripts/native-overrides/`**, applied by **`scripts/apply-native-overrides.js`** after **`scripts/regen-native.js`** replaces `ios/` and `android/`.
- **Direct edits under `ios/` and `android/` are provisional** unless mirrored into `scripts/native-overrides/`; they will be lost on regen.

## Regen-safe customization (mandatory)

Any behavior-bearing native change for BootSplash or app entry must be:

1. Added or updated under `scripts/native-overrides/`, and  
2. Wired into `overrideFiles()` / `overrideDirs()` in `apply-native-overrides.js` if not already covered.

## Hybrid: generator vs committed snapshot

- **`pnpm run icon:splash`** (react-native-bootsplash CLI) is the authoritative way to **recompute** splash assets from the source icon and `assets/bootsplash/`.
- **Committed snapshots** under `scripts/native-overrides/` are what make **`native:regen` + `apply-native-overrides`** reproduce the same pixels and Xcode/Android wiring **without** running the generator every time.
- After changing the splash source icon or generator options: run `icon:splash`, then **copy the affected outputs** (e.g. `BootSplash.storyboard`, `Colors.xcassets`, `Images.xcassets/BootSplashLogo-*`, `android/.../drawable-*dpi/bootsplash_logo.png`, and any generator-patched plist/manifest if not solely override-owned) into `scripts/native-overrides/` so durability stays singular.

## JS seam (unchanged)

- `src/app/App.tsx` + `BootHandoffSurface.tsx` remain the React handoff owner; this artifact addresses **native** durability only.

## Closure criterion

Regen is safe for handoff behavior when: **no unique BootSplash / entry customization exists only under generated `ios/` or `android/`** — all such truth is in overrides + apply script.
