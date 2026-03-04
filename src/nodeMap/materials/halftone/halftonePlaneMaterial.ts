import * as THREE from 'three';
import { HALFTONE_VERTEX } from './halftone.vert';
import { HALFTONE_FRAGMENT } from './halftone.frag';

/**
 * Creates the single halftone ShaderMaterial for the center spine plane.
 * Render-state (blending, depthWrite, depthTest, side) is set once here.
 * Blending is owned by this material factory, not mutated in Spine.tsx.
 */
export function createHalftoneMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color() },
      uOpacity: { value: 0.6 },
      uIntensity: { value: 0 },
      uDensity: { value: 1 },
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uPlanePhase: { value: 0 },
      uPlaneSize: { value: new THREE.Vector2(1, 1) },
      uFadeMode: { value: 0 },
      uFadeInner: { value: 0.35 },
      uFadeOuter: { value: 0.65 },
      uFadePower: { value: 1.5 },
    },
    vertexShader: HALFTONE_VERTEX,
    fragmentShader: HALFTONE_FRAGMENT,
    transparent: true,
    toneMapped: false,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });
}
