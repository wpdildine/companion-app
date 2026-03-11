import type { GLSceneBackPlane } from '../sceneFormations';
import type { GLSceneSpine } from './spine';
import type { GLSceneBackgroundPlanes } from '../sceneFormations';
import { BACK_PLANE_ART_DIRECTION } from '../artDirection/backPlaneArtDirection';

/**
 * Build back plane layer description. Z values lie strictly between
 * rearmost spine plane and nearest background plane (builder-owned, relative).
 */
export function buildBackPlaneDescription(
  spine: GLSceneSpine,
  backgroundPlanes: GLSceneBackgroundPlanes,
): GLSceneBackPlane {
  const rearmostSpineZ = Math.max(
    ...spine.planes.map(p => p.z),
  );
  const nearestBgZ = backgroundPlanes.planes[0]?.z ?? 6.5;
  const range = nearestBgZ - rearmostSpineZ;
  const a = BACK_PLANE_ART_DIRECTION;
  const count = range > 0 ? Math.min(a.planeCount, 2) : 0;
  if (count <= 0) {
    return {
      count: 0,
      planes: [],
      parallaxScale: a.parallaxScale || undefined,
    };
  }
  const planes: GLSceneBackPlane['planes'] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 1) / (count + 1);
    const z = rearmostSpineZ + range * t;
    const isHero = i === 0;
    planes.push({
      z,
      scaleX: isHero ? a.scaleHero : a.scaleSecondary,
      scaleY: isHero ? a.scaleHero : a.scaleSecondary,
      opacityBase: isHero ? a.opacityBaseHero : a.opacityBaseSecondary,
      driftScale: a.driftScale,
    });
  }
  return {
    count: planes.length,
    planes,
    parallaxScale: a.parallaxScale || undefined,
  };
}
