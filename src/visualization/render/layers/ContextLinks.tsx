/**
 * Context links: precomputed curved segments (bezier), flow + pulse in shader. uActivity.
 * Visibility gated by vizIntensity (Full mode only). Endpoints and topology from visualizationRef.current.scene.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';
import {
  connectionVertex,
  connectionFragment,
} from '../../materials/links/connections';
import type { VisualizationEngineRef } from '../../engine/types';
import { SHADER_DEBUG_FLAGS } from '../canvas/shaderDebugFlags';
import { getEventPulse, injectEventPulse } from '../utils/eventPulse';

function sampleBezier(
  start: [number, number, number],
  end: [number, number, number],
  pathIndex: number,
  controlXAmp: number,
  controlYAmp: number,
  controlZAmp: number,
  t: number,
): [number, number, number] {
  const mid: [number, number, number] = [
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2,
    (start[2] + end[2]) / 2,
  ];
  const control: [number, number, number] = [
    mid[0] + controlXAmp * Math.sin(pathIndex),
    mid[1] + controlYAmp * Math.cos(pathIndex * 0.7),
    mid[2] + controlZAmp * Math.sin(pathIndex * 0.5),
  ];
  const u = 1 - t;
  const b = u * u * start[0] + 2 * u * t * control[0] + t * t * end[0];
  const c = u * u * start[1] + 2 * u * t * control[1] + t * t * end[1];
  const d = u * u * start[2] + 2 * u * t * control[2] + t * t * end[2];
  return [b, c, d];
}

type SceneNode = {
  position: [number, number, number];
  color: [number, number, number];
};

type SceneEdge = {
  a: number;
  b: number;
  strength: number;
  pathIndex: number;
};

const EMPTY_NODES: SceneNode[] = [];
const EMPTY_EDGES: SceneEdge[] = [];

export function ContextLinks({
  visualizationRef,
}: {
  visualizationRef: React.RefObject<VisualizationEngineRef | null>;
}) {
  const materialRefs = useRef<Array<THREE.ShaderMaterial | null>>([]);
  const linksScene = visualizationRef.current?.scene?.contextLinks;

  const gate = useMemo(() => {
    const scene = visualizationRef.current?.scene;
    const links = scene?.links;
    const valid = !!(
      scene &&
      links &&
      typeof links.segmentsPerEdge === 'number' &&
      links.segmentsPerEdge >= 1
    );
    const nodes = valid ? (scene!.clusters?.nodes ?? EMPTY_NODES) : EMPTY_NODES;
    const edges = valid ? (links!.edges ?? EMPTY_EDGES) : EMPTY_EDGES;
    const segmentsPerEdge = valid ? links!.segmentsPerEdge : 0;
    return { valid, nodes, edges, segmentsPerEdge };
  }, [visualizationRef.current?.scene]); // eslint-disable-line react-hooks/exhaustive-deps

  const edgeGeometries = useMemo(() => {
    if (!gate.valid || !gate.nodes.length || !gate.edges.length) {
      return [] as THREE.BufferGeometry[];
    }
    const { nodes, edges, segmentsPerEdge } = gate;
    const controlXAmp = linksScene?.bezierControlXAmp ?? 0.2;
    const controlYAmp = linksScene?.bezierControlYAmp ?? 0.1;
    const controlZAmp = linksScene?.bezierControlZAmp ?? 0.03;

    return edges.map(edge => {
      const start = nodes[edge.a]!.position;
      const end = nodes[edge.b]!.position;
      const color = nodes[edge.a]!.color;
      const vCount = segmentsPerEdge + 1;

      const positions = new Float32Array(vCount * 3);
      const tArr = new Float32Array(vCount);
      const startPoints = new Float32Array(vCount * 3);
      const endPoints = new Float32Array(vCount * 3);
      const strengths = new Float32Array(vCount);
      const pathIndices = new Float32Array(vCount);
      const colors = new Float32Array(vCount * 3);
      const indices: number[] = [];

      for (let i = 0; i <= segmentsPerEdge; i++) {
        const t = i / segmentsPerEdge;
        const p = sampleBezier(
          start,
          end,
          edge.pathIndex,
          controlXAmp,
          controlYAmp,
          controlZAmp,
          t,
        );
        positions[i * 3] = p[0];
        positions[i * 3 + 1] = p[1];
        positions[i * 3 + 2] = p[2];
        tArr[i] = t;
        startPoints[i * 3] = start[0];
        startPoints[i * 3 + 1] = start[1];
        startPoints[i * 3 + 2] = start[2];
        endPoints[i * 3] = end[0];
        endPoints[i * 3 + 1] = end[1];
        endPoints[i * 3 + 2] = end[2];
        strengths[i] = edge.strength;
        pathIndices[i] = edge.pathIndex;
        colors[i * 3] = color[0];
        colors[i * 3 + 1] = color[1];
        colors[i * 3 + 2] = color[2];
        if (i < segmentsPerEdge) indices.push(i, i + 1);
      }

      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      g.setAttribute('t', new THREE.BufferAttribute(tArr, 1));
      g.setAttribute('startPoint', new THREE.BufferAttribute(startPoints, 3));
      g.setAttribute('endPoint', new THREE.BufferAttribute(endPoints, 3));
      g.setAttribute(
        'connectionStrength',
        new THREE.BufferAttribute(strengths, 1),
      );
      g.setAttribute('pathIndex', new THREE.BufferAttribute(pathIndices, 1));
      g.setAttribute('connectionColor', new THREE.BufferAttribute(colors, 3));
      g.setIndex(new THREE.Uint16BufferAttribute(indices, 1));
      return g;
    });
  }, [gate, linksScene]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uActivity: { value: 0.1 },
      uPulseSpeed: { value: linksScene?.pulseSpeed ?? 4 },
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
    [linksScene],
  );

  useFrame((_, delta) => {
    const v = visualizationRef.current;
    if (!v) return;

    uniforms.uTime.value += delta;
    uniforms.uActivity.value = v.activity;
    const pulsePositions: [number, number, number][] = [
      [v.pulsePositions[0][0], v.pulsePositions[0][1], v.pulsePositions[0][2]],
      [v.pulsePositions[1][0], v.pulsePositions[1][1], v.pulsePositions[1][2]],
      [v.pulsePositions[2][0], v.pulsePositions[2][1], v.pulsePositions[2][2]],
    ];
    const pulseTimes = [v.pulseTimes[0], v.pulseTimes[1], v.pulseTimes[2]];
    const pulseColors: [number, number, number][] = [
      [v.pulseColors[0][0], v.pulseColors[0][1], v.pulseColors[0][2]],
      [v.pulseColors[1][0], v.pulseColors[1][1], v.pulseColors[1][2]],
      [v.pulseColors[2][0], v.pulseColors[2][1], v.pulseColors[2][2]],
    ];
    const eventPulse = getEventPulse(v, v.scene);
    injectEventPulse(pulsePositions, pulseTimes, pulseColors, eventPulse);

    uniforms.uPulsePositions.value[0].set(
      pulsePositions[0][0],
      pulsePositions[0][1],
      pulsePositions[0][2],
    );
    uniforms.uPulsePositions.value[1].set(
      pulsePositions[1][0],
      pulsePositions[1][1],
      pulsePositions[1][2],
    );
    uniforms.uPulsePositions.value[2].set(
      pulsePositions[2][0],
      pulsePositions[2][1],
      pulsePositions[2][2],
    );
    uniforms.uPulseTimes.value[0] = pulseTimes[0];
    uniforms.uPulseTimes.value[1] = pulseTimes[1];
    uniforms.uPulseTimes.value[2] = pulseTimes[2];
    uniforms.uPulseColors.value[0].set(
      pulseColors[0][0],
      pulseColors[0][1],
      pulseColors[0][2],
    );
    uniforms.uPulseColors.value[1].set(
      pulseColors[1][0],
      pulseColors[1][1],
      pulseColors[1][2],
    );
    uniforms.uPulseColors.value[2].set(
      pulseColors[2][0],
      pulseColors[2][1],
      pulseColors[2][2],
    );
    uniforms.uTouchInfluence.value = v.touchInfluence;

    for (const mat of materialRefs.current) {
      if (!mat?.uniforms) continue;
      mat.uniforms.uTime.value = uniforms.uTime.value;
      mat.uniforms.uActivity.value = uniforms.uActivity.value;
      mat.uniforms.uTouchInfluence.value = uniforms.uTouchInfluence.value;
      for (let i = 0; i < 3; i++) {
        mat.uniforms.uPulsePositions.value[i].copy(uniforms.uPulsePositions.value[i]);
        mat.uniforms.uPulseColors.value[i].copy(uniforms.uPulseColors.value[i]);
        mat.uniforms.uPulseTimes.value[i] = uniforms.uPulseTimes.value[i];
      }
    }
  });

  if (!gate.valid) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error(
        '[ContextLinks] visualizationRef.current.scene or scene.links is missing, or scene.links.segmentsPerEdge < 1. Set visualizationRef.current.scene = getSceneDescription() in the screen that mounts the viz.',
      );
    }
    return null;
  }

  const v = visualizationRef.current;
  const confidence = v?.signalsSnapshot?.confidence ?? 1;
  const requireFullIntensity = linksScene?.requireFullIntensity ?? true;
  const showConfidenceBelow = linksScene?.showConfidenceBelow ?? 0.7;
  const isCorrectIntensity = requireFullIntensity
    ? v?.vizIntensity === 'full'
    : v?.vizIntensity !== 'off';
  const showLinks = isCorrectIntensity && confidence < showConfidenceBelow;
  if (!SHADER_DEBUG_FLAGS.contextLinks || !showLinks || edgeGeometries.length === 0) {
    return null;
  }

  const scene = visualizationRef.current?.scene;
  const linksRenderOrderBase = scene?.layers?.links?.renderOrderBase ?? 3200;

  return (
    <>
      {edgeGeometries.map((geom, edgeIndex) => (
        <lineSegments
          key={`edge-${edgeIndex}`}
          geometry={geom}
          renderOrder={linksRenderOrderBase + edgeIndex}
        >
          <shaderMaterial
            ref={mat => {
              materialRefs.current[edgeIndex] = mat;
            }}
            attach="material"
            vertexShader={connectionVertex}
            fragmentShader={connectionFragment}
            uniforms={uniforms}
            transparent
            depthWrite={false}
            blending={THREE.NormalBlending}
          />
        </lineSegments>
      ))}
    </>
  );
}
