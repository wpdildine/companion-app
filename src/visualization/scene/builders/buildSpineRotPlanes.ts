/**
 * Spine rot layer: static rotated planes in overlay space.
 * Built here; composed by sceneFormations.ts getSceneDescription().
 * Builder owns Z + all layout; renderer reads scene.spineRot only.
 */

import type { CanonicalSceneMode } from '../sceneMode';
import { SPINE_ART_DIRECTION } from '../artDirection/spine';

export type SpineRotPlane = {
  z: number;
  rotationZ: number;
  scaleX: number;
  scaleY: number;
  color: string;
  opacityScale: number;
  accent?: boolean;
  useHalftone?: boolean;
};

export type GLSceneSpineRot = {
  planes: SpineRotPlane[];
  opacityBase: number;
  planeCountByMode: Record<CanonicalSceneMode, number>;
};

/** Seeded RNG for deterministic layout (minimal LCG). */
function createSeededRng(seed: number): () => number {
  let s = Math.abs(Math.floor(seed)) % 2147483647 || 1;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

/**
 * Build spine rot layer description from art direction.
 * Static output; no drift. Renderer does not recompute transforms.
 */
export function buildSpineRotPlanes(): GLSceneSpineRot {
  const rot = SPINE_ART_DIRECTION.rot;
  const counts = rot.planeCountByMode;
  const maxPlanes = Math.max(
    counts.idle,
    counts.listening,
    counts.processing,
    counts.speaking,
  );
  if (maxPlanes <= 0) {
    return {
      planes: [],
      opacityBase: rot.opacityBase,
      planeCountByMode: { ...counts },
    };
  }

  const rng = createSeededRng(42);
  const degToRad = Math.PI / 180;
  const planes: SpineRotPlane[] = [];
  const colors = rot.planeColors;
  const halftoneIndex = rot.halftoneAccentPlaneIndex >= 0 && rot.halftoneAccentPlaneIndex < maxPlanes
    ? rot.halftoneAccentPlaneIndex
    : -1;

  for (let i = 0; i < maxPlanes; i++) {
    const t = rng();
    const rotationDeg =
      rot.rotationDegMin + t * (rot.rotationDegMax - rot.rotationDegMin);
    const rotationZ = rotationDeg * degToRad;
    const scaleX = rot.scaleXMin + rng() * (rot.scaleXMax - rot.scaleXMin);
    const scaleY = rot.scaleYMin + rng() * (rot.scaleYMax - rot.scaleYMin);
    const z = rot.zMin + rng() * (rot.zMax - rot.zMin);
    const color = colors[i % colors.length]!;
    const opacityScale = 0.75 + rng() * 0.4;
    planes.push({
      z,
      rotationZ,
      scaleX,
      scaleY,
      color,
      opacityScale,
      useHalftone: i === halftoneIndex,
    });
  }

  return {
    planes,
    opacityBase: rot.opacityBase,
    planeCountByMode: {
      idle: counts.idle,
      listening: counts.listening,
      processing: counts.processing,
      speaking: counts.speaking,
    },
  };
}
