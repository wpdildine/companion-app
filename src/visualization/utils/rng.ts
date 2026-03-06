/**
 * Seeded RNG for deterministic layout (e.g. cluster placement).
 * Returns value in [0, 1].
 */
export function seeded(i: number, seed: number): number {
  return Math.abs(Math.sin((i + 1) * seed));
}
