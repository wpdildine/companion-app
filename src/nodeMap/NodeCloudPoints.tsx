/**
 * Node cloud: Crystalline Sphere formation, breathing + drift + glow. uTime, uActivity, uPulse*.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildCrystallineSphere } from './formations';
import { nodeVertex, nodeFragment } from './shaders/nodes';
import type { VizEngineRef } from './types';

const FORMATION = buildCrystallineSphere();

export function NodeCloudPoints({ vizRef }: { vizRef: React.RefObject<VizEngineRef | null> }) {
  const meshRef = useRef<THREE.Points>(null);
  useEffect(() => {
    console.log('[NodeMap] NodeCloudPoints mounted');
  }, []);
  const { positions, nodeSizes, nodeTypes, nodeColors, distanceFromRoot } = useMemo(() => {
    const n = FORMATION.nodes.length;
    const positions = new Float32Array(n * 3);
    const nodeSizes = new Float32Array(n);
    const nodeTypes = new Float32Array(n);
    const nodeColors = new Float32Array(n * 3);
    const distanceFromRoot = new Float32Array(n);
    FORMATION.nodes.forEach((node, i) => {
      positions[i * 3] = node.position[0];
      positions[i * 3 + 1] = node.position[1];
      positions[i * 3 + 2] = node.position[2];
      nodeSizes[i] = node.size;
      nodeTypes[i] = node.type;
      nodeColors[i * 3] = node.color[0];
      nodeColors[i * 3 + 1] = node.color[1];
      nodeColors[i * 3 + 2] = node.color[2];
      distanceFromRoot[i] = node.distanceFromRoot;
    });
    return { positions, nodeSizes, nodeTypes, nodeColors, distanceFromRoot };
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uActivity: { value: 0.1 },
      uBaseNodeSize: { value: 1.6 },
      uPulseSpeed: { value: 4 },
      uPulsePositions: {
        value: [
          new THREE.Vector3(1e6, 1e6, 1e6),
          new THREE.Vector3(1e6, 1e6, 1e6),
          new THREE.Vector3(1e6, 1e6, 1e6),
        ],
      },
      uPulseTimes: { value: new Float32Array([-1e3, -1e3, -1e3]) },
      uPulseColors: {
        value: [
          new THREE.Vector3(1, 1, 1),
          new THREE.Vector3(1, 1, 1),
          new THREE.Vector3(1, 1, 1),
        ],
      },
      uTouchWorld: { value: new THREE.Vector3(1e6, 1e6, 1e6) },
      uTouchInfluence: { value: 0 },
    }),
    [],
  );

  useFrame((_, delta) => {
    if (!meshRef.current?.material || !vizRef.current) return;
    const points = meshRef.current;
    const mat = points.material as THREE.ShaderMaterial;
    const v = vizRef.current;
    points.rotation.x = v.autoRotX;
    points.rotation.y = v.autoRotY;
    points.rotation.z = v.autoRotZ;
    if (mat.uniforms) {
      mat.uniforms.uTime.value += delta;
      mat.uniforms.uActivity.value = v.activity;
      mat.uniforms.uPulsePositions.value[0].set(v.pulsePositions[0][0], v.pulsePositions[0][1], v.pulsePositions[0][2]);
      mat.uniforms.uPulsePositions.value[1].set(v.pulsePositions[1][0], v.pulsePositions[1][1], v.pulsePositions[1][2]);
      mat.uniforms.uPulsePositions.value[2].set(v.pulsePositions[2][0], v.pulsePositions[2][1], v.pulsePositions[2][2]);
      mat.uniforms.uPulseTimes.value[0] = v.pulseTimes[0];
      mat.uniforms.uPulseTimes.value[1] = v.pulseTimes[1];
      mat.uniforms.uPulseTimes.value[2] = v.pulseTimes[2];
      mat.uniforms.uPulseColors.value[0].set(v.pulseColors[0][0], v.pulseColors[0][1], v.pulseColors[0][2]);
      mat.uniforms.uPulseColors.value[1].set(v.pulseColors[1][0], v.pulseColors[1][1], v.pulseColors[1][2]);
      mat.uniforms.uPulseColors.value[2].set(v.pulseColors[2][0], v.pulseColors[2][1], v.pulseColors[2][2]);
      const tw = v.touchWorld;
      mat.uniforms.uTouchWorld.value.set(
        tw ? tw[0] : 1e6,
        tw ? tw[1] : 1e6,
        tw ? tw[2] : 1e6,
      );
      mat.uniforms.uTouchInfluence.value = v.touchInfluence;
    }
  });

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('nodeSize', new THREE.BufferAttribute(nodeSizes, 1));
    g.setAttribute('nodeType', new THREE.BufferAttribute(nodeTypes, 1));
    g.setAttribute('nodeColor', new THREE.BufferAttribute(nodeColors, 3));
    g.setAttribute('distanceFromRoot', new THREE.BufferAttribute(distanceFromRoot, 1));
    return g;
  }, [positions, nodeSizes, nodeTypes, nodeColors, distanceFromRoot]);

  if (!vizRef.current?.showViz) return null;

  return (
    <points ref={meshRef} geometry={geom}>
      <shaderMaterial
        attach="material"
        vertexShader={nodeVertex}
        fragmentShader={nodeFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
