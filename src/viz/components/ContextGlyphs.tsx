/**
 * Context glyphs: two clusters (rules + cards), breathing + drift + glow. Counts from vizRef; no glyphs when no evidence.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildTwoClusters } from '../helpers/formations';
import { nodeVertex, nodeFragment } from '../shaders/nodes';
import type { VizEngineRef } from '../types';

const FORMATION = buildTwoClusters();
const N = FORMATION.nodes.length;

export function ContextGlyphs({ vizRef }: { vizRef: React.RefObject<VizEngineRef | null> }) {
  const meshRef = useRef<THREE.Points>(null);
  const visibleRef = useRef<Float32Array>(new Float32Array(N));
  const { positions, nodeSizes, nodeTypes, nodeColors, distanceFromRoot } = useMemo(() => {
    const positions = new Float32Array(N * 3);
    const nodeSizes = new Float32Array(N);
    const nodeTypes = new Float32Array(N);
    const nodeColors = new Float32Array(N * 3);
    const distanceFromRoot = new Float32Array(N);
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
  const { decayPhase, decayRate, decayDepth } = useMemo(() => {
    const phase = new Float32Array(N);
    const rate = new Float32Array(N);
    const depth = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const r1 = Math.abs(Math.sin((i + 1) * 12.9898));
      const r2 = Math.abs(Math.sin((i + 1) * 78.233));
      const r3 = Math.abs(Math.sin((i + 1) * 37.719));
      phase[i] = r1 * Math.PI * 2;
      rate[i] = 0.25 + r2 * 1.15;
      depth[i] = 0.12 + r3 * 0.35;
    }
    return { decayPhase: phase, decayRate: rate, decayDepth: depth };
  }, []);
  const MODE_TO_ID: Record<string, number> = {
    idle: 0,
    listening: 1,
    processing: 2,
    speaking: 3,
    touched: 4,
    released: 5,
  };
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uActivity: { value: 0.1 },
      uMode: { value: 0 },
      uBaseNodeSize: { value: 5.25 },
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
      uModelMatrix: { value: new THREE.Matrix4() },
      uViewMatrix: { value: new THREE.Matrix4() },
      uProjectionMatrix: { value: new THREE.Matrix4() },
      uTouchRadius: { value: 3.6 },
      uTouchStrength: { value: 2.8 },
      uTouchMaxOffset: { value: 1.35 },
    }),
    [],
  );

  const viewMatrixRef = useRef(new THREE.Matrix4());
  const projectionMatrixRef = useRef(new THREE.Matrix4());

  useFrame((state, delta) => {
    if (!meshRef.current?.material || !vizRef.current) return;
    const points = meshRef.current;
    const geom = points.geometry;
    const v = vizRef.current;
    const rulesCount = v.rulesClusterCount ?? 0;
    const cardsCount = v.cardsClusterCount ?? 0;
    for (let i = 0; i < 8; i++) visibleRef.current[i] = i < rulesCount ? 1 : 0;
    for (let i = 8; i < 16; i++) visibleRef.current[i] = i - 8 < cardsCount ? 1 : 0;
    const visibleAttr = geom.getAttribute('visible');
    if (visibleAttr) {
      visibleAttr.needsUpdate = true;
    }
    const mat = points.material as THREE.ShaderMaterial;
    // Keep glyph clusters front-facing and stable in 2D space.
    points.rotation.x = 0;
    points.rotation.y = 0;
    points.rotation.z = 0;
    if (mat.uniforms) {
      mat.uniforms.uTime.value += delta;
      mat.uniforms.uActivity.value = v.activity;
      mat.uniforms.uMode.value = MODE_TO_ID[v.currentMode as keyof typeof MODE_TO_ID] ?? 0;
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
      viewMatrixRef.current.copy(state.camera.matrixWorldInverse);
      projectionMatrixRef.current.copy(state.camera.projectionMatrix);
      mat.uniforms.uModelMatrix.value.copy(points.matrixWorld);
      mat.uniforms.uViewMatrix.value.copy(viewMatrixRef.current);
      mat.uniforms.uProjectionMatrix.value.copy(projectionMatrixRef.current);
    }
  });

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('nodeSize', new THREE.BufferAttribute(nodeSizes, 1));
    g.setAttribute('nodeType', new THREE.BufferAttribute(nodeTypes, 1));
    g.setAttribute('nodeColor', new THREE.BufferAttribute(nodeColors, 3));
    g.setAttribute('distanceFromRoot', new THREE.BufferAttribute(distanceFromRoot, 1));
    g.setAttribute('decayPhase', new THREE.BufferAttribute(decayPhase, 1));
    g.setAttribute('decayRate', new THREE.BufferAttribute(decayRate, 1));
    g.setAttribute('decayDepth', new THREE.BufferAttribute(decayDepth, 1));
    g.setAttribute('visible', new THREE.BufferAttribute(visibleRef.current, 1));
    return g;
  }, [
    positions,
    nodeSizes,
    nodeTypes,
    nodeColors,
    distanceFromRoot,
    decayPhase,
    decayRate,
    decayDepth,
  ]);

  if (vizRef.current?.vizIntensity === 'off') {
    return null;
  }

  return (
    <points ref={meshRef} geometry={geom}>
      <shaderMaterial
        attach="material"
        vertexShader={nodeVertex}
        fragmentShader={nodeFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </points>
  );
}
