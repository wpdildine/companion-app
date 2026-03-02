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

const OVERLAY_DISTANCE = 10;
const PLANE_COUNT = 5;

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
  const cameraPosRef = useRef(new THREE.Vector3());
  const cameraDirRef = useRef(new THREE.Vector3());
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

    const { layout } = scene.zones;
    const bandTopInsetPx = layout.bandTopInsetPx;
    const activeHeightRatio = Math.max(
      0,
      Math.min(1, (h - bandTopInsetPx) / h),
    );
    const centerNdcY = -(bandTopInsetPx / h);

    const cam = state.camera as THREE.PerspectiveCamera;
    const fovDeg = typeof cam.fov === 'number' ? cam.fov : 60;
    const viewHeight =
      2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) * 0.5) * OVERLAY_DISTANCE;
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
    const viewW = hasSize ? viewWidth : 10;
    const actH = hasSize ? activeHeight : 10;
    const envelopeWidthWorld =
      viewW * spine.envelopeNdc.width * spread.bandWidth;
    const envelopeHeightWorld =
      actH * (spine.envelopeNdc.height / 2) * spread.verticalSpread;
    const spineCenterWorldY = hasSize
      ? centerNdcY * (viewHeight * 0.5) +
        spine.envelopeNdc.centerY * (activeHeight * 0.5)
      : 0;
    const zStep = spine.style.zStep * spread.depthSpread;

    cam.getWorldPosition(cameraPosRef.current);
    cam.getWorldDirection(cameraDirRef.current);
    groupRef.current.position
      .copy(cameraPosRef.current)
      .add(cameraDirRef.current.multiplyScalar(OVERLAY_DISTANCE));
    const cameraUp = (state.camera as THREE.PerspectiveCamera).up.clone();
    groupRef.current.position.add(cameraUp.multiplyScalar(spineCenterWorldY));
    groupRef.current.quaternion.copy(cam.quaternion);

    const planeHeight = envelopeHeightWorld / PLANE_COUNT;
    const halfHeight = (planeHeight * PLANE_COUNT) / 2;
    for (let i = 0; i < PLANE_COUNT; i++) {
      const mesh = planeRefs.current[i];
      if (!mesh) continue;
      const localY = -halfHeight + planeHeight * (i + 0.5);
      mesh.position.set(0, localY, (i - (PLANE_COUNT - 1) / 2) * zStep);
      mesh.scale.set(envelopeWidthWorld, planeHeight, 1);
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
      {Array.from({ length: PLANE_COUNT }, (_, i) => (
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
    </group>
  );
}
