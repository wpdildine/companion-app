# Touch-to-Selector Capture for NameShaping (Executable 6)

## Context

- **State owner:** [useNameShapingState.ts](src/app/nameShaping/useNameShapingState.ts) already exposes `setActiveSelector`, `appendEmittedToken`, and `commitBreak`. No new state; only new input path.
- **Touch ownership:** [InteractionBand.tsx](src/visualization/interaction/InteractionBand.tsx) is the single owner of the spine-adjacent band: it computes NDC via `toNdc(locationX, locationY)` and drives `touchField*` and zone semantics. NameShaping capture must run as an optional path on the same touch events and same NDC—no parallel touch system.
- **Vocabulary:** Use existing [nameShapingConstants.ts](src/app/nameShaping/nameShapingConstants.ts) (`NameShapingSelector`, `SELECTOR_ORDER`) and [nameShapingTypes.ts](src/app/nameShaping/nameShapingTypes.ts) (`NameShapingRawToken`).

---

## Resolved: Interaction coexistence when NameShaping is enabled

**Choice: Debug capture priority mode (Option 2).**

When NameShaping debug capture is enabled (i.e. `nameShapingCapture` is provided and NameShaping is enabled), the band **temporarily suppresses** normal semantic band actions:

- **Suppress:** Center hold-to-speak (no `onCenterHoldStart` / `onCenterHoldEnd`).
- **Suppress:** Cluster release on touch end (no `onClusterRelease` / `onClusterTap` for rules/cards).

Touch field updates (touchFieldActive, touchFieldNdc, touchFieldStrength, zoneArmed) may still run so the organism/repulsor continues to respond to touch if desired, but **semantic commit paths** (hold-to-speak, rules/cards release) do not run. This allows physical-device testing of selector capture without accidentally triggering speak or swipe behavior.

**Implementation:** In InteractionBand, when `nameShapingCapture` is present and the app has indicated NameShaping capture is active (e.g. via the same prop or a separate `nameShapingCaptureActive?: boolean`), do not start the center-hold timer and do not invoke `onCenterHoldStart`/`onCenterHoldEnd` or `onClusterRelease`/`onClusterTap`. When NameShaping is disabled, band behavior is unchanged (no suppression).

---

## Resolved: Emit token on touch start

**Final call: v1 emits once on touch start, then only on later region changes.** Not transition-only.

- **onTouchStart(ndc):** Resolve selector. Set `activeSelector`. **Append one token** for that selector so a touch that starts and stays in one region still produces exactly one raw sequence entry. Store selector in `lastSelectorRef`.
- **onTouchMove(ndc):** Resolve selector. If selector differs from `lastSelectorRef`, append token, set activeSelector, update ref. Same region = no extra emission.
- **onTouchEnd / onTouchCancel:** Clear activeSelector and touch-local ref.

Rationale: for physical-device validation, emit-on-start makes the capture path immediately observable; “hold in one region” must not yield an empty raw sequence.

---

## Resolved: BREAK as touchable region

**Intentional for this phase.** The six equal NDC bands map to all six selectors including BREAK. BREAK is a real touchable region in debug capture so that the full vocabulary can be exercised on device. Document in `nameShapingTouchRegions.ts` and in NAME_SHAPING.md that BREAK-as-touch-region is for debug capture only; the abstract model’s “BREAK as structural separator” is unchanged.

---

## 1. Define debug-first selector region map

**New file:** [src/app/nameShaping/nameShapingTouchRegions.ts](src/app/nameShaping/nameShapingTouchRegions.ts)

- **Single export:** `getSelectorFromNdc(ndcX: number, ndcY: number): NameShapingSelector | null`.
- **Mapping:** Divide NDC X into 6 equal bands in `[-1, 1]`, left-to-right = SELECTOR_ORDER (BRIGHT, ROUND, LIQUID, SOFT, HARD, BREAK). Explicit boundaries; return `null` only if out of range.
- **Document:** Comment that this is the debug-first physical region map; BREAK is touchable here for debug capture.
- **Test:** Unit tests for boundaries, each selector, and null when applicable.

---

## 2. Capture hook: map touch lifecycle to state updates

**New file:** [src/app/nameShaping/useSpineNameShapingCapture.ts](src/app/nameShaping/useSpineNameShapingCapture.ts)

