/**
 * Single source for pulse color. No hardcoded duplicates in TouchRaycaster or triggerPulse.
 * RGB 0..1. Does not import theme; receives paletteId and optional hueShift.
 */

import type { NodeMapMode } from '../types';

export type PulseEventType =
  | 'tap'
  | 'chunkAccepted'
  | 'tapCitation'
  | 'tapCard'
  | 'warning'
  | null;

/** Base palette RGB (0..1) by paletteId. Index 0 = default purple. */
const PALETTE_BY_ID: [number, number, number][] = [
  [0.5, 0.25, 0.85],
  [0.35, 0.55, 1.0],
  [0.95, 0.35, 0.85],
  [0.2, 0.7, 0.9],
];

/**
 * Returns pulse color for the given palette, optional event type, and mode.
 * eventType and mode can shift hue for semantic feedback (e.g. warning = warmer).
 */
export function getPulseColor(
  paletteId: number,
  eventType?: PulseEventType,
  mode?: NodeMapMode,
): [number, number, number] {
  const idx = Math.max(0, Math.floor(paletteId)) % PALETTE_BY_ID.length;
  let [r, g, b] = PALETTE_BY_ID[idx];

  if (eventType === 'warning') {
    r = Math.min(1, r * 1.2);
    b = Math.max(0, b * 0.85);
  } else if (eventType === 'tapCitation') {
    g = Math.min(1, g * 1.1);
  } else if (eventType === 'tapCard') {
    r = Math.min(1, r * 1.08);
    b = Math.min(1, b * 1.08);
  } else if (eventType === 'chunkAccepted') {
    b = Math.min(1, b * 1.05);
  }

  if (mode === 'processing') {
    b = Math.min(1, b * 1.08);
  } else if (mode === 'speaking') {
    g = Math.min(1, g * 1.06);
  }

  return [r, g, b];
}

/**
 * Same as getPulseColor but applies hueShift in degrees (0..360) to the base color.
 * Simple hue rotation in RGB; for finer control pass hueShift from nodeMapRef.
 */
export function getPulseColorWithHue(
  paletteId: number,
  hueShiftDeg: number,
  eventType?: PulseEventType,
  mode?: NodeMapMode,
): [number, number, number] {
  const [r, g, b] = getPulseColor(paletteId, eventType, mode);
  if (hueShiftDeg === 0) return [r, g, b];
  const rad = (hueShiftDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const rr = (0.299 + 0.701 * c + 0.168 * s) * r + (0.587 - 0.587 * c + 0.33 * s) * g + (0.114 - 0.114 * c - 0.497 * s) * b;
  const gg = (0.299 - 0.299 * c - 0.328 * s) * r + (0.587 + 0.413 * c + 0.035 * s) * g + (0.114 - 0.114 * c + 0.292 * s) * b;
  const bb = (0.299 - 0.3 * c + 1.25 * s) * r + (0.587 - 0.588 * c - 1.05 * s) * g + (0.114 + 0.886 * c - 0.203 * s) * b;
  return [
    Math.max(0, Math.min(1, rr)),
    Math.max(0, Math.min(1, gg)),
    Math.max(0, Math.min(1, bb)),
  ];
}
