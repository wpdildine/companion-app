/**
 * Visual touch affordances for cluster interactions.
 * Shows lightweight ring zones where users can tap to reveal related UI blocks.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getTwoClusterCenters } from '../helpers/formations';
import type { VizEngineRef } from '../types';

export function ClusterTouchZones({
  vizRef,
}: {
  vizRef: React.RefObject<VizEngineRef | null>;
}) {
  const centers = useMemo(() => getTwoClusterCenters(), []);
  const rulesRingRef = useRef<THREE.Mesh>(null);
  const cardsRingRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const v = vizRef.current;
    if (!v) return;
    const show = v.vizIntensity !== 'off';
    const rulesVisible = show && (v.rulesClusterCount ?? 0) > 0;
    const cardsVisible = show && (v.cardsClusterCount ?? 0) > 0;
    if (rulesRingRef.current?.material) {
      rulesRingRef.current.visible = rulesVisible;
      const m = rulesRingRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.12 + Math.min(0.12, v.touchInfluence * 0.2);
      rulesRingRef.current.rotation.z += 0.004;
    }
    if (cardsRingRef.current?.material) {
      cardsRingRef.current.visible = cardsVisible;
      const m = cardsRingRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.12 + Math.min(0.12, v.touchInfluence * 0.2);
      cardsRingRef.current.rotation.z -= 0.004;
    }
  });

  return (
    <>
      <mesh
        ref={rulesRingRef}
        position={[
          centers.rulesCenter[0],
          centers.rulesCenter[1],
          centers.rulesCenter[2] + 0.02,
        ]}
        visible={false}
      >
        <ringGeometry args={[0.95, 1.15, 48]} />
        <meshBasicMaterial
          color={new THREE.Color(0.35, 0.55, 1.0)}
          transparent
          opacity={0.16}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh
        ref={cardsRingRef}
        position={[
          centers.cardsCenter[0],
          centers.cardsCenter[1],
          centers.cardsCenter[2] + 0.02,
        ]}
        visible={false}
      >
        <ringGeometry args={[0.95, 1.15, 48]} />
        <meshBasicMaterial
          color={new THREE.Color(0.95, 0.35, 0.85)}
          transparent
          opacity={0.16}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

