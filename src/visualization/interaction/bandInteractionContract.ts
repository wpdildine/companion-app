/**
 * Typed documentation for `InteractionBand` outbound semantics (not a runtime dispatcher).
 * The corresponding callback bundle type is `InteractionBandSemanticCallbacks` on `InteractionBand`.
 *
 * NDC invariant: zone classification and organism field use **active-region NDC** from the band’s
 * `toNdc(bandRect, canvasSize)` — never raw screen normalization. See `zoneLayout.ts` and
 * `docs/INTERACTION_CONTRACT.md`.
 */

import type { TouchZone } from './zoneLayout';

/**
 * Logical phases the band can drive through its callbacks (multiple may apply across one gesture).
 * For documentation and future instrumentation; band implementation uses discrete props today.
 */
export type BandSemanticPhase =
  | 'continuous'
  | 'centerShortTap'
  | 'centerHoldAttempt'
  | 'centerHoldEnd'
  | 'clusterRelease'
  | 'cancelled';

/** Active-region normalized device coordinates `[x, y]` from the band layout + canvas size. */
export type BandActiveRegionNdc = readonly [number, number];

/** True when NDC X maps to a rules/cards cluster (not center neutral). */
export function isBandClusterSide(zone: TouchZone): zone is 'rules' | 'cards' {
  return zone === 'rules' || zone === 'cards';
}
