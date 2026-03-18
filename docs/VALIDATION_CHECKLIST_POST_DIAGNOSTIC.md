# Manual validation after diagnostic cleanup

Run on a **device** after merge or before release. See also `docs/INTERACTION_CONTRACT.md` and `docs/APP_ARCHITECTURE.md`.

## Interaction

- [ ] Center hold: attempt fires → accept only after `startListening` succeeds → release runs submit after transcript settlement.
- [ ] Busy retouch while listening: immediate reject; no duplicate `startListening`.
- [ ] Rejected hold (async failure): finger up is cleanup only — no spurious submit / extra softFail on release.
- [ ] Late `reportAccepted` after touch end: ignored (no duplicate semantic hold).

## Request / playback

- [ ] Full ask: response text, cards, and rules appear together when applicable.
- [ ] `processing` → `speaking` (with TTS) or idle when not playing; `processingSubstate` cleared appropriately.
- [ ] Playback uses committed response text; after TTS end, lifecycle returns to idle / audio ready.
- [ ] Stale request completions ignored when a new request is active (requestId guards).

## Visualization

- [ ] Modes (idle / listening / processing / speaking) match orchestrator; spine/field visible and updating.
- [ ] Hold-to-speak still works with visualization mounted.

## Debug / perf (optional)

- [ ] With `__DEV__`, `perfTrace` milestones appear during ask/playback when useful.
- [ ] In release, logs are not flooded; to profile release builds, set `globalThis.__ATLAS_PERF_TRACE__ = true` temporarily.

## Viz debug panel (if used)

- [ ] Subsystem toggles and runtime mode helpers still work; `resetVizSubsystems` restores full viz.
