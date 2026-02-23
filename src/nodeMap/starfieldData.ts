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
  radius: number = 25,
): StarVertex[] {
  const rnd = mulberry32(SEED);
  const out: StarVertex[] = [];
  for (let i = 0; i < count; i++) {
    const theta = rnd() * Math.PI * 2;
    const phi = Math.acos(2 * rnd() - 1);
    const r = radius * Math.cbrt(rnd());
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);
    const lum = 0.5 + 0.5 * rnd();
    out.push({
      position: [x, y, z],
      color: [lum, lum * 0.95, lum * 1.1],
      size: 0.015 + 0.02 * rnd(),
    });
  }
  return out;
}
