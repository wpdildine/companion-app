# Semantic-channel canonical copy — parity matrix

**Authority:** Canonical strings are implemented in [`src/app/agent/semanticChannelCanonicalCopy.ts`](../src/app/agent/semanticChannelCanonicalCopy.ts). Legacy [`getPlayActAccessibilityLabel` / `getPlayActPhaseCaptionText`](../src/app/agent/playActPhaseCopy.ts) delegate to the same mappers.

**Critical note:** [`getOutcomeProjection`](../src/app/agent/getOutcomeProjection.ts) returns `{ class: 'blocked' }` for **any** non-null `lastFrontDoorOutcome`, while label/caption policy follows **`resolveAgentPlayAct` / `deriveSemanticChannelCopyCore`**, which branch on **`front_door_verdict`** (e.g. `clarify_entity` vs abstain vs other). **Copy must not be driven by `outcome.class === 'blocked'` alone** when parity with historical behavior is required. Row **I** documents the resulting Act vs copy distinction for an evidence-backed edge case.

| Row | Scenario | Legacy / canonical label (today) | Legacy / canonical caption (today) | ActDescriptor.family (typical) | Parity |
| --- | --- | --- | --- | --- | --- |
| A | InputOpen / idle — no FD outcome, no recoverable tail, empty `responseText` | Agent ready. Awaiting voice input. | Ready to listen | InputOpen | Parity |
| B | WorkInFlight / listening — no FD clarify/abstain | Agent ready. Awaiting voice input. | Ready to listen | WorkInFlight | Parity |
| C | WorkInFlight / processing | Processing your question. | Working on it… | WorkInFlight | Parity |
| D | AnswerActive / speaking — trimmed `responseText` | Playing answer. | Playing answer | AnswerActive (success outcome) | Parity |
| E | AnswerActive / idle — trimmed `responseText`, no blockers | Answer displayed. | Answer ready | AnswerActive | Parity |
| F | ClarificationPending — `clarify_entity` while idle or listening | Clarification needed. Refine your question. | Needs a clearer question | ClarificationPending | Parity |
| G | RecoverableSetback — abstain verdict **or** listener recoverable tail | Could not complete. You can try again. | Try again when ready | RecoverableSetback | Parity |
| H | SystemFault — `lifecycle === 'error'` | Error. {msg} or fallback | _(null)_ | SystemFault | Parity |
| I | Front-door **non-clarify / non-abstain** — e.g. idle + `lastFrontDoorOutcome` with `proceed_to_retrieval` (evidence-backed odd state) | Agent ready. Awaiting voice input. | Ready to listen | ClarificationPending (outcome `blocked`) | **Parity on copy**; Act/outcome may diverge — observational only |
| J | No committed response — empty `responseText`, plain intake | Agent ready. Awaiting voice input. | Ready to listen | InputOpen | Parity |
| K | `respond` caption branches for each `commitVisibilityHint` | _(see `mapSemanticChannelAccessibilityLabel`)_ | Forming answer… / No answer displayed / More detail needed / Answer ready | N/A (synthetic core) | Parity (unit tests lock mapper table) |

**Approved deltas:** Any intentional string change must be listed here with product sign-off and a copy-version bump in `semanticChannelCanonicalCopy.ts`.
