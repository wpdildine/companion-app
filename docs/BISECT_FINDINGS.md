# Response-settlement stall bisect findings

Baseline reference gap: **947 ms** (first long gap after response settlement, Spine/RuntimeLoop).

---

## RUN no_overlay_panels

| Field | Value |
|-------|--------|
| **Flag** | `DIAG_RENDER_NO_OVERLAY_PANELS = true`, all others false |
| **Valid run** | yes (noOverlayPanels: true at module load and in ResultsOverlay; overlay short-circuited present; overlay-only milestones absent from long-gap window) |
| **successful_response** | yes |
| **timeSinceLastFrameMs** | 897 (Spine) / 898 (RuntimeLoop) |
| **delta_vs_baseline_ms** | **+50 ms improvement** (947 − 897 = 50) |
| **Overlay-only milestones in gap?** | no |
| **lastMilestonesRaw (near long gap)** | subscribe callback speak_start (entry), native speak_start, subscribe callback speak_start (exit), Piper speak() returned promise, playText yielding (await speakPromise), rAF scheduled |

**Conclusion:** no_overlay_panels is **not a material win**. The gap drops by only 50 ms; the stall remains ~897 ms and is dominated by TTS/playback and rAF-adjacent work, not overlay UI.

---

## FINAL status so far

| Run | Flag | Valid | timeSinceLastFrameMs | delta (improvement) |
|-----|------|-------|---------------------|---------------------|
| **Baseline** | all false | — | 947 | — |
| **no_overlay_panels** | NO_OVERLAY_PANELS = true | yes | 897 / 898 | +50 ms |

The **dominant region** for the stall is no longer the overlay subtree. It appears to be **response-settled → playback handoff / TTS / rAF-adjacent work** (speak_start, Piper speak(), playText yielding, rAF scheduled in the long-gap window).

---

## Recommended next run (UI bisect)

**Run:** `DIAG_RENDER_ANSWER_ONLY = true`, **all other flags false** (including NO_OVERLAY_PANELS = false).

**Why:** Completes the original overlay bisect by isolating the “answer-only” subtree. If the gap shrinks meaningfully vs baseline, the answer panel is a significant cost; if not, it reinforces that the stall is outside the overlay.

---

## Recommended next non-UI investigation

**Track:** Instrument the **TTS / playback handoff path** around the first long gap.

**Points to instrument:**

1. **Playback handoff:** response settled (or equivalent “response ready for TTS” milestone).
2. **After playback binding:** when `playText` is about to be called.
3. **Piper speak():** immediately before and after the Piper `speak()` call.
4. **Native speak_start:** when native reports speak_start (already in logs; ensure it’s in the perf buffer with timestamps).
5. **playText yielding:** when playText awaits the speak promise and rAF is scheduled.
6. **Lifecycle:** immediately before and after `setLifecycle('speaking')` (or equivalent).
7. **First long-gap frame:** the frame that yields timeSinceLastFrameMs ≈ 897–898; correlate with the above to see which segment dominates the gap.

**Goal:** Identify which segment (handoff → playText, Piper speak(), native callback, lifecycle update, or rAF/commit) accounts for most of the ~897 ms so the stall can be reduced in that region.
