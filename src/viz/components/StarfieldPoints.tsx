/**
 * Starfield: Points with twinkle shader. uTime only for todo 1.
 */

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { starfieldFragment, starfieldVertex } from '../shaders/starfield';
import { buildStarfield } from '../helpers/starfieldData';
import type { VizEngineRef } from '../types';

const STAR_COUNT = 16000;
const MODE_TO_ID: Record<string, number> = {
  idle: 0,
  listening: 1,
  processing: 2,
  speaking: 3,
  touched: 4,
  released: 5,
};

export function StarfieldPoints({
  vizRef,
}: {
  vizRef: React.RefObject<VizEngineRef | null>;
}) {
  const meshRef = useRef<THREE.Points>(null);
  useEffect(() => {
    console.log('[NodeMap] StarfieldPoints mounted');
  }, []);
  const { positions, colors, sizes } = useMemo(() => {
    const stars = buildStarfield(STAR_COUNT);
    const posArr = new Float32Array(stars.length * 3);
    const colorArr = new Float32Array(stars.length * 3);
    const sizeArr = new Float32Array(stars.length);
    stars.forEach((s, i) => {
      posArr[i * 3] = s.position[0];
      posArr[i * 3 + 1] = s.position[1];
      posArr[i * 3 + 2] = s.position[2];
      colorArr[i * 3] = s.color[0];
      colorArr[i * 3 + 1] = s.color[1];
      colorArr[i * 3 + 2] = s.color[2];
      sizeArr[i] = s.size;
    });
    return { positions: posArr, colors: colorArr, sizes: sizeArr, count: stars.length };
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMode: { value: 0 },
      uActivity: { value: 0.1 },
    }),
    [],
  );

  useFrame((_, delta) => {
    if (!meshRef.current?.material || !vizRef.current) return;
    meshRef.current.rotation.y += delta * 0.01;
    meshRef.current.rotation.x += delta * 0.003;
    const mat = meshRef.current.material as THREE.ShaderMaterial;
    if (mat.uniforms?.uTime) mat.uniforms.uTime.value += delta;
    if (mat.uniforms?.uMode) {
      mat.uniforms.uMode.value =
        MODE_TO_ID[vizRef.current.currentMode as keyof typeof MODE_TO_ID] ?? 0;
    }
    if (mat.uniforms?.uActivity) {
      mat.uniforms.uActivity.value = vizRef.current.activity;
    }
  });

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    return g;
  }, [positions, colors, sizes]);

  if (!vizRef.current?.showViz) return null;

  return (
    <points ref={meshRef} geometry={geom}>
      <shaderMaterial
        attach="material"
        vertexShader={starfieldVertex}
        fragmentShader={starfieldFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
