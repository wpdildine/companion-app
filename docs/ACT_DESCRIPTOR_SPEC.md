# Act Descriptor System (SemanticEvidence-only)

Canonical specification for the **real** Act layer: a declarative, data-driven **Act descriptor** derived as a **pure read model** over **SemanticEvidence**. This is **not** a control plane, **not** lifecycle, **not** arbitration, and **not** a second state machine.

**Implementation:** `resolveActDescriptor` in `src/app/agent/resolveActDescriptor.ts`, types in `src/app/agent/actDescriptorTypes.ts`. **`buildAtlasSemanticChannelDebugSnapshot`** in `src/app/agent/getSemanticEvidence.ts` pairs evidence + Act for tooling.

**Related:** [docs/APP_ARCHITECTURE.md](APP_ARCHITECTURE.md) (ownership), [docs/PLAY_ACT_CONTRACT.md](PLAY_ACT_CONTRACT.md) (legacy Play/Act labels may **project** from this descriptor for copy only—they are not the Act system itself), [src/app/agent/semanticEvidenceTypes.ts](../src/app/agent/semanticEvidenceTypes.ts), [src/app/agent/getSemanticEvidence.ts](../src/app/agent/getSemanticEvidence.ts).

---

## 1. Scope

**In scope:** Act descriptor schema, categories of meaning, resolution from SemanticEvidence, consumer rules, boundaries, validation criteria.

**Out of scope:** Orchestrator control paths, surface arbitration, InteractionBand mechanics, visualization signal writes, UI rollout.

---

## 2. Act definition

An **Act** is a **declarative record** that **describes** the user-visible **semantic situation** at a snapshot: **scene**, **gesture interpretive roles** (not mechanics), **pathways** (capability regions), **continuation** relative to request identity, and **non-authoritative affordances**. An Act **is not** orchestrator **lifecycle**, **is not** **execution**, **is not** **arbitration**. **Act = declarative scene / pathway descriptor** over **SemanticEvidence**.

---

## 3. Act schema (summary)

| Group | Purpose |
|--------|---------|
| **identity** | Situation **family** + schema version (classification from evidence only). |
| **scene** | Coarse flags: capture-oriented, work-in-flight, result-visible, fault-visible. |
| **semanticSituation** | Lifecycle, processing substate, outcome projection, in-flight bucket when outcome is null. |
| **gestureMeanings** | Channel → interpretive role for copy/a11y (intersect with arbitration at consume time). |
| **pathways** | Active pathway tags + optional evidence keys (multi-hot, descriptive only). |
| **continuation** | Mode + optional identity mirror for replacement posture. |
| **affordances** | UX eligibility hints (non-authoritative). |
| **presentationHints** | Optional passthrough from `SemanticEvidence.presentation`. |

No imperative transition graphs, timers, or Act-owned history.

---

## 4. Input mapping from SemanticEvidence

| Evidence slice | Informs |
|----------------|---------|
| **runtime** | Scene timing, pathways (async/TTS), affordances vs lifecycle. |
| **identity** | Continuation, replacement hints. |
| **surface** | Reveal topology, arbitration context for gesture meanings, pathway `reveal_supporting_material`. |
| **interaction.observedEvents** | Outcome projection (via `getOutcomeProjection`); recoverable tail subject to FIFO trim. |
| **presentation** | `presentationHints` only. |
| **outcome** | Settled classes when non-null; **null** during `listening` / `processing`—use **runtime** for those windows. |

---

## 5. Situation families

| Family | Situation |
|--------|-----------|
| **InputOpen** | Primary intake ready when authority allows. |
| **WorkInFlight** | Listening or processing (async work / open mic). |
| **ClarificationPending** | Front-door or policy blocked; supplemental input expected. |
| **RecoverableSetback** | Recoverable failure window. |
| **AnswerActive** | Committed response in focus (may include speaking). |
| **SystemFault** | Terminal / hard error class. |

Families differ by **pathway topology** and **continuation**, not by renaming lifecycle alone.

---

## 6. Gesture semantics

- **Acts** assign **interpretive roles** to **channels** the surface already exposes (`SemanticSurfaceState.activeInteractionOwner`, band enablement).
- **InteractionBand** owns **mechanics**; **AgentSurface** owns **arbitration**. If arbitration denies a channel, **authority wins**; descriptor roles must not imply the channel is live.

