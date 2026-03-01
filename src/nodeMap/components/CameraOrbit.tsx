/**
 * Positions camera from orbit angles (drag-to-explore). Reference: OrbitControls.
 */

import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import type { NodeMapEngineRef } from '../types';

const RADIUS = 13.5;

export function CameraOrbit({
  nodeMapRef,
}: {
  nodeMapRef: React.RefObject<NodeMapEngineRef | null>;
}) {
  const { camera } = useThree();
  const prevPhi = useRef(0.4);

  useFrame(() => {
    const v = nodeMapRef.current;
    if (!v) return;

    const theta = v.orbitTheta;
    let phi = v.orbitPhi;
    phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));
    prevPhi.current = phi;

    camera.position.x = RADIUS * Math.sin(phi) * Math.sin(theta);
    camera.position.y = RADIUS * Math.cos(phi);
    camera.position.z = RADIUS * Math.sin(phi) * Math.cos(theta);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
  });

  return null;
}
