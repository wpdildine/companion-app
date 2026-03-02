/**
 * Spine planes: 5-plane AI channel. Dumb renderer: all layout and style from
 * nodeMapRef.current.scene.spine; spread interpolation uses scene transition/easing only.
 * Same envelope convention as TouchZones (active region NDC, centerY = 0 = center of active region).
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { validateSceneDescription } from '../helpers/validateSceneDescription';
import type { CanonicalSpineMode } from '../helpers/formations/spine';
import type { NodeMapEngineRef } from '../types';

const EDGE_HALFTONE_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const EDGE_HALFTONE_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uIntensity;
uniform float uDensity;
uniform float uTime;

void main() {
  float density = mix(18.0, 44.0, clamp(uDensity / 2.0, 0.0, 1.0));
  vec2 uv = vUv + vec2(sin(uTime * 0.7) * 0.003, cos(uTime * 0.6) * 0.003);
  vec2 cellUv = fract(uv * vec2(density, density * 0.62)) - 0.5;
  float d = length(cellUv);
  float dotMask = 1.0 - smoothstep(0.12, 0.38, d);
  float stripe = 0.82 + 0.18 * sin((uv.y + uTime * 0.08) * 30.0);
  float a = uOpacity * uIntensity * mix(0.35, 1.0, dotMask) * stripe;
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
  });
  const rightEdgeUniformsRef = useRef({
    uColor: { value: new THREE.Color() },
    uOpacity: { value: 0 },
    uIntensity: { value: 0 },
    uDensity: { value: 1 },
    uTime: { value: 0 },
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
      rampRef.current = 0;
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
    const processingOverflow =
      canonicalMode === 'processing' ? spine.style.processingOverflowBoost : 1;
    const viewW = viewWidth;
    const actH = activeHeight;
    const envelopeWidthWorld =
      viewW * spine.envelopeNdc.width * spread.bandWidth * processingOverflow;
    const envelopeHeightWorld =
      actH * (spine.envelopeNdc.height / 2) * spread.verticalSpread;
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
      (canonicalMode === 'processing' ? spine.style.processingOverflowBoost : 1);
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
    const gap = Math.max(0, spine.style.planeGap);
    const unitHeight = envelopeHeightWorld / (planeCount + gap * (planeCount - 1));
    const totalHeight = unitHeight * (planeCount + gap * (planeCount - 1));
    const halfHeight = totalHeight / 2;
    const dynamicOpacityBoost = 1 + halftoneProfile.intensity * 0.45;

    for (let i = 0; i < planeCount; i++) {
      const mesh = planeRefs.current[i];
      if (!mesh) continue;
      const widthScale = spine.style.planeWidthScale[i] ?? 1;
      const offsetX = spine.style.planeOffsetX[i] ?? 0;
      const opacityScale = spine.style.planeOpacityScale[i] ?? 1;
      const localY =
        -halfHeight + unitHeight * (i + 0.5) + unitHeight * gap * i;
      mesh.position.set(
        envelopeWidthWorld * offsetX,
        localY,
        (i - (planeCount - 1) / 2) * zStep,
      );
      mesh.scale.set(envelopeWidthWorld * widthScale, unitHeight, 1);
      if (mesh.material) {
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity =
          spine.style.opacity * opacityScale * dynamicOpacityBoost;
      }
    }

    const edgeWidth = envelopeWidthWorld * spine.style.edgeBandWidth;
    const edgeHeight = envelopeHeightWorld;
    const edgeOffset = envelopeWidthWorld * 0.5 - edgeWidth * 0.5;
    if (leftEdgeRef.current) {
      leftEdgeRef.current.position.set(-edgeOffset, 0, zStep * 0.4);
      leftEdgeRef.current.scale.set(edgeWidth, edgeHeight, 1);
    }
    if (rightEdgeRef.current) {
      rightEdgeRef.current.position.set(edgeOffset, 0, zStep * 0.4);
      rightEdgeRef.current.scale.set(edgeWidth, edgeHeight, 1);
    }
    const edgeIntensity = Math.max(0, Math.min(1, halftoneProfile.intensity));
    for (const matRef of [leftEdgeMatRef, rightEdgeMatRef]) {
      const mat = matRef.current;
      if (!mat) continue;
      mat.uniforms.uColor.value.set(spine.style.color);
      mat.uniforms.uOpacity.value = spine.style.edgeOpacity;
      mat.uniforms.uIntensity.value = edgeIntensity;
      mat.uniforms.uDensity.value = halftoneProfile.density;
      mat.uniforms.uTime.value = v.clock;
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

  const color = new THREE.Color(spine.style.color);
  const blending =
    spine.style.blend === 'additive'
      ? THREE.AdditiveBlending
      : THREE.NormalBlending;

  return (
    <group
      ref={groupRef}
      visible={nodeMapRef.current?.vizIntensity !== 'off'}
      renderOrder={900}
    >
      {Array.from({ length: spine.planeCount }, (_, i) => (
        <mesh
          key={i}
          ref={el => {
            planeRefs.current[i] = el;
          }}
          renderOrder={901 + i}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={spine.style.opacity}
            toneMapped={false}
            blending={blending}
            side={THREE.DoubleSide}
            depthWrite={false}
            depthTest={false}
          />
        </mesh>
      ))}
      <mesh ref={leftEdgeRef} renderOrder={916}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          ref={leftEdgeMatRef}
          uniforms={leftEdgeUniformsRef.current}
          vertexShader={EDGE_HALFTONE_VERTEX}
          fragmentShader={EDGE_HALFTONE_FRAGMENT}
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
          fragmentShader={EDGE_HALFTONE_FRAGMENT}
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
