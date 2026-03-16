---
name: ''
overview: ''
todos: []
isProject: false
---

# ATLAS 01 Control Normalization Plan v0

## 1. Purpose

**What this plan is for:**

- Normalizing the UI control and menu language for ATLAS 01 so that repeated patterns (close buttons, one-shot actions, reveal chips, panel chrome, debug rows) collapse into a small, consistent set of semantic controls.
- Keeping product UI and debug UI distinguishable while sharing the same control families where appropriate.
- Supporting future data-driven styling and skins by keeping semantic role separate from visual identity.
- Providing a control gallery and composition sandbox in Storybook without changing runtime behavior.
- Aligning the control layer with the **existing** app structure under `src/app/ui/components/` (controls/, overlays/, panels/, content/).

**What this plan is not for:**

- Introducing a new generic shared design system or a second UI center (e.g. under `src/components/`).
- Owning or interpreting lifecycle, session, request, or playback state.
- Changing InteractionBand semantics or creating a second semantic touch owner.
- Building a universal menu manager or global controller.
- Defining orchestrator behavior or runtime semantics in Storybook.

---

## 2. Ownership boundaries

The control layer has strict boundaries. It must remain:

- **Presentation/composition-only** — Controls render and compose; they do not originate or hold app-level truth.
- **No runtime truth** — No lifecycle, session, request, or playback state. No inference of runtime semantics from UI state.
- **No orchestrator semantics** — useAgentOrchestrator remains the single source of truth for durable runtime semantics; the control layer does not duplicate or replace that.
- **No InteractionBand ownership** — Controls do not define or change hold-to-speak, cluster release, or touch arbitration. No second touch owner.
- **No new runtime state machine** — No control-driven session, request, or playback state machine.
- **No reinterpretation of runtime semantics in UI** — Render/visualization layers remain observational; controls do not invent failure, lifecycle, or request meaning.

These boundaries are non-negotiable. When in doubt, the owning layer is the orchestrator or the band; the control layer only forwards callbacks and consumes appearance data.

---

## 3. File and folder alignment

All file and folder references in this plan align with the **real ATLAS repo structure**. Do not place normalized controls elsewhere.

**Control layer (normalized semantic UI controls):**

- `**src/app/ui/components/controls/` — All normalized control primitives live here.
  - First-wave files: PanelHeaderAction.tsx, Button.tsx, RevealChip.tsx, index.ts
  - Second-wave candidates (same folder when added): ToggleButton.tsx, ControlRow.tsx, MenuSection.tsx

**Existing structure to keep:**

- `**src/app/ui/components/overlays/`* — Overlay containers (e.g. ResultsOverlay). No change to ownership; overlay content may *use controls from controls/.
- `**src/app/ui/components/panels/`* — Panel containers (ContentPanel, debug panels). No change to ownership; panels may *use controls from controls/.
- `**src/app/ui/components/content/`* — Result content sections (e.g. card references, rules). No change; content may *use controls where appropriate.

**Explicitly removed / never introduced:**

- Do not introduce a `src/components/prefabs/` layer.
- Do not introduce a new generic shared UI root or a second UI center.
- Do not introduce a molecules layer or a second abstraction tier for this pass.
- Do not route primary imports through a generic `src/components/` index.
- Keep normalized controls under `src/app/ui/components/controls/`.
- Keep overlays, panels, and content in their existing aligned locations.
- Treat the control layer as presentation/composition-only, not as a runtime or semantic ownership layer.

**Docs:** Update ARCHITECTURE (and optionally add `docs/CONTROL_NORMALIZATION_PLAN.md`) to state: **The normalized control layer lives in src/app/ui/components/controls/ and remains presentation/composition-only.**

---

## 4. Skinability / data-driven appearance

Visual treatment must stay data-driven and skin/theme resolvable so that future skins can restyle the same semantic controls without changing control semantics.

**Rules:**

