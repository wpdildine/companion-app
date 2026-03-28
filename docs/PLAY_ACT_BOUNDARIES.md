# Play/Act Cycle 7 — hardening and expansion boundaries

Canonical **policy** for the shipped Play/Act Stage 1 consumer and **future** Play/Act adoption. **Authority:** [docs/PLAY_ACT_CONTRACT.md](PLAY_ACT_CONTRACT.md), [docs/PLAY_ACT_REALIZATION.md](PLAY_ACT_REALIZATION.md), [docs/APP_ARCHITECTURE.md](APP_ARCHITECTURE.md), [docs/INTERACTION_CONTRACT.md](INTERACTION_CONTRACT.md), [docs/ARCHITECTURE.md](ARCHITECTURE.md).

This document does **not** change the Play/Act contract or resolver semantics; it **hardens** interpretation-only consumption and **bounds** expansion so Play/Act cannot drift into a second control path.

---

## Non-negotiable constraints

- **AgentOrchestrator** remains sole owner of lifecycle, request pipeline, `responseText` commit/clear, and hard-error semantics.
- **AgentSurface** remains sole owner of touch arbitration and semantic hold accept/reject.
- **VisualizationController** remains sole owner of orchestrator → GL signals; no Act-driven visualization.
- **ResultsOverlay** remains sole owner of reveal/dismiss/layout and grounded structure.
- **Play/Act** remains a pure derived classifier + hints; consumption is **presentation interpretation only**—no gating, no mutation, no durable Act state.
- **Hard error** UX remains `lifecycle === 'error'` (and orchestrator error payload), **not** `primaryAct` (see [PLAY_ACT_REALIZATION.md](PLAY_ACT_REALIZATION.md)).
- **Shipped Stage 1:** semantic channel consumes Play/Act via `playActPhaseCopy` string mappers for accessibility; `affordanceHints` and `processingSubstate` are **not** consumer inputs; visible caption flag defaults **off** (`PLAY_ACT_PHASE_CAPTION_ENABLED` in `AgentSurface`).

---

## Hardening objective

**Hardened** means the shipped slice **reliably** treats orchestrator state (and surface facts **only** as resolver **inputs**) as the source of behavioral truth: accessibility copy **never** contradicts lifecycle/error; **never** implies permission to act (speak, tap, reveal) from Act alone; **never** drives side effects or state writes.

**Mismatches** between what users should infer from orchestrator state and what Play/Act-derived strings suggest are **bugs in the mapping layer or consumer**, fixed by **adjusting copy tables or placement**—**not** by changing lifecycle, arbitration, or resolver policy to “match” UI.

**Respond → Evaluate** remains out of scope unless a future exported orchestrator control contract requires it ([PLAY_ACT_CONTRACT.md](PLAY_ACT_CONTRACT.md)).

---

## Current slice risk review

| Risk | Why it matters | Current vs future |
|------|----------------|-------------------|
| **Accessibility copy drift from truth** | Screen reader users rely on labels; drift erodes trust. | **Current** — mitigate with regression tests on mapping table; orchestrator-first + error override. |
| **Accidental caption expansion into authority** | Visible line could be read as a **gate** or **blocker**. | **Future** while caption is off; **current** if Stage 2 enabled without bounds. |
| **Hidden use of affordanceHints** | Hints become **shadow arbitration**. | **Future** if a consumer imports hints; not in Stage 1 if discipline holds. |
| **Misuse of processingSubstate** | UI branching on substate = **parallel processing FSM**. | **Future** expansion risk; deferred for consumers. |
| **Spread into overlay or shell control logic** | Act in conditionals for reveal, dismiss, scroll lock, band. | **Future** creep; prevent via review and expansion stop rules. |

---

## Stage 2 decision rule (visible caption)

**Enable** the optional visible phase caption only when **all** are true:

1. Product explicitly wants **visible** phase consistency (not only a11y).
2. Caption stays a **single**, **non-interactive** line in the **semantic channel shell** (not overlay chrome that owns panels).
3. **No** branch on `affordanceHints` or `processingSubstate`; copy still from `primaryAct` + `commitVisibilityHint` (+ orchestrator fields for error/speaking), same as Stage 1 mappers.
4. **Hard error:** caption **suppressed**; error UX remains orchestrator/overlay-owned.
5. **Copy review:** strings do not read as instructions for actions the band or overlay may still block (prefer neutral phase labels).

**Keep deferred** when: caption would duplicate or fight overlay status; product cannot commit to neutral wording; or caption visibility would be tied to arbitration outcomes beyond read-only resolver input.

---

## Future consumer boundary rules

