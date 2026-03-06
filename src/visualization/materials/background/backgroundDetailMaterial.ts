import * as THREE from 'three';
import { BACKGROUND_DETAIL_VERTEX } from './backgroundDetail.vert';
import { BACKGROUND_DETAIL_FRAGMENT } from './backgroundDetail.frag';

export function createBackgroundDetailMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: BACKGROUND_DETAIL_VERTEX,
    fragmentShader: BACKGROUND_DETAIL_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Vector3(0.5, 0.5, 0.6) },
      uOpacity: { value: 0.42 },
      uNoisePhase: { value: 0 },
      uIntensity: { value: 0.8 },
      uHalftoneThreshold: { value: 0.4 },
      uHalftoneScale: { value: 1.0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
    },
  });
}
