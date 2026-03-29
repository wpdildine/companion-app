# Scripted Response Seam — Answer Resolution

Deterministic **single-slot** commit and merge model for **answer-slot** text (`responseText`). Plan-level governance only—no implementation, code, or schema.

**Scope boundary:** [SCOPE.md](./SCOPE.md) (**A** in-domain; **B** chrome and **C** errors out of seam).

**Anchors:** [docs/ARCHITECTURE.md](../../../../docs/ARCHITECTURE.md), [docs/APP_ARCHITECTURE.md](../../../../docs/APP_ARCHITECTURE.md), orchestrator in `useAgentOrchestrator.ts`.

---

## Preflight — files referenced

| File | Why |
|------|-----|
| `src/app/agent/useAgentOrchestrator.ts` | Orchestrator writes to `responseText` (clear, front-door commit, failed-path restore); passes `setResponseText` into `executeRequest`. |
| `src/app/agent/request/executeRequest.ts` | Streaming partials + final settle write; empty fallback; front-door early return without writing the slot. |
| `src/app/agent/orchestrator/frontDoorCommit.ts` | Maps `SemanticFrontDoor` to committed clarify/abstain text for orchestrator. |

**Boundary check:** No second answer store, no parallel UI channel, no AV/visualization ownership in this document.

---

## 1. Commit path map — all current writes to `responseText`

| ID | Writer | When | Value |
|----|--------|------|--------|
| W0 | `useAgentOrchestrator` | Start of new submit (`requestId` set, lifecycle → processing) | `null` (clears prior answer for in-flight attempt) |
| W1 | `executeRequest` | `onPartial` (first chunk + throttled updates) | `accumulatedText` (model stream) |
| W2 | `executeRequest` | After successful RAG completion, before settling substate telemetry | `committedText` = trimmed `nudged` or `EMPTY_RESPONSE_FALLBACK_MESSAGE` if empty |
| W3 | `useAgentOrchestrator` | `runResult.status === 'front_door'` | `committed.text` from `committedResponseFromSemanticFrontDoor`, or `null` if empty abstain/clarify |
| W4 | `useAgentOrchestrator` | `runResult.status === 'failed'` | `previousCommittedResponseRef.current` (restore prior answer; not new copy) |

Front-door path returns from `executeRequest` **before** W1/W2; the slot stays `null` from W0 until W3.

`executeRequest` does **not** call `setResponseText` on terminal `failed` return; W4 is orchestrator-only.

---

## 2. Phase model

| Phase | Lifecycle / substate (typical) | Slot behavior |
|-------|--------------------------------|---------------|
| **Request_open** | New request: processing, retrieving → … | W0: slot cleared to `null`. |
| **Blocked_pre_generation** | Retrieval done; `frontDoorBlocked` | No slot write in runner; transition to idle; **W3** applies clarify/abstain text. No model streaming. |
| **Streaming** | Model tokens arriving; `onPartial` | **W1** only: model partials (throttled). |
| **Settle** | Final `nudged` + validation complete; `settling` substate | **W2**: one authoritative string for this attempt (`nudged` or empty fallback). Supersedes last partial visually. |
| **Terminal_error (C)** | Request failure from runner | **W4** restore; `error` state separate from answer slot per [SCOPE.md](./SCOPE.md). |

---

## 3. Insertion points for Scripted Response Seam

### Allowed

1. **Front-door handoff (orchestrator-adjacent):** Immediately **after** the deterministic draft from `committedResponseFromSemanticFrontDoor` and **before** the single `setResponseText` for that outcome. No streaming on this branch; one write = one merge opportunity.
2. **Model-path settle (request runner):** Immediately **after** `committedText` is computed from `nudged` / empty fallback and **before** `setResponseText(committedText)` that finalizes the attempt. The same string must flow to `runResult.committedText` / TTS.

### Disallowed (ambiguous / forbidden for v1 semantics)

- **Inside `onPartial`:** Seam must **not** merge or inject during **W1**. Model partials stay raw model; avoids double authority, throttle races, and undefined merge with incomplete text.
- **Between W2 and orchestrator for completed path:** Orchestrator must not second-guess the settled string without a single defined second pass (duplicate commit authority). Prefer **one** settle merge inside the runner for the model path.
- **Pre-clear (W0):** Seam does not write the slot on request start; clearing is orchestrator-owned.