- **Signature:** `useSpineNameShapingCapture(enabled: boolean, actions: NameShapingActions)`.
- **Returns:** `{ capture: NameShapingCaptureHandlers }` with `onTouchStart(ndc)`, `onTouchMove(ndc)`, `onTouchEnd()`, `onTouchCancel()`.
- **When disabled:** All handlers no-op.
- **When enabled:** As in “Resolved” sections above: start = set activeSelector + append one token; move = append only on region change; end/cancel = clear activeSelector.
- **Logging:** Optional `logInfo('NameShapingCapture', …)` on selector change or token emit for device inspectability.

---

## 3. Integrate capture into InteractionBand + priority mode

**File:** [src/visualization/interaction/InteractionBand.tsx](src/visualization/interaction/InteractionBand.tsx)

- **New optional prop:** `nameShapingCapture?: { onTouchStart(ndc), onTouchMove(ndc), onTouchEnd(), onTouchCancel() }` (and a way to know capture is “active” for this gesture, e.g. same object or a separate `nameShapingCaptureActive?: boolean` from the app).
- **Callbacks:** In existing touch handlers, after computing ndc and updating touch field/zone, if `nameShapingCapture` is present, call the corresponding capture handler(s).
- **Priority mode:** When NameShaping capture is active (e.g. `nameShapingCapture` is provided and the app passes an “active” signal):
  - Do **not** start the center-hold timer; do **not** call `onCenterHoldStart` / `onCenterHoldEnd`.
  - On touch end, do **not** call `onClusterRelease` / `onClusterTap` (no rules/cards semantic commit).
- Touch field (touchFieldActive, touchFieldNdc, touchFieldStrength, zoneArmed) can still be updated so viz response is unchanged, unless you prefer to suppress that too for maximum isolation; the plan leaves that as an implementation detail (suppress semantics only is the minimum).

---

## 4. Wire NameShaping state and capture in AgentSurface

**File:** [src/app/AgentSurface.tsx](src/app/AgentSurface.tsx)

- Call `useNameShapingState()` and `useSpineNameShapingCapture(nameShapingState.enabled, nameShapingActions)`.
- Pass to Band: `nameShapingCapture={nameShapingState.enabled ? capture.capture : undefined}` and, if needed, a clear “capture active” signal so Band can apply priority mode (e.g. “when nameShapingCapture is non-undefined, treat as active”).
- Add minimal debug affordance to enable NameShaping for testing (constant or Viz panel toggle).

---

## 5. Barrel and docs

- **Barrel:** Export `getSelectorFromNdc` and `useSpineNameShapingCapture` from [src/app/nameShaping/index.ts](src/app/nameShaping/index.ts).
- **Docs:** Update [docs/NAME_SHAPING.md](docs/NAME_SHAPING.md): touch-to-selector capture (Executable 6), region map, capture hook, priority mode when enabled, and BREAK as intentional touchable region for debug.

---

## Smaller notes

- **Enabled gating:** Passing `undefined` to the band when disabled and making the hook handlers no-op is slightly redundant but harmless and defensively clean.
- **Six equal NDC bands:** Kept as the first pass. They are explicit, deterministic, and easy to reason about—what this executable should optimize for.

---

## Out of scope (unchanged)

Resolver scoring, candidate ranking, overlay, normalization, DB, pack, resolver index, agent orchestration, visualization signal ownership, production polish, haptics/audio.

---

## Acceptance criteria

| Criterion | How |
|-----------|-----|
| With NameShaping enabled, drag updates activeSelector and emits raw sequence | Capture hook + region map + Band callbacks; emit on start + on region change |
| With NameShaping disabled, no capture or state updates | No-op handlers; Band gets undefined capture |
| When NameShaping capture enabled, no hold-to-speak or cluster release | Band priority mode: suppress center hold and cluster release |
| Existing interactions intact when disabled | No suppression when capture not active |
| Region-to-selector stable for device testing | Six equal NDC X bands + tests |
| Inspectable | Optional logging |
| No resolver/DB/pack/orchestration | Only nameShaping + Band + AgentSurface |

---

## Testing

- **Unit:** `nameShapingTouchRegions` — position-to-selector and null.
- **Unit:** Capture hook — disabled no-op; emit on start; emit on move only when region changes; clear on end/cancel.
- **Manual:** Enable NameShaping; drag on band → selector + sequence visible, no speak/swipe. Disable → normal hold/swipe/tap unchanged.
