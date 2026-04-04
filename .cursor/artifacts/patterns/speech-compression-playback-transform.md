# Speech Compression Layer — Playback-Surface Transform

**Type:** closure record (patch) · **Status:** closed (tests + lint verified)

---

## Owning layer

Agent orchestrator / playback (AO)

---

## Problem

Committed answer text (`responseText`) was being sent directly to TTS, causing rule IDs and verification artifacts (e.g., `603.3b`) to be read aloud, degrading audio UX.

---

## Solution

Introduce a deterministic, speech-only transform:

```
committedResponseText → toSpeechText() → playText()
```

This removes rule-number noise and appends a lightweight reference anchor while preserving the original committed answer for UI display.

---

## Invariant (critical)

- `responseText` remains the single committed, authoritative answer
- Speech is a derived modality (never a second answer)
- **No** semantic reinterpretation occurs in the speech layer
- Runtime remains sole owner of meaning and validation
- UI retains full verification (rules, citations)

---

## Transform contract

`toSpeechText(input: string)` **must**:

- Deterministically strip rule identifiers (e.g. `603.3b`, `#seg`)
- Remove “see / under / per rule(s)” clauses
- Normalize spacing / punctuation
- Append “I've attached the relevant rules.” **only** if numeric rule references existed in the original input
- **Never:**
  - call a model
  - summarize or paraphrase
  - alter logical meaning

---

## Integration points

- `useAgentOrchestrator.ts` → `playText(..., { speechTransform: true })` on committed success playback
- `AgentSurface` replay path uses the same transform
- `avPlaybackCommand` remains unchanged (transform happens **before** AV)

---

## Out of scope (explicit)

- `runtime-ts` (no changes)
- RAG / validation / responsePipeline
- UI text rendering
- Scripted responses (unless explicitly enabled later)

---

## Behavioral result

- TTS delivers concise, natural explanations
- UI continues to show full rule references
- Verification and narration are cleanly separated

---

## Risks / guards

- **Must not** expand transform into summarization
- **Must not** introduce AO-side semantic logic
- **Must not** diverge speech meaning from `responseText`
- **Must** ensure transform is only applied where explicitly enabled (`speechTransform: true`)

---

## Closure status

- Tests passing (`speechTransform` unit tests + orchestrator contract)
- Lint clean
- No runtime regressions observed

---

## Future notes

- Additional speech modes (e.g. “brief”, “detailed”) must remain deterministic
- Any expansion must preserve: **speech ≠ reasoning**
- Consider centralizing modality transforms if more emerge

---

## END
