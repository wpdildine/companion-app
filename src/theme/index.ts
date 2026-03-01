/**
 * Theme: pure values only. Recomputed when isDark changes.
 * RN tokens for screens; viz primitives for injection into NodeMap (no theme import in nodeMap).
 */

import {
  RN_LIGHT,
  RN_DARK,
  VIZ_CANVAS_BACKGROUND,
  VIZ_PALETTE_A,
  VIZ_PALETTE_B,
  VIZ_NODE_PALETTE,
} from './tokens';

export type Theme = {
  text: string;
  textMuted: string;
  background: string;
  surface: string;
  border: string;
  primary: string;
  success: string;
  error: string;
  warning: string;
  viz: {
    canvasBackground: string;
    paletteA: [number, number, number];
    paletteB: [number, number, number];
    nodePalette: [number, number, number][];
  };
};

export function getTheme(isDark: boolean): Theme {
  const rn = isDark ? RN_DARK : RN_LIGHT;
  return {
    ...rn,
    viz: {
      canvasBackground: VIZ_CANVAS_BACKGROUND,
      paletteA: [...VIZ_PALETTE_A],
      paletteB: [...VIZ_PALETTE_B],
      nodePalette: VIZ_NODE_PALETTE.map((c) => [...c] as [number, number, number]),
    },
  };
}
