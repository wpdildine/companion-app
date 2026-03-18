/**
 * Context glyphs: two clusters (rules + cards), breathing + drift + glow. Counts from visualizationRef; no glyphs when no evidence.
 * All positions and colors from visualizationRef.current.scene.clusters.nodes (no fallback constants).
 */

import { useCallback, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';
import { nodeVertex, nodeFragment } from '../../materials/glyphs/nodes';
import { logInfo } from '../../../shared/logging';
import { getLayerRuntimeInputs } from '../../runtime/runtimeLayerInputs';
import type { VisualizationEngineRef } from '../../runtime/runtimeTypes';
import { useVizIsolationGate } from '../../runtime/VizRuntimeIsolationContext';
import type { LayerDescriptor } from '../../scene/layerDescriptor';
import { SHADER_DEBUG_FLAGS } from '../canvas/shaderDebugFlags';
import { getDescriptorRenderOrderBase } from './descriptorRenderOrder';
import { getEventPulse, injectEventPulse } from '../utils/eventPulse';

type GlyphBuffers = {
  positions: Float32Array;
  nodeSizes: Float32Array;
  nodeTypes: Float32Array;
  nodeColors: Float32Array;
  distanceFromRoot: Float32Array;
  decayPhase: Float32Array;
  decayRate: Float32Array;
  decayDepth: Float32Array;
  visible: Float32Array;
  clusterId: Float32Array;
  globalIndices: number[];
};

function buildGlyphBuffers(
  nodes: NonNullable<VisualizationEngineRef['scene']>['clusters']['nodes'],
  indices: number[],
  seeds: {
    phaseSeed: number;
    rateSeed: number;
    depthSeed: number;
    rateMin: number;
    rateMax: number;
    depthMin: number;
    depthMax: number;
  },
): GlyphBuffers {
  const n = indices.length;
  const positions = new Float32Array(n * 3);
  const nodeSizes = new Float32Array(n);
  const nodeTypes = new Float32Array(n);
  const nodeColors = new Float32Array(n * 3);
  const distanceFromRoot = new Float32Array(n);
  const decayPhase = new Float32Array(n);
  const decayRate = new Float32Array(n);
  const decayDepth = new Float32Array(n);
  const visible = new Float32Array(Math.max(1, n));
  const clusterId = new Float32Array(n);

  for (let local = 0; local < n; local++) {
    const global = indices[local]!;
    const node = nodes[global]!;
    const clusterNode = node as { clusterId?: number };
    positions[local * 3] = node.position[0];
    positions[local * 3 + 1] = node.position[1];
    positions[local * 3 + 2] = node.position[2];
    nodeSizes[local] = node.size;
    nodeTypes[local] = node.type;
    nodeColors[local * 3] = node.color[0];
    nodeColors[local * 3 + 1] = node.color[1];
    nodeColors[local * 3 + 2] = node.color[2];
    distanceFromRoot[local] = node.distanceFromRoot;
    clusterId[local] = clusterNode.clusterId ?? (global < (nodes.length / 2) ? 0 : 1);

    const i = global + 1;
    const r1 = Math.abs(Math.sin(i * seeds.phaseSeed));
    const r2 = Math.abs(Math.sin(i * seeds.rateSeed));
    const r3 = Math.abs(Math.sin(i * seeds.depthSeed));
    decayPhase[local] = r1 * Math.PI * 2;
    decayRate[local] = seeds.rateMin + r2 * (seeds.rateMax - seeds.rateMin);
    decayDepth[local] = seeds.depthMin + r3 * (seeds.depthMax - seeds.depthMin);
  }

  return {
    positions,
    nodeSizes,
    nodeTypes,
    nodeColors,
    distanceFromRoot,
    decayPhase,
    decayRate,
    decayDepth,
    visible,
    clusterId,
    globalIndices: indices,
  };
}

export function ContextGlyphs({
  visualizationRef,
  descriptor,
}: {
  visualizationRef: React.RefObject<VisualizationEngineRef | null>;
  descriptor?: LayerDescriptor;
}) {
  const scene = visualizationRef.current?.scene;
  const glyphsScene = scene?.contextGlyphs;
  const nodes = useMemo(
    () => scene?.clusters?.nodes ?? [],
    [scene?.clusters?.nodes],
  );
  const N = nodes.length;

  const backRef = useRef<THREE.Points>(null);
  const frontRef = useRef<THREE.Points>(null);
  const viewMatrixRef = useRef(new THREE.Matrix4());
  const projectionMatrixRef = useRef(new THREE.Matrix4());

  const seeds = useMemo(
    () => ({
      phaseSeed: glyphsScene?.decayPhaseSeed ?? 12.9898,
      rateSeed: glyphsScene?.decayRateSeed ?? 78.233,
      depthSeed: glyphsScene?.decayDepthSeed ?? 37.719,
      rateMin: glyphsScene?.decayRateMin ?? 0.25,
      rateMax: glyphsScene?.decayRateMax ?? 1.4,
      depthMin: glyphsScene?.decayDepthMin ?? 0.12,
      depthMax: glyphsScene?.decayDepthMax ?? 0.47,
    }),
    [glyphsScene],
  );

  const { backIndices, frontIndices } = useMemo(() => {
    const back: number[] = [];
    const front: number[] = [];
    for (let i = 0; i < nodes.length; i++) {
      if ((nodes[i]?.position?.[2] ?? 0) <= 0) back.push(i);
      else front.push(i);
    }
    return { backIndices: back, frontIndices: front };
  }, [nodes]);

  const backBuffers = useMemo(
    () => buildGlyphBuffers(nodes, backIndices, seeds),
    [nodes, backIndices, seeds],
  );
  const frontBuffers = useMemo(
    () => buildGlyphBuffers(nodes, frontIndices, seeds),
    [nodes, frontIndices, seeds],
  );

  const createGeometry = (b: GlyphBuffers) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(b.positions, 3));
    g.setAttribute('nodeSize', new THREE.BufferAttribute(b.nodeSizes, 1));
    g.setAttribute('nodeType', new THREE.BufferAttribute(b.nodeTypes, 1));
    g.setAttribute('nodeColor', new THREE.BufferAttribute(b.nodeColors, 3));
    g.setAttribute(
      'distanceFromRoot',
      new THREE.BufferAttribute(b.distanceFromRoot, 1),
    );
    g.setAttribute('decayPhase', new THREE.BufferAttribute(b.decayPhase, 1));
    g.setAttribute('decayRate', new THREE.BufferAttribute(b.decayRate, 1));
    g.setAttribute('decayDepth', new THREE.BufferAttribute(b.decayDepth, 1));
    g.setAttribute('visible', new THREE.BufferAttribute(b.visible, 1));
    g.setAttribute('clusterId', new THREE.BufferAttribute(b.clusterId, 1));
    return g;
  };

  const backGeom = useMemo(() => createGeometry(backBuffers), [backBuffers]);
  const frontGeom = useMemo(() => createGeometry(frontBuffers), [frontBuffers]);

  const MODE_TO_ID: Record<string, number> = {
    idle: 0,
    listening: 1,
    processing: 2,
    speaking: 3,
    touched: 4,
    released: 5,
  };

  const opacityScaleBack = glyphsScene?.opacityScaleBack ?? 0.72;
  const opacityScaleFront = glyphsScene?.opacityScaleFront ?? 1;
  const scaleBack = glyphsScene?.scaleBack ?? 0.88;
  const scaleFront = glyphsScene?.scaleFront ?? 1.05;
  const motionGainBack = glyphsScene?.motionGainBack ?? 0.7;
  const motionGainFront = glyphsScene?.motionGainFront ?? 0.95;

  const makeUniforms = useCallback(
    (uOpacityScale: number, uScale: number, uGlyphMotionGain: number) => ({
      uTime: { value: 0 },
      uActivity: { value: 0.1 },
      uMode: { value: 0 },
      uBaseNodeSize: { value: glyphsScene?.baseNodeSize ?? 5.25 },
      uPulseSpeed: { value: glyphsScene?.pulseSpeed ?? 4 },
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
      uTouchRadius: { value: glyphsScene?.touchRadius ?? 3.6 },
      uTouchStrength: { value: glyphsScene?.touchStrength ?? 2.8 },
      uTouchMaxOffset: { value: glyphsScene?.touchMaxOffset ?? 1.35 },
      uFocusBias: { value: 0 },
      uMotionOpenness: { value: 0 },
      uMotionAttention: { value: 0 },
      uMotionSettle: { value: 0 },
      uMotionMicro: { value: 0 },
      uMotionAxisX: { value: 1 },
      uMotionAxisY: { value: 1 },
      uGlyphMotionGain: { value: uGlyphMotionGain },
      uOpacityScale: { value: uOpacityScale },
      uScale: { value: uScale },
    }),
    [glyphsScene],
  );

  const backUniforms = useMemo(
    () => makeUniforms(opacityScaleBack, scaleBack, motionGainBack),
    [opacityScaleBack, scaleBack, motionGainBack, makeUniforms],
  );
  const frontUniforms = useMemo(
    () => makeUniforms(opacityScaleFront, scaleFront, motionGainFront),
    [opacityScaleFront, scaleFront, motionGainFront, makeUniforms],
  );

  const loggedRef = useRef(false);
  const r3fFrameOn = useVizIsolationGate('r3f_frame');

  useFrame((state, delta) => {
    if (!r3fFrameOn) return;
    const v = visualizationRef.current;
    if (!v) return;
    const runtime = getLayerRuntimeInputs(v);
    if (!loggedRef.current) {
      loggedRef.current = true;
      logInfo('Visualization', 'ContextGlyphs mount state', {
        vizIntensity: v.vizIntensity,
        rulesClusterCount: v.rulesClusterCount,
        cardsClusterCount: v.cardsClusterCount,
        nodesCount: v.scene?.clusters?.nodes?.length ?? 0,
        shaderFlag: SHADER_DEBUG_FLAGS.contextGlyphs,
      });
    }
    let rulesCount = v.rulesClusterCount ?? 0;
    let cardsCount = v.cardsClusterCount ?? 0;
    if (typeof __DEV__ !== 'undefined' && __DEV__ && rulesCount === 0 && cardsCount === 0) {
      const nodesCount = nodes.length;
      const maxPer = v.scene?.maxPerCluster ?? 8;
      rulesCount = Math.min(nodesCount, maxPer);
      cardsCount = Math.max(0, Math.min(nodesCount - rulesCount, maxPer));
    }
    const maxPer = v.scene?.maxPerCluster ?? 8;

    const applyVisibility = (geom: THREE.BufferGeometry, b: GlyphBuffers) => {
      for (let i = 0; i < b.globalIndices.length; i++) {
        const global = b.globalIndices[i]!;
        if (global < maxPer) b.visible[i] = global < rulesCount ? 1 : 0;
        else b.visible[i] = global - maxPer < cardsCount ? 1 : 0;
      }
      const visibleAttr = geom.getAttribute('visible');
      if (visibleAttr) visibleAttr.needsUpdate = true;
    };
    const relaxSpeed = glyphsScene?.relaxSpeed ?? 2;
    const blendFactor = 1 - Math.exp(-relaxSpeed * Math.min(delta, 0.1));
    const blendPositions = (geom: THREE.BufferGeometry, b: GlyphBuffers) => {
      const pos = b.positions;
      for (let i = 0; i < b.globalIndices.length; i++) {
        const global = b.globalIndices[i]!;
        const node = nodes[global];
        if (!node) continue;
        const tx = node.position[0];
        const ty = node.position[1];
        const tz = node.position[2];
        const ix = i * 3;
        pos[ix] += (tx - pos[ix]) * blendFactor;
        pos[ix + 1] += (ty - pos[ix + 1]) * blendFactor;
        pos[ix + 2] += (tz - pos[ix + 2]) * blendFactor;
      }
      const posAttr = geom.getAttribute('position');
      if (posAttr) posAttr.needsUpdate = true;
    };

    applyVisibility(backGeom, backBuffers);
    applyVisibility(frontGeom, frontBuffers);
    blendPositions(backGeom, backBuffers);
    blendPositions(frontGeom, frontBuffers);

    const axisDebugOn =
      typeof __DEV__ !== 'undefined' &&
      __DEV__ &&
      !!v.motionAxisDebug?.enabled;
    const debugGlyphGain = axisDebugOn ? Math.max(0, v.motionAxisDebug?.glyphMotionGain ?? 1) : null;
    let axisX = 1;
    let axisY = 1;
    if (axisDebugOn) {
      const mode = v.motionAxisDebug?.axisLockMode ?? 'none';
      const xGain = Math.max(0, v.motionAxisDebug?.xGain ?? 1);
      const yGain = Math.max(0, v.motionAxisDebug?.yGain ?? 1);
      if (mode === 'x') {
        axisX = 1;
        axisY = 0;
      } else if (mode === 'y') {
        axisX = 0;
        axisY = 1;
      } else {
        axisX = xGain;
        axisY = yGain;
      }
    }
    const organism = v.scene?.organism;
    const motion = v.scene?.motion;
    const tw = v.touchWorld;

    const pulsePositions: [number, number, number][] = [
      [runtime.pulsePositions?.[0]?.[0] ?? 1e6, runtime.pulsePositions?.[0]?.[1] ?? 1e6, runtime.pulsePositions?.[0]?.[2] ?? 1e6],
      [runtime.pulsePositions?.[1]?.[0] ?? 1e6, runtime.pulsePositions?.[1]?.[1] ?? 1e6, runtime.pulsePositions?.[1]?.[2] ?? 1e6],
      [runtime.pulsePositions?.[2]?.[0] ?? 1e6, runtime.pulsePositions?.[2]?.[1] ?? 1e6, runtime.pulsePositions?.[2]?.[2] ?? 1e6],
    ];
    const pulseTimes = [
      runtime.pulseTimes?.[0] ?? -1e3,
      runtime.pulseTimes?.[1] ?? -1e3,
      runtime.pulseTimes?.[2] ?? -1e3,
    ];
    const pulseColors: [number, number, number][] = [
      [runtime.pulseColors?.[0]?.[0] ?? 1, runtime.pulseColors?.[0]?.[1] ?? 1, runtime.pulseColors?.[0]?.[2] ?? 1],
      [runtime.pulseColors?.[1]?.[0] ?? 1, runtime.pulseColors?.[1]?.[1] ?? 1, runtime.pulseColors?.[1]?.[2] ?? 1],
      [runtime.pulseColors?.[2]?.[0] ?? 1, runtime.pulseColors?.[2]?.[1] ?? 1, runtime.pulseColors?.[2]?.[2] ?? 1],
    ];
    const eventPulse = getEventPulse(v, scene);
    injectEventPulse(pulsePositions, pulseTimes, pulseColors, eventPulse);

    for (const u of [backUniforms, frontUniforms]) {
      u.uTime.value += delta;
      u.uActivity.value = runtime.activity ?? 0;
      u.uMode.value =
        MODE_TO_ID[(runtime.displayMode ?? runtime.mode ?? 'idle') as keyof typeof MODE_TO_ID] ?? 0;
      u.uPulsePositions.value[0].set(pulsePositions[0][0], pulsePositions[0][1], pulsePositions[0][2]);
      u.uPulsePositions.value[1].set(pulsePositions[1][0], pulsePositions[1][1], pulsePositions[1][2]);
      u.uPulsePositions.value[2].set(pulsePositions[2][0], pulsePositions[2][1], pulsePositions[2][2]);
      u.uPulseTimes.value[0] = pulseTimes[0];
      u.uPulseTimes.value[1] = pulseTimes[1];
      u.uPulseTimes.value[2] = pulseTimes[2];
      u.uPulseColors.value[0].set(pulseColors[0][0], pulseColors[0][1], pulseColors[0][2]);
      u.uPulseColors.value[1].set(pulseColors[1][0], pulseColors[1][1], pulseColors[1][2]);
      u.uPulseColors.value[2].set(pulseColors[2][0], pulseColors[2][1], pulseColors[2][2]);
      u.uTouchWorld.value.set(tw ? tw[0] : 1e6, tw ? tw[1] : 1e6, tw ? tw[2] : 1e6);
      u.uTouchInfluence.value = v.touchInfluence;
      u.uFocusBias.value = organism ? organism.focusBias : 0;
      u.uMotionOpenness.value = motion ? motion.openness : 0;
      u.uMotionAttention.value = motion ? motion.attention : 0;
      u.uMotionSettle.value = motion ? motion.settle : 0;
      u.uMotionMicro.value = motion ? motion.microMotion : 0;
      u.uMotionAxisX.value = axisX;
      u.uMotionAxisY.value = axisY;
      if (debugGlyphGain != null) u.uGlyphMotionGain.value = debugGlyphGain;
    }

    viewMatrixRef.current.copy(state.camera.matrixWorldInverse);
    projectionMatrixRef.current.copy(state.camera.projectionMatrix);

    const meshes = [
      { ref: backRef.current, u: backUniforms },
      { ref: frontRef.current, u: frontUniforms },
    ];
    for (const { ref: mesh } of meshes) {
      if (!mesh) continue;
      mesh.rotation.set(0, 0, 0);
      const mat = mesh.material as THREE.ShaderMaterial;
      if (!mat.uniforms) continue;
      mat.uniforms.uViewMatrix.value.copy(viewMatrixRef.current);
      mat.uniforms.uProjectionMatrix.value.copy(projectionMatrixRef.current);
      mat.uniforms.uModelMatrix.value.copy(mesh.matrixWorld);
    }
  });

  if (visualizationRef.current?.vizIntensity === 'off') {
    return null;
  }
  if (!SHADER_DEBUG_FLAGS.contextGlyphs) {
    return null;
  }
  if (N === 0) {
    if (typeof __DEV__ !== 'undefined' && __DEV__ && visualizationRef.current && !scene?.clusters?.nodes?.length) {
      console.error(
        '[ContextGlyphs] scene.clusters.nodes is missing or empty. Set visualizationRef.current.scene = getSceneDescription() in the screen that mounts the viz.',
      );
    }
    return null;
  }

  const layers = scene?.layers;
  const glyphsBackRo = getDescriptorRenderOrderBase(
    scene,
    descriptor,
    'glyphsBack',
    1500,
  );
  const glyphsFrontRo = getDescriptorRenderOrderBase(
    scene,
    descriptor,
    'glyphsFront',
    3500,
  );

  return (
    <>
      <points ref={backRef} geometry={backGeom} renderOrder={glyphsBackRo}>
        <shaderMaterial
          attach="material"
          vertexShader={nodeVertex}
          fragmentShader={nodeFragment}
          uniforms={backUniforms}
          transparent
          depthWrite={false}
          blending={THREE.NormalBlending}
        />
      </points>
      <points ref={frontRef} geometry={frontGeom} renderOrder={glyphsFrontRo}>
        <shaderMaterial
          attach="material"
          vertexShader={nodeVertex}
          fragmentShader={nodeFragment}
          uniforms={frontUniforms}
          transparent
          depthWrite={false}
          blending={THREE.NormalBlending}
        />
      </points>
    </>
  );
}
