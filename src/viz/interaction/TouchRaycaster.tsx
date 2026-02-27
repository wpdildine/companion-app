/**
 * Processes pending tap from canvas: raycast to plane at scene center,
 * triggers pulse at 3D intersection (reference: triggerPulse(clientX, clientY)).
 */

import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useRef } from 'react';
import type { VizEngineRef } from '../types';

const PULSE_COLOR: [number, number, number] = [0.5, 0.25, 0.85];

export function TouchRaycaster({
  vizRef,
}: {
  vizRef: React.RefObject<VizEngineRef | null>;
}) {
  const { camera } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const pointer = useRef(new THREE.Vector2());
  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));
  const intersection = useRef(new THREE.Vector3());

  useFrame((state) => {
    const v = vizRef.current;
    if (!v?.pendingTapNdc) return;

    const [ndcX, ndcY] = v.pendingTapNdc;
    v.pendingTapNdc = null;
    console.log('[NodeMap] TouchRaycaster: processing tap ndc=', ndcX.toFixed(3), ndcY.toFixed(3));

    pointer.current.set(ndcX, ndcY);
    raycaster.current.setFromCamera(pointer.current, camera);

    plane.current.normal.copy(camera.position).normalize();
    plane.current.constant = 0;

    const hit = raycaster.current.ray.intersectPlane(plane.current, intersection.current);
    if (hit !== null) {
      const i = v.lastPulseIndex % 3;
      v.pulsePositions[i] = [
        intersection.current.x,
        intersection.current.y,
        intersection.current.z,
      ];
      v.pulseTimes[i] = state.clock.getElapsedTime();
      v.pulseColors[i] = [...PULSE_COLOR];
      v.lastPulseIndex = (v.lastPulseIndex + 1) % 3;
      console.log('[NodeMap] TouchRaycaster: pulse at', intersection.current.x.toFixed(2), intersection.current.y.toFixed(2), intersection.current.z.toFixed(2));
    } else {
      console.log('[NodeMap] TouchRaycaster: no plane intersection');
    }
  });

  return null;
}
