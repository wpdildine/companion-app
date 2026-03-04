import * as THREE from 'three';

/**
 * Creates a basic plane material for spine planes. Render-state (transparent,
 * depthWrite, depthTest, side) is set once here; do not mutate in useFrame.
 */
export function createBasicPlaneMaterial(
  color: string,
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    toneMapped: false,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });
}
