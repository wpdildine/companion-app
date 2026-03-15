---
name: ""
overview: ""
todos: []
isProject: false
---

# Native-Fast InteractionBand Single-Owner Migration (tightened)

## 1. Owning layer

**Owner:** `src/visualization/interaction/` — InteractionBand is the single interaction owner. InteractionProbe is demoted to optional diagnostics; it must not remain a parallel touch layer.

## 2. Broken invariant (current state)

**Invariant:** One physical touch owner and one semantic touch owner; InteractionBand must be that owner.

**Current violation:** InteractionBand mounts InteractionProbe as a child that uses `GestureDetector` (Pan + Tap). That creates a second touch-capturing layer, leading to split ownership and regressions.

## 3. Old structure

- **InteractionBand:** `View` with responder handlers (`onTouchStart` / `onTouchMove` / `onTouchEnd` / `onTouchCancel`). Uses `layoutRef`, `toNdc`/`toBandNdc`, `setZoneArmedFromNdc`, `clearCenterHoldState`, and a `setTimeout`-based center-hold timer. Writes `touchField` and `zoneArmed` on the visualization ref; invokes `onCenterHoldStart` / `onCenterHoldEnd` and `onClusterRelease` (with `onClusterTap` as deprecated fallback). Renders `InteractionProbe` as a child (stacked touch surface).
- **InteractionProbe:** `GestureDetector` with Pan + Tap; actively captures touches; debug readout only.
- **fastMath.ts:** Worklet-safe helpers used by the probe; band uses `zoneLayout.getZoneFromNdcX` and inline toNdc/toBandNdc.

## 4. New structure

- **InteractionBand:** Single touch surface via GestureDetector + Pan. Pan is the sole physical gesture owner; **do not add a second Tap gesture owner alongside Pan in this pass.** Preserve existing tap-like, hold-like, and release semantics; do not reinterpret the band as drag-only. All semantic work runs in JS via runOnJS (same logic as today). Audit responder-specific assumptions in the existing JS handlers when invoking them from Pan `onStart` / `onUpdate` / `onEnd` / `onFinalize` (timing/ordering may differ from View responder callbacks). Band does not mount a touch-capturing probe; it renders the passive debug overlay internally when `debugInteraction` is true.
- **InteractionProbe:** Passive debug overlay only; receives state from the band; no GestureDetector; `pointerEvents="none"`.
- **fastMath:** Keep scope narrow. **Do not migrate all band math into worklets in this pass;** focus only on single-owner native capture and preserved contract.

## 5. Exact files to change

| File                                                                                                     | Role                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [src/visualization/interaction/InteractionBand.tsx](src/visualization/interaction/InteractionBand.tsx)   | Port native-fast capture (GestureDetector + Pan), keep all semantic logic in JS via runOnJS; render passive probe internally when `debugInteraction` is true.             |
| [src/visualization/interaction/InteractionProbe.tsx](src/visualization/interaction/InteractionProbe.tsx) | Remove GestureDetector and touch handling; convert to passive readout component that receives state via props.                                                            |
| [src/visualization/interaction/fastMath.ts](src/visualization/interaction/fastMath.ts)                   | No behavioral change; keep for tests. Do not broaden into full worklet-side semantic math.                                                                                |
| New or updated tests under `src/visualization/interaction/__tests__/`                                    | Preserve fastMath tests; add focused tests for hold accept/cancel, release→callback, zone resolution; keep contract tests for onClusterRelease and onClusterTap fallback. |

**Out of scope:** `nameShaping/**/`, orchestrator, STT/voice, panel/result UI refactor, visualization runtime semantics beyond interaction plumbing.

## 6. What to port from probe into band

- **Native-fast gesture capture:** Use Pan as the sole owner; replace View responder with a single GestureDetector. Only use manual activation if required to preserve existing hold/cluster semantics. Preserve tap-like (cluster release on end) and hold-like (center hold timer + acceptance/cancellation) semantics; do not treat interaction as drag-only.
- **Event flow:** Pan `onStart` → runOnJS(handleTouchStart)(x, y); `onUpdate` → runOnJS(handleTouchMove)(x, y); `onEnd` → runOnJS(handleTouchEnd)(x, y); `onFinalize` → runOnJS(handleTouchCancel). Audit start/end/finalize ordering vs. responder timing.
- **Coordinate source:** `e.x`, `e.y` from Pan (same as current `locationX`/`locationY`); existing `toNdc`/`toBandNdc` and layout ref in JS handlers stay.
- **Optional:** `hasMovedBeyondThreshold` from fastMath for center-hold cancel; same constant `CENTER_HOLD_MOVE_CANCEL_PX` (12).

## 7. What to remove from old band ownership

- View-level touch handlers on the band’s touch target.
- Stacked probe as touch target: no touch-capturing child; probe is passive and only rendered internally when `debugInteraction` is true.

Do **not** remove: center-hold timer, eligibility (nameShaping), `touchField` / `zoneArmed` writes, `onCenterHoldStart` / `onCenterHoldEnd`, `onClusterRelease`, or `onClusterTap` (deprecated fallback) contract, blocked overlay, enabled/blocked/blockedUntil.

## 8. What remains of probe tooling

- **Passive overlay:** Band renders it internally when `debugInteraction` is true. Band passes current state (ndc, zone, eligible, touchActive) to the overlay; no new app-level debug callback surface. Overlay has `pointerEvents="none"`.

## 9. Tests updated/added

- **Keep:** fastMath.test.ts; spineTouchSurfaceLayout and activeBandEnvelope as-is.
- **Add:** Hold acceptance; hold cancellation; release→semantic callback (onClusterRelease / onClusterTap fallback, onCenterHoldEnd); zone resolution. Call out onClusterTap in contract tests where release semantics are asserted.

## 10. Manual verification checklist

- No stacked touch layers; center hold start/end; no stuck listening; cluster release (and tap fallback); probe diagnostics when debugInteraction; iOS and Android.

## 11. Patch summary

- **InteractionBand:** GestureDetector + Pan only (no separate Tap gesture owner); semantics in JS via runOnJS; Pan preserves tap-like and hold-like semantics; audit responder vs. gesture timing; internal passive overlay when `debugInteraction`.
- **InteractionProbe:** Passive readout only; no gesture-handler.
- **Contract:** `onCenterHoldStart`, `onCenterHoldEnd`, `onClusterRelease`, `onClusterTap` (deprecated) unchanged.
- **Scope:** Single-owner native capture and preserved contract only; no full worklet-side math migration.

## 12. Self-audit

- Only InteractionBand attaches a gesture to the band region.
- No second semantic contract; same callbacks and ordering.
- nameShaping usage unchanged.
- No dependency version changes.
- Passive overlay: band renders internally when debugInteraction is true; no new app callback surface.
- fastMath / worklets: no broadening; migration focused on single-owner native capture.

---

## Anti-wiggle-room (shortest tightening)

- Pan is the sole physical gesture owner; do not add a second Tap gesture owner alongside Pan. Preserve existing tap-like, hold-like, and release semantics; do not reinterpret the band as drag-only.
- Audit responder-specific assumptions in existing JS handlers when invoking them from Pan onStart / onUpdate / onEnd / onFinalize.
- Passive debug: band renders the probe internally when `debugInteraction` is true.
- **Do not broaden** this migration into full worklet-side semantic math; **focus only** on single-owner native capture and preserved contract.
- Contract: call out `onClusterRelease` and `onClusterTap` (deprecated fallback) consistently in structure, tests, and patch summary.