- **Controls own semantic role and structure, not final visual identity.** They define _what_ the control is (e.g. close action, one-shot button, reveal chip) and how it behaves; they do not bake in "what it looks like" as the long-term architecture.
- **Visual treatment should be data-driven and theme/skin resolvable.** Colors, spacing, typography, and borders should come from theme/skin tokens or appearance maps (e.g. `src/app/ui/theme/`), not from hardcoded values inside the control component.
- **Semantic variants must remain separate from appearance resolution.** A control exposes semantic props (e.g. `tone="quiet"`, `kind="close"`); the theme/skin layer maps those to concrete styles. Do not confuse "what quiet means" with "what quiet looks like in Skin A."
- **Avoid long-term reliance on raw style props** (ink, mutedInk, borderColor, pressedBorderColor, quietTextColor, etc.) as the primary architecture. That becomes prop soup and blocks multi-skin support. Prefer semantic variants plus theme/skin resolution.
- **Product vs debug visual difference** should come from **variant + theme/skin resolution**, not from duplicated styling logic or separate "debug-only" components. Same control family, different variant and skin.

**Contract:** Controls expose semantic variants; the theme layer (tokens, control appearance maps, later skin resolvers) supplies data-driven appearance. The plan does not require a full skin system in the first wave, but the separation must be preserved so multiple skins are possible later.

---

## 5. Prefab families

The following families are in scope. **Only the first three are in the first-wave implementation.** The rest are second-wave candidates.

| Family                  | Role                                                                                 | First wave?                                           |
| ----------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| **PanelHeaderAction**   | Low-weight panel chrome action (close, dismiss, collapse, secondary).                | Yes                                                   |
| **Button**              | Stateless one-shot action only. Not for toggles, selectors, or persistent state.     | Yes                                                   |
| **RevealChip**          | Small disclosure chip for revealing a content block (Answer, Cards, Rules, Sources). | Yes                                                   |
| **ToggleButton**        | Persistent local binary state (e.g. enable/disable mode, debug toggles).             | No — second wave                                      |
| **ControlRow**          | Structural row: left label, right slot only (see narrow definition below).           | No — second wave                                      |
| **MenuSection**         | Section shell for grouping related controls (e.g. debug sections).                   | No — second wave                                      |
| **FloatingActionGroup** | Sparse corner-docked utility actions (1–3).                                          | Optional; not in first or second wave until justified |

**Button rule:** Button is for stateless one-shot actions only. Do not use Button for toggles, selectors, or persistent state.

**ControlRow (narrow definition, for when it is added):**

- **Left label, right slot** — Structural row only. No multi-slots, no menu semantics by default.
- **No full-row press by default** — Do not add optional row tap until real migrations prove the need.
- **No disclosure semantics by default** — Not a disclosure row, menu item, or action row by default; only grow if needed.
- **No hidden ownership beyond local presentation** — Composition shell only; semantics remain in child control or parent callback.

ControlRow is the highest-risk area for over-generalization; keep it narrow and only grow it when migrations justify it.

---

## 6. Menu and container normalization (contract level only)

This plan is not only a button/control plan; it also acknowledges **menu and container normalization** at the contract/planning level. The following concepts are normalized _conceptually_ so that future implementation can align to them. **Do not overbuild a universal menu manager. Do not introduce a global controller.** Keep this at the contract level only.

**Normalized menu/container concepts:**

- **Action menu** — List of one-shot actions (e.g. panel actions). Owner: panel or overlay. Presentation: list or compact row.
- **Context menu** — Short list of actions tied to a context (e.g. card, rule). Owner: overlay or panel. Presentation: popover or inline.
- **Selection menu** — User picks one or more options. Owner: panel or overlay. Presentation: list, chips, or radio group.
- **Debug menu** — Developer-only controls (e.g. Viz debug, telemetry). Owner: debug panel. Presentation: sections + control rows. Must stay visually/structurally distinct from product UI.
- **Overflow menu** — Secondary actions behind a trigger (e.g. "more"). Owner: panel or overlay. Presentation: popover or dropdown.
- **Inspector panel** — Read-only or low-edit detail view (e.g. telemetry, card detail). Owner: panel. Presentation: scrollable content + optional header actions.

**Common contract notions (lightweight):**

