/**
 * Theme: pure values only. Recomputed when isDark changes.
 * RN tokens for screens; viz primitives for injection into Visualization (no theme import in visualization).
 */

import {
  RN_LIGHT,
  RN_DARK,
  DEFAULT_FONT_FAMILY,
  VIZ_CANVAS_BACKGROUND,
  VIZ_PALETTE_A,
  VIZ_PALETTE_B,
  VIZ_NODE_PALETTE,
} from './tokens';

export type Theme = {
  fontFamily: string;
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
    fontFamily: DEFAULT_FONT_FAMILY,
    ...rn,
    viz: {
      canvasBackground: VIZ_CANVAS_BACKGROUND,
      paletteA: [...VIZ_PALETTE_A],
      paletteB: [...VIZ_PALETTE_B],
      nodePalette: VIZ_NODE_PALETTE.map((c) => [...c] as [number, number, number]),
    },
  };
}