| Category | Safety | Play/Act may influence | Play/Act must never influence |
|----------|--------|------------------------|-------------------------------|
| **Semantic-channel shell** | **Safe** (default expansion) | Static / a11y phase labels; optional one-line caption per Stage 2 rule. | Band, submit, reveal/dismiss, scroll policy, GL. |
| **Overlay-adjacent static phrasing** | **Conditionally safe** | A11y or non-layout helper text on **existing** containers; must not change **when** panels open. | Reveal/dismiss state machine, commit/clear, validation outcomes. |
| **Accessibility surfaces** | **Safe** when scoped | Labels, hints, non-gating announcements. | Control enabled/disabled **unless** that state is owned elsewhere and Act is not the source. |
| **AgentSurface (composition only)** | **Conditionally safe** | Passing derived resolution **down** as inert data. | Arbitration, band enablement, or lifecycle **from** Act. |
| **Debug / telemetry** | **Deferred** for Play/Act | Observability may duplicate Act for ops only with separate governance. | User-facing control semantics. |
| **Touch / arbitration / InteractionBand** | **Unsafe** | Nothing. | All gating and hold semantics. |
| **Visualization / controller** | **Unsafe** | Nothing. | `applyVisualizationSignals`, modes, scene. |

---

## Resolver output usage rules (expansion)

| Output | Allowed uses | Forbidden uses | Rollout |
|--------|--------------|----------------|---------|
| **primaryAct** | Phase copy and a11y; mapping tables. | Lifecycle inference without orchestrator cross-check; touch / visualization / overlay **control**. | Allowed in presentation-only waves. |
| **commitVisibilityHint** | Wording aligned with commitment policy for labels. | Showing/hiding panels; hint as **source** of commit truth. | Allowed with `responseText` + lifecycle as backstop. |
| **affordanceHints** | Deferred for UI; future explicit copy-only pass with no enable/disable semantics. | Any `if (hint)` gating interaction, band, or playback. | **Deferred** for consumers. |
| **processingSubstate** | Resolver internal / Evaluate qualifier; optional non-UI logging. | Per-substate UI branches or secondary loading FSMs **owned** by Act. | **Deferred** for consumer-visible use. |

---

## Validation and regression requirements

- **No lifecycle duplication:** Critical paths keyed off `lifecycle` / `error`, not `primaryAct` alone.
- **No arbitration duplication:** Band and hold unchanged by Act consumers.
- **No visualization drift:** No Act under visualization controller ownership.
- **No commit/clear drift:** `responseText` remains orchestrator-driven.
- **Error override preserved:** `lifecycle === 'error'` → a11y copy must not imply voice permission ([PLAY_ACT_REALIZATION.md](PLAY_ACT_REALIZATION.md)).
- **No hidden gating:** Consumers must not import `affordanceHints` until a governed wave.
- **No second UI FSM:** Consumers must not branch visible UI on `processingSubstate`.
- **Mismatch = consumer bug:** Resolver policy changes only when orchestrator contract changes—not to paper over copy drift.

---

## Expansion stop rules

**Pause Play/Act expansion** and run a fresh audit or architecture review when:

- Any consumer uses Act to **gate** touch, playback, or overlay reveal.
- `affordanceHints` or `processingSubstate` appears in presentation conditionals **outside** the resolver.
- Visualization or orchestrator changes are proposed **to match** Act copy (truth flows **to** Act, not from it).
- Multiple surfaces consume Act with **divergent** mapping tables without a **single** maintained policy doc.
- Product asks for narrative / beats / scenes driven by Act (out of model—re-scope).

---

## Deferred surfaces (post–Cycle 7)

- Touch, InteractionBand, hold, arbitration **integration** with Act.
- VisualizationController / GL / `applyVisualizationSignals` consumption of Act.
- Debug/HUD as Play/Act consumers without separate contract.
- Durable Act state, navigation, cross-session Act memory.
- **Respond → Evaluate** or chained-ask UX justified only by Act.
- Global a11y or copy refactors **unrelated** to Play/Act phase labeling.

---

## Implementation-planning readiness

**READY FOR NARROW IMPLEMENTATION PLAN** for either:

- Enabling Stage 2 visible caption under the **Stage 2 decision rule**, or  
- Adding **one** additional **safe** consumer (e.g. bounded overlay a11y) without new resolver outputs.

**Minimal precondition:** PR re-states **output usage rules** and **validation checklist**; tests cover error override and no consumer use of `affordanceHints` until explicitly allowed.

---

## Stop conditions

- **GOVERNANCE CONFLICT:** Would occur only if hardening required changing orchestrator, surface, visualization, or overlay ownership.
- **NOT SAFE TO EXPAND:** Not claimed—safe loci and deferred outputs are explicitly bounded above.