- **Menu kind** — Which of the above (or equivalent) applies.
- **Owner level** — What owns the menu’s visibility and lifecycle (panel, overlay, debug surface).
- **Presentation mode** — How it is shown (inline, popover, full panel, etc.).
- **Common state shape** — Open/closed, selected index, etc., as local UI state only; no runtime/session ownership.

No implementation of a global menu controller or universal menu manager is required by this plan. Implementation stays in existing panels/overlays and uses controls from `controls/`.

---

## 7. First-wave implementation scope

The first practical execution slice is **small and safe**. Do not attempt all prefab families at once.

**Implement (in this order):**

1. **PanelHeaderAction**
2. **Button**
3. **RevealChip**

**Storybook (first wave only):**

- Stories for: Button, PanelHeaderAction, RevealChip.
- One panel-header composition (title + PanelHeaderAction close).
- One reveal-chip row composition (Answer, Cards, Rules, Sources).

That is enough for now. **Resist adding more stories until the first migrations are done.**

**Migrate:**

- **Obvious close buttons** — VizDebugPanel, PipelineTelemetryPanel, DevPanel: replace raw Pressable + "Close" with PanelHeaderAction (e.g. variant="close"), preserving existing layout.
- **Reveal chips** — ResultsOverlay: replace inline Pressable + revealChip styles with RevealChip (Answer, Cards, Rules, Sources); keep reveal state and logic in ResultsOverlay.
- **Obvious one-shot actions** — Only replace **truly obvious** stateless one-shot pressables with Button. Button is for one-shot actions only; do not use for toggles, selectors, or persistent state. Do not replace mode selectors, menu rows, or weird debug cycles. When in doubt, leave the existing control in place until the pattern is clearly a single action.

**Then reassess** before starting the second wave. Do not introduce ToggleButton, ControlRow, or MenuSection in the first wave.

---

## 8. Second-wave candidates

Only after the first-wave migrations are stable and the team has reassessed. **Keep MenuSection mentally deprioritized** relative to ToggleButton and ControlRow; the likely sequence is (1) ToggleButton, (2) ControlRow, (3) maybe MenuSection — unless real grouped sections prove themselves immediately.

- **ToggleButton** — When a clear need appears from debug panels or feature toggles. Likely first in second wave.
- **ControlRow** — When labeled rows (label + trailing slot) are clearly repeated and the narrow definition is sufficient. Do not broaden it (no full-row press, no disclosure semantics) until migrations prove the need. Likely second in second wave.
- **MenuSection** — When grouped control sections (e.g. debug sections) are clearly repeated. Maybe third; only add if grouped sections prove themselves.
- **ContentPanel header slot** — Optional. Add only if a concrete use case appears (e.g. explicit close/dismiss in panel chrome). **Keep explicitly deferred**; do not touch ContentPanel in the first wave.

FloatingActionGroup remains out of scope until floating utility patterns and interaction-field collision are explicitly addressed.

---

## 9. Hard warnings

- **No second touch owner** — Controls forward callbacks only; they do not capture or own touch semantics. InteractionBand and AgentSurface own touch arbitration.
- **No dense controls in the protected interaction field** — Do not place dense or competing controls in the core interaction context (interaction band). Normalized controls are used in panel, overlay, floating utility, or debug contexts only.
- **No lifecycle/request/playback inference from control state** — Do not infer orchestrator or runtime state from UI state. The control layer is presentation/composition-only.
- **Button is stateless one-shot only** — Do not use Button for toggles, selectors, or persistent state.
- **No early over-generalization** — First wave is three families only. Do not turn ControlRow into a catch-all (menu item, data row, toggle row, disclosure row) in one go.
- **No prop soup for styling** — Do not accumulate raw style props (ink, mutedInk, borderColor, etc.) as the long-term pattern. Prefer semantic variants and theme/skin resolution.
- **No new shared top-level UI architecture** — Do not create `src/components/prefabs/` or a generic shared UI root. The control layer lives under `src/app/ui/components/controls/` only.
- **Storybook is not a second app** — Control gallery and composition sandbox only. No orchestrator behavior, no runtime semantics harness, no lifecycle/request/playback in stories.

