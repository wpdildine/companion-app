/**
 * Context links: precomputed curved segments (bezier), flow + pulse in shader. uActivity.
 * Visibility gated by vizIntensity (Full mode only).
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildCrystallineSphere } from '../helpers/formations';
import { connectionVertex, connectionFragment } from '../shaders/connections';
import type { VizEngineRef } from '../types';

const FORMATION = buildCrystallineSphere();
const SEGMENTS_PER_EDGE = 12;

function sampleBezier(
  start: [number, number, number],
  end: [number, number, number],
  pathIndex: number,
  t: number,
): [number, number, number] {
  const mid: [number, number, number] = [
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2,
    (start[2] + end[2]) / 2,
  ];
  const control: [number, number, number] = [
    mid[0] + 0.2 * Math.sin(pathIndex),
    mid[1] + 0.1 * Math.cos(pathIndex * 0.7),
    mid[2] + 0.15 * Math.sin(pathIndex * 0.5),
  ];
  const u = 1 - t;
  const b = u * u * start[0] + 2 * u * t * control[0] + t * t * end[0];
  const c = u * u * start[1] + 2 * u * t * control[1] + t * t * end[1];
  const d = u * u * start[2] + 2 * u * t * control[2] + t * t * end[2];
  return [b, c, d];
}

export function ContextLinks({ vizRef }: { vizRef: React.RefObject<VizEngineRef | null> }) {
  const meshRef = useRef<THREE.LineSegments>(null);
  const { positions, tArr, startPoints, endPoints, strengths, pathIndices, colors } = useMemo(() => {
    const nodes = FORMATION.nodes;
    const edges = FORMATION.edges;
    const vertexCount = edges.length * (SEGMENTS_PER_EDGE + 1);
    const positions = new Float32Array(vertexCount * 3);
    const tArr = new Float32Array(vertexCount);
    const startPoints = new Float32Array(vertexCount * 3);
    const endPoints = new Float32Array(vertexCount * 3);
    const strengths = new Float32Array(vertexCount);
    const pathIndices = new Float32Array(vertexCount);
    const colors = new Float32Array(vertexCount * 3);
    let idx = 0;
    for (const edge of edges) {
      const start = nodes[edge.a].position;
      const end = nodes[edge.b].position;
      const color = nodes[edge.a].color;
      for (let i = 0; i <= SEGMENTS_PER_EDGE; i++) {
        const t = i / SEGMENTS_PER_EDGE;
        const p = sampleBezier(start, end, edge.pathIndex, t);
        positions[idx * 3] = p[0];
        positions[idx * 3 + 1] = p[1];
        positions[idx * 3 + 2] = p[2];
        tArr[idx] = t;
        startPoints[idx * 3] = start[0];
        startPoints[idx * 3 + 1] = start[1];
        startPoints[idx * 3 + 2] = start[2];
        endPoints[idx * 3] = end[0];
        endPoints[idx * 3 + 1] = end[1];
        endPoints[idx * 3 + 2] = end[2];
        strengths[idx] = edge.strength;
        pathIndices[idx] = edge.pathIndex;
        colors[idx * 3] = color[0];
        colors[idx * 3 + 1] = color[1];
        colors[idx * 3 + 2] = color[2];
        idx++;
      }
    }
    return {
      positions,
      tArr,
      startPoints,
      endPoints,
      strengths,
      pathIndices,
      colors,
      vertexCount,
    };
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uActivity: { value: 0.1 },
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
      uTouchInfluence: { value: 0 },
    }),
    [],
  );

  useFrame((_, delta) => {
    if (!meshRef.current?.material || !vizRef.current) return;
    const lines = meshRef.current;
    const mat = lines.material as THREE.ShaderMaterial;
    const v = vizRef.current;
    lines.rotation.x = v.autoRotX;
    lines.rotation.y = v.autoRotY;
    lines.rotation.z = v.autoRotZ;
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
      mat.uniforms.uTouchInfluence.value = v.touchInfluence;
    }
  });

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('t', new THREE.BufferAttribute(tArr, 1));
    g.setAttribute('startPoint', new THREE.BufferAttribute(startPoints, 3));
    g.setAttribute('endPoint', new THREE.BufferAttribute(endPoints, 3));
    g.setAttribute('connectionStrength', new THREE.BufferAttribute(strengths, 1));
    g.setAttribute('pathIndex', new THREE.BufferAttribute(pathIndices, 1));
    g.setAttribute('connectionColor', new THREE.BufferAttribute(colors, 3));
    g.setIndex(
      (() => {
        const indices: number[] = [];
        let v = 0;
        for (const _ of FORMATION.edges) {
          for (let i = 0; i < SEGMENTS_PER_EDGE; i++) {
            indices.push(v, v + 1);
            v++;
          }
          v++;
        }
        return new THREE.Uint16BufferAttribute(indices, 1);
      })(),
    );
    return g;
  }, [positions, tArr, startPoints, endPoints, strengths, pathIndices, colors]);

  const v = vizRef.current;
  const confidence = v?.signalsSnapshot?.confidence ?? 1;
  const showLinks = v?.vizIntensity === 'full' && confidence < 0.7;
  if (!showLinks) {
    return null;
  }

  return (
    <lineSegments ref={meshRef} geometry={geom}>
      <shaderMaterial
        attach="material"
        vertexShader={connectionVertex}
        fragmentShader={connectionFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </lineSegments>
  );
}
