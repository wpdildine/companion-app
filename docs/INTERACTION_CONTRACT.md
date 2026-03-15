# Interaction Contract: InteractionBand ↔ AgentSurface

**Scope:** `src/visualization/interaction/InteractionBand.tsx`, `src/app/AgentSurface.tsx`  
**Purpose:** Baseline description of the center-hold contract after the touch-intent vs semantic-acceptance refactor. Use this for regression checks and when changing either layer.

---

## 1. Ownership

| Concern | Owner | Meaning |
|--------|--------|--------|
| **Touch intent** | InteractionBand | Touch in voice lane + timer fire or bypass → "attempt" only. Band does not claim semantic hold started. |
| **Semantic acceptance/rejection** | AgentSurface | Decides accept / reject (immediate or async). Only accepted → semantic hold. |
| **Semantic release** | Valid only for accepted hold | `onCenterHoldEnd` is invoked by the band only when that touch's attempt was accepted. |

---

## 2. Contract points

- **InteractionBand** owns **touch intent only** (attempt in flight / attempt dispatched). It does not claim semantic hold started; it calls `onCenterHoldAttempt(reportAccepted)` when the hold intent threshold is met (timer or bypass).
- **AgentSurface** owns **semantic acceptance/rejection** (immediate or async). It calls `reportAccepted(true)` only when the hold is actually accepted (e.g. after `startListening` resolves with `result.ok`); otherwise `reportAccepted(false)`.
- **Only accepted holds** can produce semantic release. The band calls `onCenterHoldEnd` only when the hold was accepted for that touch.
- **Busy retouches** are immediate reject + immediate softFail. Do not call `startListening(true)` on busy audio (`audioSessionState !== 'idleReady'`).
- **Late acceptance callbacks** after touch end/cancel are ignored by the band (one-shot handshake). Resolutions after `clearCenterHoldState` have no effect.

---

## 3. Touch end after rejection

If a touch attempted and was rejected (immediately or after async failure), release is **pure cleanup only**: no `onCenterHoldEnd`, no extra softFail on release. The band clears its local state and does nothing else.

---

## 4. Key implementation details

- **Band:** `centerHoldAcceptedRef` is set only when Surface calls `reportAccepted(true)` and the attempt is still valid (touch not ended/cancelled). Only `centerHoldAcceptedRef` drives `onCenterHoldEnd`; "attempt in flight" never drives semantic end.
- **Surface:** `centerHoldActiveRef` is set only after semantic acceptance (when calling `reportAccepted(true)` / after `startListening` resolves with `result.ok`). Never set optimistically before acceptance.
- **Bypass:** `centerHoldShouldBypassDelay` is an input-routing optimization only (skip 450ms timer). It has zero semantic meaning and does not mean "mark hold as started/accepted."