---

## 7. Pathways

Pathways are **named capability regions** (tags), not transitions. They **do not** enqueue work or open panels. **Next** is emergent when evidence changes and the descriptor is recomputed.

**Closed tag set** (registry): see `ActPathwayTag` in `actDescriptorTypes.ts`.

---

## 8. Continuation semantics

Derived only from **identity**, **outcome**, and **runtime** fields on SemanticEvidence. Acts **must not invent** request ids or completion.

---

## 9. Consumer rules

**First adopted consumer (Cycle 1):** In `__DEV__` only, `globalThis.__getAtlasSemanticChannelDebugSnapshot` (wired from [AgentSurface.tsx](../src/app/AgentSurface.tsx)) returns `{ semanticEvidence, actDescriptor }` for console inspection. This is **observational**—not the Play/Act **primaryAct** label system; do not treat the bundle as a control surface. `__getAtlasSemanticEvidence` remains raw `SemanticEvidence` for existing debugging.

**Second adopted consumer (Cycle 2):** Supplementary **accessibility hint** on the semantic channel `ScrollView` ([SemanticChannelView.tsx](../src/screens/voice/SemanticChannelView.tsx)), from `getActDescriptorSemanticChannelHint` in [actDescriptorSemanticChannelHint.ts](../src/app/agent/actDescriptorSemanticChannelHint.ts). The Play/Act **accessibility label** and **visible phase caption** stay unchanged. Mapper uses **`identity.family`** and **`semanticSituation.inFlightBucket`** (for `WorkInFlight`) only—no pathways, affordances, or imperatives. **`lifecycle === 'error'`** suppresses the hint so orchestrator error truth matches [playActPhaseCopy.ts](../src/app/agent/playActPhaseCopy.ts). Toggle: `ACT_DESCRIPTOR_SEMANTIC_CHANNEL_HINT_ENABLED` in `AgentSurface.tsx`.

**Stop / audit triggers (expansion):** halt and re-audit if the hint (or any Act copy) starts gating behavior; if pathways or affordances enter strings; if a second product consumer introduces a divergent Act→string policy without a shared core; if Act is pressured to replace orchestrator or surface truth.

| Consumer | Allowed | Forbidden |
|----------|---------|-----------|
| **Dev introspection** | Read full `ActDescriptor` in the debug snapshot; compare to `SemanticEvidence` | Branching app behavior (even in dev) on pathways, affordances, or family |
| **Semantic channel a11y hint** | Neutral situation gloss from `identity.family` (+ `inFlightBucket` for `WorkInFlight`); same `getSemanticEvidence` inputs as the shell | Gating; pathways/affordances in copy; replacing Play/Act label or caption |
| **Orchestrator** | Dev-only parity checks (optional) | Control decisions from Act |
| **AgentSurface** | Optional captions/hints, intersected with arbitration | Arbitration from Act |
| **ResultsOverlay** | Interpretive copy/a11y | Reveal/dismiss authority from Act |
| **Accessibility** | Labels/roles from gesture meanings + scene | Contradicting live focus/controls |
| **Visualization** | Non-authoritative mood (future) | `applyVisualizationSignals` authority |

---

## 10. Non-negotiable boundaries

- Acts do not execute, arbitrate, gate, replace lifecycle/outcome, infer hidden truth, or own gesture mechanics.
- Acts are not a second state machine.

---

## 11. Validation

- **Pure:** same `SemanticEvidence` → same `ActDescriptor`.
- **Not label-only:** pathways, continuation, and gesture meanings populated per taxonomy (see tests).
- **Gesture coherence:** roles align with `activeInteractionOwner` and band enablement; contradictions **downgrade** to `unavailable_for_interpretation`.
- **Pathways are descriptive:** no side effects from resolving or reading pathways.
- **Ownership:** orchestrator/surface must not import Act for **control** decisions.
- **Semantic channel hint:** `lifecycle === 'error'` ⇒ no hint; hint strings stay non-imperative (see `actDescriptorSemanticChannelHint.test.ts`).

---

## 12. Status

**IMPLEMENTED** — schema, resolver, **dev snapshot** consumer, and **semantic channel accessibility hint** (bounded product consumer). Pathway registry is closed in `actDescriptorTypes.ts`. Further consumers require a separate adoption audit.
