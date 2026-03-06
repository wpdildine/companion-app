/**
 * Color utilities for visualization (e.g. hex/RGB conversion, palette).
 */
export function hexToRgb(hex: string): [number, number, number] {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      throw new Error(
        `hexToRgb: expected #RRGGBB, got "${hex}". Use 6-digit hex (e.g. #ffffff).`,
      );
    }
  }
  const n = parseInt(hex.slice(1), 16);
  return [
    Math.floor(n / 65536) / 255,
    Math.floor((n % 65536) / 256) / 255,
    (n % 256) / 255,
  ];
}
