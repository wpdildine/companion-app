/**
 * Spine planes: 5-plane AI channel. Dumb renderer: all layout and style from
 * nodeMapRef.current.scene.spine; spread interpolation uses scene transition/easing only.
 * Same envelope convention as TouchZones (active region NDC, centerY = 0 = center of active region).
 */

/**
 * Spine.tsx MUST NOT define shader code or create materials.
 * All GPU materials live in nodeMap/materials/.
 * Spine.tsx only assigns materials and updates uniforms.
 * Edge shader materials may use R3F <shaderMaterial> but must import shader strings from nodeMap/materials/halftone/ and must not embed shader code inline.
 *
 * That single rule will prevent 90% of the rendering regressions you've been fighting.
 */

import { useFrame } from '@react-three/fiber/native';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { CanonicalSpineMode } from '../helpers/formations/spine';
import { validateSceneDescription } from '../helpers/validateSceneDescription';
import type { NodeMapEngineRef } from '../types';
import { createBasicPlaneMaterial } from '../materials/basicPlaneMaterial';
import { createHalftoneMaterial } from '../materials/halftone/halftonePlaneMaterial';
import { HALFTONE_VERTEX } from '../materials/halftone/halftone.vert';
import { HALFTONE_FRAGMENT } from '../materials/halftone/halftone.frag';

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

/**
 * Depth rule (layered glass): All spine planes and shards use depthWrite=false,
 * depthTest=false, transparent=true. renderOrder comes from scene.style.planeRenderOrder only.
 * Do not relax this—prevents z-fighting on mobile.
 */
const BASE_PLANE_RENDER_ORDER = 901;

