/**
 * Spine planes: 5-plane AI channel. Dumb renderer: all layout and style from
 * nodeMapRef.current.scene.spine; spread interpolation uses scene transition/easing only.
 * Same envelope convention as TouchZones (active region NDC, centerY = 0 = center of active region).
 */

import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { CanonicalSpineMode } from '../helpers/formations/spine';
import { validateSceneDescription } from '../helpers/validateSceneDescription';
import type { NodeMapEngineRef } from '../types';

const EDGE_HALFTONE_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Per-plane halftone: same screen-space pattern but uPlanePhase individualizes each mesh. */
const PLANE_HALFTONE_FRAGMENT = `
precision mediump float;
varying vec2 vUv;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uIntensity;
uniform float uDensity;
uniform float uTime;
uniform vec2 uResolution;
uniform float uPlanePhase;
uniform vec2 uPlaneSize;

void main() {
  // World-unit grid: stable isotropic spacing regardless of plane aspect/scale.
  float densityScale = mix(0.85, 1.35, clamp(uDensity / 2.5, 0.0, 1.0));
  float cellSize = 0.065 / densityScale;
  vec2 phase = vec2(uPlanePhase * 0.013, uPlanePhase * 0.021);
  vec2 p = vUv * uPlaneSize + phase;
  vec2 cell = fract(p / cellSize) - 0.5;
  float d = length(cell) * cellSize;
  float dotRadius = cellSize * 0.26;
  float dotFeather = cellSize * 0.08;
  float dotMask = 1.0 - smoothstep(dotRadius, dotRadius + dotFeather, d);

  // Keep pattern strictly inside each plane bounds.
  float edgeX = smoothstep(0.03, 0.06, vUv.x) * smoothstep(0.03, 0.06, 1.0 - vUv.x);
  float edgeY = smoothstep(0.03, 0.06, vUv.y) * smoothstep(0.03, 0.06, 1.0 - vUv.y);
  float interiorMask = edgeX * edgeY;

  // True cutout: no baseline fill between dots.
  float a = uOpacity * clamp(uIntensity, 0.0, 1.0) * dotMask * interiorMask;
  if (a < 0.008) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

/**
 * Map engine currentMode to canonical spine mode. Non-canonical modes (touched, released)
 * map to idle so spread/halftone profiles always have a valid key.
 */
function toCanonicalMode(mode: string): CanonicalSpineMode {
  switch (mode) {
    case 'idle':
    case 'listening':
    case 'processing':
    case 'speaking':
      return mode;
    case 'touched':
    case 'released':
    default:
      return 'idle';
  }
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeCubic(t: number): number {
  return t * t * t;
}

function applyEasing(
  t: number,
  easing: 'cubic' | 'inOutCubic' | undefined,
): number {
  if (easing === 'inOutCubic') return easeInOutCubic(t);
  return easeCubic(t);
}

export function Spine({
  nodeMapRef,
}: {
  nodeMapRef: React.RefObject<NodeMapEngineRef | null>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const planeRefs = useRef<(THREE.Mesh | null)[]>([]);
  /** Per-plane materials so R3F never shares one material across planes (ensures planeColors read). */
  const planeMaterialsRef = useRef<THREE.MeshBasicMaterial[] | null>(null);
  if (!planeMaterialsRef.current) {
    const PLANE_COLORS = [
      '#8a9fc9',
      '#9eb3e0',
      '#c5dcff',
      '#a2b8e8',
      '#889bc4',
    ];
    planeMaterialsRef.current = PLANE_COLORS.map(
      color =>
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          toneMapped: false,
          depthWrite: false,
          depthTest: false,
          side: THREE.DoubleSide,
        }),
    );
  }
  const planeMats = planeMaterialsRef.current;

  /** Per-plane halftone shader materials (swap via spineUseHalftonePlanes). */
  const planeHalftoneMatsRef = useRef<THREE.ShaderMaterial[] | null>(null);
  if (!planeHalftoneMatsRef.current) {
    planeHalftoneMatsRef.current = Array.from({ length: 5 }, (_, i) => {
      return new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color() },
          uOpacity: { value: 0.6 },
          uIntensity: { value: 0 },
          uDensity: { value: 1 },
          uTime: { value: 0 },
          uResolution: { value: new THREE.Vector2(1, 1) },
          uPlanePhase: { value: i * 1.7 },
          uPlaneSize: { value: new THREE.Vector2(1, 1) },
        },
        vertexShader: EDGE_HALFTONE_VERTEX,
        fragmentShader: PLANE_HALFTONE_FRAGMENT,
        transparent: true,
        toneMapped: false,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
      });
    });
  }
  const planeHalftoneMats = planeHalftoneMatsRef.current;

  useEffect(
    () => () => {
      planeMats.forEach(m => m.dispose());
      planeHalftoneMats.forEach(m => m.dispose());
    },
    [planeMats, planeHalftoneMats],
  );
  const shardRefs = useRef<(THREE.Mesh | null)[]>([]);
  const leftEdgeRef = useRef<THREE.Mesh>(null);
  const rightEdgeRef = useRef<THREE.Mesh>(null);
  const leftEdgeMatRef = useRef<THREE.ShaderMaterial>(null);
  const rightEdgeMatRef = useRef<THREE.ShaderMaterial>(null);
  const leftEdgeUniformsRef = useRef({
    uColor: { value: new THREE.Color() },
    uOpacity: { value: 0 },
    uIntensity: { value: 0 },
    uDensity: { value: 1 },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uPlanePhase: { value: 0 },
    uPlaneSize: { value: new THREE.Vector2(1, 1) },
  });
  const rightEdgeUniformsRef = useRef({
    uColor: { value: new THREE.Color() },
    uOpacity: { value: 0 },
    uIntensity: { value: 0 },
    uDensity: { value: 1 },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uPlanePhase: { value: 0 },
    uPlaneSize: { value: new THREE.Vector2(1, 1) },
  });
  const cameraPosRef = useRef(new THREE.Vector3());
  const cameraDirRef = useRef(new THREE.Vector3());
  const cameraUpRef = useRef(new THREE.Vector3());
  const cameraRightRef = useRef(new THREE.Vector3());
  const rampRef = useRef(0);
  const currentSpreadRef = useRef({
    verticalSpread: 1,
    bandWidth: 1,
    depthSpread: 1,
  });
  const prevSpreadRef = useRef({
    verticalSpread: 1,
    bandWidth: 1,
    depthSpread: 1,
  });
  const lastCanonicalModeRef = useRef<CanonicalSpineMode>('idle');

  useFrame((state, delta) => {
    const v = nodeMapRef.current;
    if (!v) return;
    const scene = v.scene;
    const spine = scene?.spine;
    if (!spine) return;

    const show = v.vizIntensity !== 'off';
    if (!groupRef.current) return;
    groupRef.current.visible = show;
    if (!show) return;

    const w = v.canvasWidth > 0 ? v.canvasWidth : state.size.width;
    const h = v.canvasHeight > 0 ? v.canvasHeight : state.size.height;
    const hasSize = w > 0 && h > 0;
    if (!hasSize) return;

    const { layout } = scene.zones;
    const bandTopInsetPx = layout.bandTopInsetPx;
    const activeHeightRatio = Math.max(
      0,
      Math.min(1, (h - bandTopInsetPx) / h),
    );
    const centerNdcY = -(bandTopInsetPx / h);

    const cam = state.camera as THREE.PerspectiveCamera;
    const fovDeg = typeof cam.fov === 'number' ? cam.fov : 60;
    const overlayDistance = spine.style.overlayDistance;
    const viewHeight =
      2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) * 0.5) * overlayDistance;
    const aspect = h > 0 ? w / h : 1;
    const viewWidth = viewHeight * aspect;
    const activeHeight = viewHeight * activeHeightRatio;

    const canonicalMode = toCanonicalMode(v.currentMode);
    if (canonicalMode !== lastCanonicalModeRef.current) {
      prevSpreadRef.current = { ...currentSpreadRef.current };
      lastCanonicalModeRef.current = canonicalMode;
      rampRef.current = canonicalMode === 'processing' ? 1 : 0;
    }
    const targetProfile = spine.spreadProfiles[canonicalMode];
    const halftoneProfile = spine.halftoneProfiles[canonicalMode];
    const rampingDown =
      targetProfile.verticalSpread <= prevSpreadRef.current.verticalSpread;
    const transitionMs = rampingDown
      ? spine.transitionMsOut
      : spine.transitionMsIn;
    const deltaRamp = (delta * 1000) / Math.max(1, transitionMs);
    rampRef.current = Math.min(1, rampRef.current + deltaRamp);
    const eased = applyEasing(rampRef.current, spine.easing);
    const prev = prevSpreadRef.current;
    currentSpreadRef.current = {
      verticalSpread:
        prev.verticalSpread +
        (targetProfile.verticalSpread - prev.verticalSpread) * eased,
      bandWidth:
        prev.bandWidth + (targetProfile.bandWidth - prev.bandWidth) * eased,
      depthSpread:
        prev.depthSpread +
        (targetProfile.depthSpread - prev.depthSpread) * eased,
    };

    const spread = currentSpreadRef.current;
    const idleBreathHz = spine.style.idleBreathHz ?? 0;
    const idleBreathAmp = spine.style.idleBreathAmp ?? 0;
    const processingMotionBoost = spine.style.processingMotionBoost ?? 1;
    const processingExtraOverlap = spine.style.processingExtraOverlap ?? 0;
    const processingHeightBoost = spine.style.processingHeightBoost ?? 1;
    const processingEdgeBoost = spine.style.processingEdgeBoost ?? 1;
    const perPlaneDriftScale = spine.style.perPlaneDriftScale ?? 0;
    const perPlaneDriftPhaseStep = spine.style.perPlaneDriftPhaseStep ?? 0;

    const idleBreath =
      canonicalMode === 'idle' || canonicalMode === 'listening'
        ? 1 +
          Math.sin(v.clock * 2 * Math.PI * idleBreathHz) * idleBreathAmp
        : 1;
    const effectiveVerticalSpread = spread.verticalSpread * idleBreath;
    const effectiveBandWidth = spread.bandWidth * idleBreath;
    const isProcessing = canonicalMode === 'processing';
    const processingOverflow = isProcessing
      ? spine.style.processingOverflowBoost
      : 1;
    const viewW = viewWidth;
    const actH = activeHeight;
    const envelopeWidthWorld =
      viewW * spine.envelopeNdc.width * effectiveBandWidth * processingOverflow;
    const envelopeHeightWorld =
      actH * (spine.envelopeNdc.height / 2) * effectiveVerticalSpread;
    const spineCenterWorldY =
      centerNdcY * (viewHeight * 0.5) +
      spine.envelopeNdc.centerY * (activeHeight * 0.5);
    const zStep = spine.style.zStep * spread.depthSpread;

    cam.getWorldPosition(cameraPosRef.current);
    cam.getWorldDirection(cameraDirRef.current);
    cameraUpRef.current.copy(cam.up).normalize();
    cameraRightRef.current
      .crossVectors(cameraDirRef.current, cameraUpRef.current)
      .normalize();

    let driftFactor = 0;
    if (!v.reduceMotion) {
      driftFactor =
        canonicalMode === 'idle'
          ? 1
          : canonicalMode === 'listening'
          ? 1.25
          : canonicalMode === 'processing'
          ? 1.45
          : 0.6;
    }
    const driftRate =
      spine.style.driftHz *
      (isProcessing
        ? spine.style.processingOverflowBoost *
          processingMotionBoost
        : 1);
    const driftX =
      envelopeWidthWorld *
      spine.style.driftAmpX *
      driftFactor *
      Math.sin(v.clock * driftRate * 2 * Math.PI);
    const driftY =
      envelopeHeightWorld *
      spine.style.driftAmpY *
      driftFactor *
      Math.cos(v.clock * driftRate * 1.7 * 2 * Math.PI);

    groupRef.current.position
      .copy(cameraPosRef.current)
      .add(cameraDirRef.current.multiplyScalar(overlayDistance))
      .addScaledVector(cameraRightRef.current, driftX)
      .addScaledVector(cameraUpRef.current, spineCenterWorldY + driftY);
    groupRef.current.quaternion.copy(cam.quaternion);

    const planeCount = spine.planeCount;
    const gap =
      spine.style.planeGap +
      (isProcessing ? processingExtraOverlap : 0);
    const unitHeight =
      envelopeHeightWorld / (planeCount + gap * (planeCount - 1));
    const totalHeight = unitHeight * (planeCount + gap * (planeCount - 1));
    const halfHeight = totalHeight / 2;
    const dynamicOpacityBoost = 1 + halftoneProfile.intensity * 0.7;

    const halftonePlaneIndex = Math.floor((planeCount - 1) / 2);
    const pixelRatio = Math.max(1, state.gl.getPixelRatio?.() ?? 1);
    const resX = w * pixelRatio;
    const resY = h * pixelRatio;
    const edgeIntensity = Math.max(0, Math.min(1, halftoneProfile.intensity));

    for (let i = 0; i < planeCount; i++) {
      const mesh = planeRefs.current[i];
      if (!mesh) continue;
      const widthScale = spine.style.planeWidthScale[i] ?? 1;
      const baseHeightScale = spine.style.planeHeightScale?.[i] ?? 1;
      const heightScale =
        baseHeightScale *
        (isProcessing ? processingHeightBoost : 1);
      const offsetX = spine.style.planeOffsetX[i] ?? 0;
      const opacityScale = spine.style.planeOpacityScale[i] ?? 1;
      const offsetY =
        (spine.style.planeOffsetY?.[i] ?? 0) * envelopeHeightWorld;
      const localY =
        -halfHeight + unitHeight * (i + 0.5) + unitHeight * gap * i + offsetY;

      const perPlanePhase = i * perPlaneDriftPhaseStep;
      const scale = perPlaneDriftScale;
      const perPlaneX =
        envelopeWidthWorld *
        spine.style.driftAmpX *
        driftFactor *
        scale *
        Math.sin(v.clock * driftRate * 2 * Math.PI + perPlanePhase);
      const perPlaneY =
        envelopeHeightWorld *
        spine.style.driftAmpY *
        driftFactor *
        scale *
        Math.cos(v.clock * driftRate * 1.7 * 2 * Math.PI + perPlanePhase);

      mesh.position.set(
        envelopeWidthWorld * offsetX + perPlaneX,
        localY + perPlaneY,
        (i - (planeCount - 1) / 2) * zStep,
      );
      mesh.scale.set(
        envelopeWidthWorld * widthScale,
        unitHeight * heightScale,
        1,
      );

      const planeUsesHalftone = i === halftonePlaneIndex;
      mesh.material = planeUsesHalftone ? planeHalftoneMats[i] : planeMats[i];

      const planeColor = spine.style.planeColors?.[i] ?? spine.style.color;
      const planeOpacity =
        spine.style.opacity * opacityScale * dynamicOpacityBoost;
      const blending =
        spine.style.blend === 'additive'
          ? THREE.AdditiveBlending
          : THREE.NormalBlending;

      if (planeUsesHalftone) {
        const hm = planeHalftoneMats[i];
        hm.uniforms.uColor.value.set(planeColor);
        hm.uniforms.uOpacity.value = Math.min(1, planeOpacity * 1.7);
        // Keep center plane clearly visible across modes.
        hm.uniforms.uIntensity.value = Math.max(0.72, edgeIntensity);
        hm.uniforms.uDensity.value = halftoneProfile.density;
        hm.uniforms.uTime.value = v.clock;
        hm.uniforms.uResolution.value.set(resX, resY);
        hm.uniforms.uPlanePhase.value = i * 1.7;
        const planeW = envelopeWidthWorld * widthScale;
        const planeH = unitHeight * heightScale;
        hm.uniforms.uPlaneSize.value.set(planeW, planeH);
        hm.blending = THREE.AdditiveBlending;
      } else {
        const mat = planeMats[i];
        mat.color.set(planeColor);
        mat.opacity = planeOpacity;
        mat.blending = blending;
      }
    }

    const edgeBandWidth =
      spine.style.edgeBandWidth *
      (isProcessing ? processingEdgeBoost : 1);
    const edgeWidth = envelopeWidthWorld * edgeBandWidth;
    const edgeHeight = envelopeHeightWorld;
    const edgeOffset = envelopeWidthWorld * 0.5 - edgeWidth * 0.5;
    // Two strips only: uncovered center = envelopeWidthWorld - 2*edgeWidth = (1 - 2*edgeBandWidth) of spine.
    // With edgeBandWidth 0.22 that's 56% with no halftone ("halftone | nothing | halftone"). For full-surface
    // halftone use spineUseHalftonePlanes (per-plane shader) so the planes themselves carry the pattern.
    const edgeVisible = false;
    if (leftEdgeRef.current) {
      leftEdgeRef.current.visible = edgeVisible;
      leftEdgeRef.current.position.set(-edgeOffset, 0, zStep * 0.4);
      leftEdgeRef.current.scale.set(edgeWidth, edgeHeight, 1);
    }
    if (rightEdgeRef.current) {
      rightEdgeRef.current.visible = edgeVisible;
      rightEdgeRef.current.position.set(edgeOffset, 0, zStep * 0.4);
      rightEdgeRef.current.scale.set(edgeWidth, edgeHeight, 1);
    }
    const shards = spine.shards ?? [];
    const shardWidthScale = spine.style.shardWidthScale ?? 0.28;
    for (let s = 0; s < shards.length; s++) {
      const mesh = shardRefs.current[s];
      const shard = shards[s];
      if (!mesh || !shard) continue;
      mesh.position.set(
        envelopeWidthWorld * shard.offsetX,
        0,
        shard.zOffset * zStep,
      );
      mesh.scale.set(
        envelopeWidthWorld * shardWidthScale,
        unitHeight * shard.heightScale,
        1,
      );
      if (mesh.material) {
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.color.set(spine.style.color);
        mat.opacity =
          spine.style.opacity * shard.opacityScale * dynamicOpacityBoost;
      }
    }

    for (const matRef of [leftEdgeMatRef, rightEdgeMatRef]) {
      const mat = matRef.current;
      if (!mat) continue;
      mat.uniforms.uColor.value.set(spine.style.color);
      mat.uniforms.uOpacity.value = edgeVisible ? spine.style.edgeOpacity : 0;
      mat.uniforms.uIntensity.value = edgeIntensity;
      mat.uniforms.uDensity.value = halftoneProfile.density;
      mat.uniforms.uTime.value = v.clock;
      mat.uniforms.uResolution.value.set(resX, resY);
      mat.uniforms.uPlanePhase.value = 0;
      mat.uniforms.uPlaneSize.value.set(edgeWidth, edgeHeight);
    }
  });

  const scene = nodeMapRef.current?.scene;
  if (!validateSceneDescription(scene)) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(
        '[Spine] Not mounting: scene or scene.spine invalid. Ensure nodeMapRef.current.scene = getSceneDescription() at viz mount (e.g. VoiceScreen).',
      );
    }
    return null;
  }
  const spine = scene!.spine;

  const blending =
    spine.style.blend === 'additive'
      ? THREE.AdditiveBlending
      : THREE.NormalBlending;

  const shards = spine.shards ?? [];

  return (
    <group
      ref={groupRef}
      visible={nodeMapRef.current?.vizIntensity !== 'off'}
      renderOrder={900}
    >
      {shards.map((shard, i) => (
        <mesh
          key={`shard-${i}`}
          ref={el => {
            shardRefs.current[i] = el;
          }}
          renderOrder={895 + i}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            color={spine.style.color}
            transparent
            opacity={spine.style.opacity * (shard.opacityScale ?? 0.7)}
            toneMapped={false}
            blending={blending}
            side={THREE.DoubleSide}
            depthWrite={false}
            depthTest={false}
          />
        </mesh>
      ))}
      {Array.from({ length: spine.planeCount }, (_, i) => (
        <mesh
          key={`plane-${i}`}
          ref={el => {
            planeRefs.current[i] = el;
            if (el) el.material = planeMats[i];
          }}
          renderOrder={901 + i}
        >
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
      <mesh ref={leftEdgeRef} renderOrder={916}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          ref={leftEdgeMatRef}
          uniforms={leftEdgeUniformsRef.current}
          vertexShader={EDGE_HALFTONE_VERTEX}
          fragmentShader={PLANE_HALFTONE_FRAGMENT}
          transparent
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={rightEdgeRef} renderOrder={917}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          ref={rightEdgeMatRef}
          uniforms={rightEdgeUniformsRef.current}
          vertexShader={EDGE_HALFTONE_VERTEX}
          fragmentShader={PLANE_HALFTONE_FRAGMENT}
          transparent
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
