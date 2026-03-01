/**
 * 1–2 translucent planes (plan C2). layerCount, planeOpacity, driftPx, hueShift, reduceMotion from vizRef.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VizEngineRef } from '../types';

const BASE_HUE = 0.6;
const BASE_SAT = 0.45;
const BASE_LUM = 0.55;
const SEED = 12.9898;

export function PlaneLayerField({
  vizRef,
}: {
  vizRef: React.RefObject<VizEngineRef | null>;
}) {
  const g1 = useRef<THREE.Mesh>(null);
  const g2 = useRef<THREE.Mesh>(null);
  const colorRef = useRef(new THREE.Color());

  useFrame(() => {
    const v = vizRef.current;
    if (!v) return;
    const show = v.vizIntensity !== 'off';
    const opacity = show ? Math.max(0.25, Math.min(0.65, v.planeOpacity ?? 0.28)) : 0;
    const drift = v.reduceMotion ? 0 : (v.driftPx ?? 2) / 500;
    const n = show ? Math.min(2, Math.max(0, v.layerCount ?? 2)) : 0;
    const hueShift = v.hueShift ?? 0;
    colorRef.current.setHSL((BASE_HUE + hueShift) % 1, BASE_SAT, BASE_LUM);
    if (g1.current?.material) {
      (g1.current.material as THREE.MeshBasicMaterial).color.copy(colorRef.current);
      (g1.current.material as THREE.MeshBasicMaterial).opacity = n >= 1 ? opacity : 0;
      g1.current.position.x = Math.sin(v.clock * 0.3) * drift;
      g1.current.position.y = Math.cos(v.clock * 0.27) * drift;
    }
    if (g2.current?.material) {
      (g2.current.material as THREE.MeshBasicMaterial).color.copy(colorRef.current);
      (g2.current.material as THREE.MeshBasicMaterial).opacity = n >= 2 ? opacity * 0.75 : 0;
      g2.current.position.x = Math.sin(v.clock * 0.35 + SEED) * drift;
      g2.current.position.y = Math.cos(v.clock * 0.31 + SEED) * drift;
    }
  });

  const color = new THREE.Color().setHSL(BASE_HUE, BASE_SAT, BASE_LUM);

  return (
    <>
      <mesh ref={g1} position={[0, 0, -1.2]} scale={[4, 4, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={color} transparent opacity={0.28} depthWrite={false} blending={THREE.NormalBlending} />
      </mesh>
      <mesh ref={g2} position={[0, 0, -1.4]} scale={[4, 4, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} depthWrite={false} blending={THREE.NormalBlending} />
      </mesh>
    </>
  );
}
