/**
 * Raw color/layout tokens. Theme is built from these; no React/refs.
 */

export const RN_LIGHT = {
  text: '#1a1a1a',
  textMuted: '#666',
  background: '#f5f5f5',
  surface: '#fff',
  border: 'rgba(0,0,0,0.1)',
  primary: '#0a7ea4',
  success: '#16a34a',
  error: '#dc2626',
  warning: '#b45309',
} as const;

export const RN_DARK = {
  text: '#e5e5e5',
  textMuted: '#888',
  background: '#1a1a1a',
  surface: '#2a2a2a',
  border: 'rgba(255,255,255,0.15)',
  primary: '#0a7ea4',
  success: '#16a34a',
  error: '#dc2626',
  warning: '#b45309',
} as const;

/** Viz: canvas background (hex). */
export const VIZ_CANVAS_BACKGROUND = '#0a0612';

/** Viz: gradient endpoints for starfield/nodes (RGB 0–1). Match shaders/nodes.ts gradientA/gradientB. */
export const VIZ_PALETTE_A: [number, number, number] = [0.35, 0.55, 1.0];
export const VIZ_PALETTE_B: [number, number, number] = [0.95, 0.35, 0.85];

/** Viz: node layer colors (RGB 0–1). Match formations.ts PALETTE. */
export const VIZ_NODE_PALETTE: [number, number, number][] = [
  [0.4, 0.2, 0.8],
  [0.5, 0.25, 0.85],
  [0.6, 0.3, 0.9],
  [0.35, 0.15, 0.75],
];
