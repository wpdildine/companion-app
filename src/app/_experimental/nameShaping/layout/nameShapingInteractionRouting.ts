/**
 * Pure routing/precedence helpers for spine touch interpretation.
 * No geometry ownership. Documents when Name Shaping, center hold, and cluster release apply.
 * Routing clarification: preserve existing default user-visible spine semantics.
 */

import type { TouchZone } from '../../../visualization/interaction/zoneLayout';

/**
 * When Name Shaping capture is active, voice lane is determined by layout (isVoiceLaneNdc).
 * When Name Shaping is not active, center zone (zone === null) is used for hold-to-speak.
 * Returns true if the touch should be treated as "in voice lane" for center-hold eligibility.
 */
export function isCenterHoldEligible(
  nameShapingCapturePresent: boolean,
  inVoiceLaneFromLayout: boolean,
  zone: TouchZone,
): boolean {
  if (nameShapingCapturePresent) {
    return inVoiceLaneFromLayout;
  }
  return zone === null;
}

/**
 * True when touch events should be forwarded to Name Shaping capture.
 * (Caller ensures nameShapingCapture is only passed when Name Shaping enabled and debug not suppressing.)
 */
export function shouldForwardToNameShapingCapture(nameShapingCapturePresent: boolean): boolean {
  return nameShapingCapturePresent;
}

/**
 * On touch end: if hold had started, center hold takes precedence (no cluster release).
 * Otherwise cluster release (rules/cards) is emitted by zone.
 * This helper documents the precedence; actual dispatch remains in InteractionBand.
 */
export function shouldEmitClusterReleaseOnEnd(holdHadStarted: boolean): boolean {
  return !holdHadStarted;
}
