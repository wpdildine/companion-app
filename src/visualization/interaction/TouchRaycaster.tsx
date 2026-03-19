/**
 * Processes pending tap from canvas: raycast to plane at scene center,
 * triggers pulse at 3D intersection (reference: triggerPulse(clientX, clientY)).
 *
 * Note:
 * - This is a discrete tap pulse path (canvas/raycast), not the InteractionBand release-commit path.
 * - InteractionBand writes continuous touchField* and cluster release semantics separately.
 */

import { useFrame, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';
import { useRef } from 'react';
import type { VisualizationEngineRef } from '../runtime/runtimeTypes';
import { getVizSubsystemEnabled } from '../../app/ui/components/overlays/vizSubsystemToggles';
import { getPulseColorWithHue } from '../runtime/getPulseColor';

export function TouchRaycaster({
  visualizationRef,
}: {
  visualizationRef: React.RefObject<VisualizationEngineRef | null>;
}) {
  const { camera } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const pointer = useRef(new THREE.Vector2());
  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));
  const intersection = useRef(new THREE.Vector3());

  useFrame((state) => {
    const v = visualizationRef.current;
    if (!v?.pendingTapNdc) return;
    if (!getVizSubsystemEnabled('r3fFrame')) {
      v.pendingTapNdc = null;
      return;
    }

    const [ndcX, ndcY] = v.pendingTapNdc;
    // Consume-once contract: pendingTapNdc is single-fire and cleared immediately.
    v.pendingTapNdc = null;
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
      v.pulseColors[i] = getPulseColorWithHue(
        v.paletteId,
        v.hueShift,
        'tap',
        v.currentMode,
      );
      v.lastPulseIndex = (v.lastPulseIndex + 1) % 3;
    }
  });

  return null;
}
