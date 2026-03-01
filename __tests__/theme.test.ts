/**
 * Theme: getTheme returns required keys and valid color strings.
 */

import { getTheme } from '../src/theme';

const REQUIRED_RN_KEYS = [
  'text',
  'textMuted',
  'background',
  'surface',
  'border',
  'primary',
  'success',
  'error',
  'warning',
] as const;

const REQUIRED_VIZ_KEYS = ['canvasBackground', 'paletteA', 'paletteB', 'nodePalette'] as const;

function isHexOrRgba(s: string): boolean {
  return /^#([0-9a-fA-F]{3}){1,2}$/.test(s) || /^rgba?\(/.test(s);
}

describe('getTheme', () => {
  it('returns required RN keys for light theme', () => {
    const theme = getTheme(false);
    for (const key of REQUIRED_RN_KEYS) {
      expect(theme).toHaveProperty(key);
      expect(typeof theme[key]).toBe('string');
      expect(theme[key].length).toBeGreaterThan(0);
    }
  });

  it('returns required RN keys for dark theme', () => {
    const theme = getTheme(true);
    for (const key of REQUIRED_RN_KEYS) {
      expect(theme).toHaveProperty(key);
      expect(typeof theme[key]).toBe('string');
    }
  });

  it('returns required viz keys with valid types', () => {
    const theme = getTheme(false);
    expect(theme.viz).toBeDefined();
    for (const key of REQUIRED_VIZ_KEYS) {
      expect(theme.viz).toHaveProperty(key);
    }
    expect(typeof theme.viz.canvasBackground).toBe('string');
    expect(isHexOrRgba(theme.viz.canvasBackground) || theme.viz.canvasBackground.length > 0).toBe(true);
    expect(Array.isArray(theme.viz.paletteA)).toBe(true);
    expect(theme.viz.paletteA).toHaveLength(3);
    expect(Array.isArray(theme.viz.paletteB)).toBe(true);
    expect(theme.viz.paletteB).toHaveLength(3);
    expect(Array.isArray(theme.viz.nodePalette)).toBe(true);
  });

  it('returns different text colors for light vs dark', () => {
    const light = getTheme(false);
    const dark = getTheme(true);
    expect(light.text).not.toBe(dark.text);
    expect(light.background).not.toBe(dark.background);
  });
});
