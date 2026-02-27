/**
 * Starfield: ~8k points with position, color, size. Built once.
 */

export interface StarVertex {
  position: [number, number, number];
  color: [number, number, number];
  size: number;
}

const SEED = 12345;
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Optional palette override (RGB 0–1). Injected from theme; do not import theme here. */
export type StarfieldPalette = {
  a: [number, number, number];
  b: [number, number, number];
};

const DEFAULT_PALETTE_A: [number, number, number] = [0.35, 0.55, 1.0];
const DEFAULT_PALETTE_B: [number, number, number] = [0.95, 0.35, 0.85];

export function buildStarfield(
  count: number,
  radius: number = 42,
  palette?: StarfieldPalette,
): StarVertex[] {
  const rnd = mulberry32(SEED);
  const paletteA = palette?.a ?? DEFAULT_PALETTE_A;
  const paletteB = palette?.b ?? DEFAULT_PALETTE_B;
  const out: StarVertex[] = [];
  for (let i = 0; i < count; i++) {
    const theta = rnd() * Math.PI * 2;
    const isBandStar = rnd() < 0.72;
    // Most stars live in a thin galactic band, with the remainder isotropic.
    const yBand = (rnd() - 0.5) * radius * 0.24;
    const yIso = (2 * rnd() - 1) * radius;
    const y = isBandStar ? yBand : yIso;
    const ring = Math.sqrt(Math.max(0.01, 1 - (y / radius) * (y / radius)));
    const r = radius * (0.82 + 0.18 * rnd());
    const x = r * ring * Math.cos(theta);
    const z = r * ring * Math.sin(theta);
    const lum = 0.6 + 0.4 * rnd();
    const tint = rnd();
    const rCol = paletteA[0] * (1 - tint) + paletteB[0] * tint;
    const gCol = paletteA[1] * (1 - tint) + paletteB[1] * tint;
    const bCol = paletteA[2] * (1 - tint) + paletteB[2] * tint;
    // Subtle size jitter for a more cohesive background texture.
    const sizeJitter = (rnd() - 0.5) * 0.55;
    out.push({
      position: [x, y, z],
      color: [rCol * lum, gCol * lum, bCol * lum],
      // Keep stars visible while only slightly randomizing per-star size.
      size: 1.35 + sizeJitter,
    });
  }
  return out;
}