---

## 4. Precedence rules

Within **one request attempt**, sources are **not** all active; precedence is **path-dependent**:

1. **W0** always runs at submit start → slot `null` until the first allowed write on that path.
2. **Blocked_pre_generation:** Only **front-door draft → seam (optional) → W3**. Model and fallback **do not apply**.
3. **Model path:** **W1** (partials) then **W2** (settle). **W2 wins** over any prior partial as the committed answer for that attempt. Seam merge applies to the **settle draft** (computed `committedText` **before** the write), not to partials.
4. **Empty `nudged`:** Fallback string is part of the settle draft. **Seam merge ordering:** compose the **model-path settle draft** (nudged vs empty fallback per current policy), **then** apply seam **replacement / additive / augmentation** to that draft (see §5).
5. **Failed terminal:** **W4** only; seam **does not** participate (C-category / restore semantics).

**Cross-path:** Front-door vs model are mutually exclusive completions from `executeRequest` for a given attempt.

---

## 5. Merge semantics (definitions only)

All apply to **one input draft string** (or structured clarify payload reduced to a draft by existing front-door policy), producing **one** `string | null` for the slot.

| Posture | Meaning |
|---------|--------|
| **Replacement** | Ignore model (or ignore draft body) for display/commit; output is **only** seam-authored text (or `null` where policy keeps slot empty). |
| **Additive** | Output = `prefix + draft + suffix` (or draft + suffix / prefix + draft) per intent; draft is model final or clarify-assembled text. |
| **Augmentation** | Output = template or wrapper around **draft** (headers, labels, bullets) where draft remains semantically central; not a full replace. |

**Ordering:** Seam operates on draft **after** built-in empty fallback substitution on the model path, so “fallback vs model” is resolved **before** seam (fallback is already inside `committedText` when seam runs at settle).

---

## 6. Streaming model

| Question | Decision |
|----------|----------|
| Does seam appear during streaming? | **No.** Streaming remains **model-only** (**W1**). |
| When does seam appear? | **Settle** for model path; **single handoff** for front-door path. |
| Partials vs final | Partials are **progressive**; **W2** (post-merge) is the **authoritative** committed string. Replacement/additive at settle may change text after the stream; that is an explicit **product** tradeoff, not a second channel. |
| Suppression | No extra buffer: seam output replaces what would have been written once at the insertion point. |

---

## 7. Single-slot invariants

- Exactly **one** React state field `responseText` for the answer body; no `scriptedText` / `modelText` split exposed to composition.
- Seam output is **ephemeral** at the call site: **proposed string** merged into the **same** write that would have occurred (W2/W3), or orchestration chooses `null` where policy matches abstain-empty.
- **TTS / playback** binds to the **same** committed string returned on the completed path (`runResult.committedText`) after settle merge; implementation must keep runner return and slot consistent.

---

## 8. Failure boundary (C-category)

- Terminal request failures: `displayMessage` → `setError`; **W4** restores prior `responseText`. Seam **does not** intercept, rewrite, or own these strings ([SCOPE.md](./SCOPE.md), **C** out of scope).
- Recoverable front-door: not C; seam **may** apply on **A**-shaped clarify presentation only at the **W3** insertion point; abstain-empty remains policy.

---

## 9. Minimal integration contract (conceptual)

| Party | Responsibility |
|-------|----------------|
| **Seam** | Given **read-only context** (verdict, draft text, intent key, flags—schema TBD), returns **at most one** proposed answer-slot string (`string` or `null`), or a pure merge of draft + posture. No lifecycle, no refs, no extra stores. |
| **Orchestrator** | **Commit timing**, W0/W3/W4, passing `setResponseText`; **final decision** to write exactly one value per commit step (may be “use seam output as-is”). |
| **executeRequest** | Model path: **W1**; compute settle draft; invoke seam at **settle insertion**; **single W2** with merged result; return `committedText` matching that write. |

No additional state contracts beyond existing refs used for restore (`previousCommittedResponseRef`, etc.).

---

## Dependencies (out of this document)

- Concrete TypeScript types for seam context and posture enums.
- Whether **replacement** at settle should skip **W1** entirely (hide stream)—not required for this architecture; current decision keeps streaming model-only and merge at settle only.