export function Spine({
  nodeMapRef,
}: {
  nodeMapRef: React.RefObject<NodeMapEngineRef | null>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const planeRefs = useRef<(THREE.Mesh | null)[]>([]);
  const PLANE_COLORS = [
    '#8a9fc9',
    '#9eb3e0',
    '#c5dcff',
    '#a2b8e8',
    '#889bc4',
  ];
  const planeMaterialsRef = useRef<THREE.MeshBasicMaterial[] | null>(null);
  if (!planeMaterialsRef.current) {
    planeMaterialsRef.current = PLANE_COLORS.map(color =>
      createBasicPlaneMaterial(color),
    );
  }
  const planeMats = planeMaterialsRef.current;

  const halftoneMatRef = useRef<THREE.ShaderMaterial | null>(null);
  if (!halftoneMatRef.current) {
    halftoneMatRef.current = createHalftoneMaterial();
  }
  const halftoneMat = halftoneMatRef.current;

  useEffect(
    () => () => {
      planeMats.forEach(m => m.dispose());
      if (halftoneMatRef.current) halftoneMatRef.current.dispose();
    },
    [planeMats],
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
  const smoothPlaneOpacityRef = useRef<number[]>(Array(5).fill(0));
  const smoothPlaneIntensityRef = useRef<number[]>(Array(5).fill(0));
  const smoothShardOpacityRef = useRef<number[]>([]);

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
      // Always restart ramp on mode change (prevents one-frame pops/flicker).
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
        ? 1 + Math.sin(v.clock * 2 * Math.PI * idleBreathHz) * idleBreathAmp
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
    if (!v.reduceMotion && (canonicalMode === 'idle' || canonicalMode === 'listening')) {
      driftFactor = canonicalMode === 'idle' ? 1 : 1.25;
    }
    const driftRate =
      spine.style.driftHz *
      (isProcessing
        ? spine.style.processingOverflowBoost * processingMotionBoost
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
      spine.style.planeGap + (isProcessing ? processingExtraOverlap : 0);
    const unitHeight =
      envelopeHeightWorld / (planeCount + gap * (planeCount - 1));
    const totalHeight = unitHeight * (planeCount + gap * (planeCount - 1));
    const halfHeight = totalHeight / 2;
    const dynamicOpacityBoost =
      1 + halftoneProfile.intensity * spine.style.opacityBoostFromHalftone;
    const kOpacity = 1.0 - Math.exp(-Math.max(0, delta) / 0.18);
    const maxOpacityStep = Math.max(0.008, delta * 2.4);
    const maxIntensityStep = Math.max(0.01, delta * 2.8);

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
        baseHeightScale * (isProcessing ? processingHeightBoost : 1);
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

      const planeZOffset = (spine.style.planeZOffset?.[i] ?? 0) * zStep;
      mesh.position.set(
        envelopeWidthWorld * offsetX + perPlaneX,
        localY + perPlaneY,
        (i - (planeCount - 1) / 2) * zStep + planeZOffset,
      );
      mesh.scale.set(
        envelopeWidthWorld * widthScale,
        unitHeight * heightScale,
        1,
      );

      const planeUsesHalftone =
        (spine.style.halftoneEnabled ?? true) && i === halftonePlaneIndex;
      const planeColor = spine.style.planeColors?.[i] ?? spine.style.color;
      const targetPlaneOpacity =
        spine.style.opacity * opacityScale * dynamicOpacityBoost;
      if (smoothPlaneOpacityRef.current[i] == null) {
        smoothPlaneOpacityRef.current[i] = targetPlaneOpacity;
      }
      const currentOpacity = smoothPlaneOpacityRef.current[i];
      const nextOpacityRaw =
        currentOpacity + (targetPlaneOpacity - currentOpacity) * kOpacity;
      const nextOpacity =
        currentOpacity +
        THREE.MathUtils.clamp(
          nextOpacityRaw - currentOpacity,
          -maxOpacityStep,
          maxOpacityStep,
        );
      smoothPlaneOpacityRef.current[i] = nextOpacity;

      if (planeUsesHalftone) {
        if (!halftoneMat) continue;
        halftoneMat.uniforms.uColor.value.set(planeColor);
        halftoneMat.uniforms.uOpacity.value = Math.min(
          1,
          nextOpacity * spine.style.halftoneOpacityScale,
        );
        const targetIntensity = edgeIntensity;
        if (smoothPlaneIntensityRef.current[i] == null) {
          smoothPlaneIntensityRef.current[i] = targetIntensity;
        }
        const currentIntensity = smoothPlaneIntensityRef.current[i];
        const nextIntensityRaw =
          currentIntensity + (targetIntensity - currentIntensity) * kOpacity;
        const nextIntensity =
          currentIntensity +
          THREE.MathUtils.clamp(
            nextIntensityRaw - currentIntensity,
            -maxIntensityStep,
            maxIntensityStep,
          );
        smoothPlaneIntensityRef.current[i] = nextIntensity;
        halftoneMat.uniforms.uIntensity.value = nextIntensity;
        halftoneMat.uniforms.uDensity.value = halftoneProfile.density;
        halftoneMat.uniforms.uTime.value = v.clock;
        halftoneMat.uniforms.uResolution.value.set(resX, resY);
        halftoneMat.uniforms.uPlanePhase.value = i * 1.7;
        const planeW = envelopeWidthWorld * widthScale;
        const planeH = unitHeight * heightScale;
        halftoneMat.uniforms.uPlaneSize.value.set(planeW, planeH);
        const fadeMode =
          spine.style.halftoneFadeMode === 'none'
            ? 0
            : spine.style.halftoneFadeMode === 'radial'
              ? 1
              : 2;
        halftoneMat.uniforms.uFadeMode.value = fadeMode;
        halftoneMat.uniforms.uFadeInner.value =
          spine.style.halftoneFadeInner ?? 0.35;
        halftoneMat.uniforms.uFadeOuter.value =
          spine.style.halftoneFadeOuter ?? 0.65;
        halftoneMat.uniforms.uFadePower.value =
          spine.style.halftoneFadePower ?? 1.5;
      } else {
        const mat = planeMats[i];
        mat.color.set(planeColor);
        mat.opacity = nextOpacity;
      }
    }

    const edgeBandWidth =
      spine.style.edgeBandWidth * (isProcessing ? processingEdgeBoost : 1);
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
    const shardBaseWidthScale = spine.style.shardWidthScale ?? 0.28;
    const visibleShardCount =
      spine.shardCountByMode?.[canonicalMode] ?? shards.length;
    for (let s = 0; s < shards.length; s++) {
      const mesh = shardRefs.current[s];
      const shard = shards[s];
      if (!mesh || !shard) continue;
      mesh.visible = s < visibleShardCount;
      if (!mesh.visible) continue;
      const shardRate = driftRate * (shard.driftRateScale ?? 1);
      const shardDriftScale = (shard.driftScale ?? 1) * 0.32;
      const shardDriftX = !v.reduceMotion
        ? envelopeWidthWorld *
          spine.style.driftAmpX *
          driftFactor *
          shardDriftScale *
          Math.sin(v.clock * shardRate * 2 * Math.PI + shard.driftPhase)
        : 0;
      const shardDriftY = !v.reduceMotion
        ? envelopeHeightWorld *
          spine.style.driftAmpY *
          driftFactor *
          shardDriftScale *
          Math.cos(v.clock * shardRate * 1.7 * 2 * Math.PI + shard.driftPhase)
        : 0;
      mesh.position.set(
        envelopeWidthWorld * shard.offsetX + shardDriftX,
        envelopeHeightWorld * shard.offsetY + shardDriftY,
        shard.zOffset * zStep,
      );
      mesh.scale.set(
        envelopeWidthWorld * (shard.widthScale ?? shardBaseWidthScale),
        unitHeight * shard.heightScale,
        1,
      );
      if (mesh.material) {
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.blending =
          shard.accent === true
            ? THREE.AdditiveBlending
            : spine.style.blend === 'additive'
              ? THREE.AdditiveBlending
              : THREE.NormalBlending;
        mat.color.set(shard.color ?? spine.style.color);
        const targetShardOpacity =
          spine.style.opacity *
          shard.opacityScale *
          dynamicOpacityBoost *
          spine.style.shardOpacityScale;
        if (smoothShardOpacityRef.current[s] == null) {
          smoothShardOpacityRef.current[s] = targetShardOpacity;
        }
        const currentShardOpacity = smoothShardOpacityRef.current[s];
        const nextShardOpacityRaw =
          currentShardOpacity +
          (targetShardOpacity - currentShardOpacity) * kOpacity;
        const nextShardOpacity =
          currentShardOpacity +
          THREE.MathUtils.clamp(
            nextShardOpacityRaw - currentShardOpacity,
            -maxOpacityStep,
            maxOpacityStep,
          );
        smoothShardOpacityRef.current[s] = nextShardOpacity;
        mat.opacity = nextShardOpacity;
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
          renderOrder={860 + i}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            color={shard.color ?? spine.style.color}
            transparent
            opacity={
              spine.style.opacity *
              (shard.opacityScale ?? 0.7) *
              spine.style.shardOpacityScale
            }
            toneMapped={false}
            blending={blending}
            side={THREE.DoubleSide}
            depthWrite={false}
            depthTest={false}
          />
        </mesh>
      ))}
      {Array.from({ length: spine.planeCount }, (_, i) => {
        const halftoneIndex = Math.floor((spine.planeCount - 1) / 2);
        const isHalftonePlane =
          i === halftoneIndex && (spine.style.halftoneEnabled ?? true);
        const planeRenderOrder =
          spine.style.planeRenderOrder?.[i] ?? BASE_PLANE_RENDER_ORDER + i;
        return (
          <mesh
            key={`plane-${i}`}
            ref={el => {
              planeRefs.current[i] = el;
              if (el) {
                const mat = isHalftonePlane
                  ? halftoneMatRef.current
                  : planeMats[i];
                if (mat) {
                  el.material = mat;
                  if (!isHalftonePlane) {
                    mat.blending =
                      spine.style.planeAccent?.[i] === true
                        ? THREE.AdditiveBlending
                        : THREE.NormalBlending;
                  }
                }
              }
            }}
            renderOrder={planeRenderOrder}
          >
            <planeGeometry args={[1, 1]} />
          </mesh>
        );
      })}
      <mesh ref={leftEdgeRef} renderOrder={916} visible={false}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          ref={leftEdgeMatRef}
          uniforms={leftEdgeUniformsRef.current}
          vertexShader={HALFTONE_VERTEX}
          fragmentShader={HALFTONE_FRAGMENT}
          transparent
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={rightEdgeRef} renderOrder={917} visible={false}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          ref={rightEdgeMatRef}
          uniforms={rightEdgeUniformsRef.current}
          vertexShader={HALFTONE_VERTEX}
          fragmentShader={HALFTONE_FRAGMENT}
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
