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

export function buildStarfield(
  count: number,
  radius: number = 42,
): StarVertex[] {
  const rnd = mulberry32(SEED);
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
    const lum = 0.55 + 0.45 * rnd();
    const tint = rnd();
    const warm = [1.0, 0.9, 0.78] as const;
    const cool = [0.72, 0.82, 1.0] as const;
    const rCol = warm[0] * (1 - tint) + cool[0] * tint;
    const gCol = warm[1] * (1 - tint) + cool[1] * tint;
    const bCol = warm[2] * (1 - tint) + cool[2] * tint;
    out.push({
      position: [x, y, z],
      color: [rCol * lum, gCol * lum, bCol * lum],
      // Mobile GL point sprites need larger base size to stay visible.
      size: 0.7 + 1.8 * Math.pow(rnd(), 2),
    });
  }
  return out;
}