---

## 10. Success criteria

The revised plan is successful when:

- **Structure** — All normalized control code lives under `src/app/ui/components/controls/`. No second UI center. No molecules. No `src/components/prefabs/` or generic shared UI root.
- **First wave** — PanelHeaderAction, Button, and RevealChip are implemented and used for close buttons, reveal chips, and obvious one-shot actions. Storybook has the five minimal stories (Button, PanelHeaderAction, RevealChip, panel-header composition, reveal-chip row).
- **Ownership** — The control layer remains presentation/composition-only; no runtime truth, no second touch owner, no InteractionBand ownership.
- **Skinability** — Semantic role and visual identity are separated; controls consume theme/skin-driven appearance (or tokens/variant maps); no long-term reliance on raw style prop soup.
- **ContentPanel** — Untouched in the first wave; ContentPanel header integration remains optional and deferred.
- **Reassessment** — After the first wave, the team can decide whether ToggleButton, ControlRow, and MenuSection belong in a second wave and in what form.

---

## Change summary

The following was corrected or added from the previous version of the plan:

1. **Plan title and naming** — Renamed from "Prefab Plan" / "UI Prefab and Menu Normalization Plan" to **ATLAS 01 Control Normalization Plan v0**. Standard vocabulary: control layer, control families, control normalization, control primitives; presentation/composition-only; no runtime truth, no second touch owner, no InteractionBand ownership, no orchestrator semantics; semantic variants, theme/skin resolution, data-driven appearance. Avoids "prefab architecture" ontology.
2. **Control layer location** — All references state that the normalized control layer lives **only** in `src/app/ui/components/controls/`. No `src/components/prefabs/`, no generic shared UI root. Aligned with existing repo structure (controls/, overlays/, panels/, content/).
3. **Molecules** — Removed all "molecules" language and assumptions. No second abstraction tier. No molecules layer proposed or preserved.
4. **Ownership boundaries** — Section 2 explicitly restates: presentation/composition-only, no runtime truth, no orchestrator semantics, no InteractionBand ownership, no second touch owner, no new runtime state machine.
5. **File/folder alignment** — Section 3: control layer under controls/; existing overlays/, panels/, content/ kept. "Explicitly removed / never introduced" rewritten per plan: no prefabs layer, no generic shared UI root, no molecules, no generic src/components/ import path; keep controls under controls/; treat control layer as presentation/composition-only. **Docs sentence:** "The normalized control layer lives in src/app/ui/components/controls/ and remains presentation/composition-only."
6. **Skinability** — Section 4: controls own semantic role not final visual identity; visual treatment data-driven and theme/skin resolvable; semantic variants separate from appearance resolution; avoid raw style props; product/debug via variant + theme/skin resolution.
7. **Control families** — Section 5: only PanelHeaderAction, Button, RevealChip in first wave; ToggleButton, ControlRow, MenuSection second-wave candidates; ControlRow narrow (left label, right slot; no full-row press, no disclosure semantics, no hidden ownership).
8. **Menu/container normalization** — Section 6 at contract level only: action, context, selection, debug, overflow, inspector; no universal menu manager, no global controller.
9. **First-wave scope** — Section 7: implement PanelHeaderAction, Button, RevealChip; Storybook minimal (five stories); migrate close buttons, reveal chips, obvious one-shot actions only; reassess before second wave.
10. **Second-wave candidates** — Section 8: ToggleButton, ControlRow, maybe MenuSection (deprioritized), optional ContentPanel header slot; ContentPanel deferred.
11. **Hard warnings** — No second touch owner, no dense controls in protected field, no lifecycle/request/playback inference, no over-generalization, no prop soup, no new shared UI root, Storybook as control gallery/composition sandbox only.
12. **Success criteria** — Section 10: structure, first wave, ownership, skinability, ContentPanel deferred, reassessment.
13. **Storybook** — Control gallery and composition sandbox; not a second app or runtime semantics harness.
14. **Language** — Plan reads as belonging to the current ATLAS repo and architecture; no generic design-system or prefab ontology.
