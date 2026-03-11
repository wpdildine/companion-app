/**
 * Spine planes: 5-plane AI channel. Dumb renderer: all layout and style from
 * visualizationRef.current.scene.spine (visualization engine ref); spread interpolation uses scene transition/easing only.
 * Same envelope convention as TouchZones (active region NDC, centerY = 0 = center of active region).
 */

/**
 * Spine.tsx MUST NOT define shader code or create materials.
 * All GPU materials live in visualization/materials/.
 * Spine.tsx only assigns materials and updates uniforms.
 * Edge shader materials may use R3F <shaderMaterial> but must import shader strings from visualization/materials/halftone/ and must not embed shader code inline.
 *
 * That single rule will prevent 90% of the rendering regressions you've been fighting.
 */

import { useFrame } from '@react-three/fiber/native';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { CanonicalSpineMode } from '../../scene/builders/spine';
import type { LayerDescriptor } from '../../scene/layerDescriptor';
import { validateSceneDescription } from '../../scene/validateSceneDescription';
import type { VisualizationEngineRef } from '../../engine/types';
import { createOpacityPlaneMaterial } from '../../materials/spine/opacityPlaneMaterial';
import { createHalftoneMaterial } from '../../materials/halftone/halftonePlaneMaterial';
import { HALFTONE_VERTEX } from '../../materials/halftone/halftone.vert';
import { HALFTONE_FRAGMENT } from '../../materials/halftone/halftone.frag';
import { getDescriptorRenderOrderBase } from './descriptorRenderOrder';

/**
 * Map engine currentMode to canonical spine mode. Transient touch modes are
 * mapped to nearby semantic modes so motion does not appear frozen.
 */
function toCanonicalMode(mode: string): CanonicalSpineMode {
  switch (mode) {
    case 'idle':
    case 'listening':
    case 'processing':
    case 'speaking':
      return mode;
    case 'touched':
      return 'listening';
    case 'released':
      return 'speaking';
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

function getApertureSlideByMode(mode: CanonicalSpineMode): number {
  switch (mode) {
    case 'idle':
      return 0.0;
    case 'listening':
      return -0.12; // close inward toward center
    case 'processing':
      return 0.34; // open outward from center
    case 'speaking':
      return -0.06; // settle inward
    default:
      return 0.0;
  }
}

/**
 * Depth rule (layered glass): All spine planes and shards use depthWrite=false,
 * depthTest=false, transparent=true. renderOrder comes from scene.layers.*.renderOrderBase + local index.
 * Do not relax this—prevents z-fighting on mobile.
 */
export function Spine({
  visualizationRef,
  descriptor,
  children,
}: {
  visualizationRef: React.RefObject<VisualizationEngineRef | null>;
  descriptor?: LayerDescriptor;
  children?: React.ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const planeRefs = useRef<(THREE.Mesh | null)[]>([]);
  const planeMaterialsRef = useRef<THREE.ShaderMaterial[]>([]);

  const halftoneMatRef = useRef<THREE.ShaderMaterial | null>(null);
  if (!halftoneMatRef.current) {
    halftoneMatRef.current = createHalftoneMaterial();
  }
  const halftoneMat = halftoneMatRef.current;

  useEffect(
    () => () => {
      planeMaterialsRef.current.forEach(m => m.dispose());
      if (halftoneMatRef.current) halftoneMatRef.current.dispose();
    },
    [],
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
    uDebugFlat: { value: 0 },
    uFadeMode: { value: 0 },
    uFadeInner: { value: 0.35 },
    uFadeOuter: { value: 0.65 },
    uFadePower: { value: 1.5 },
    uFadeAngle: { value: 0.0 },
    uFadeOffset: { value: 0.0 },
    uFadeCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uFadeLevels: { value: 1.0 },
    uFadeStepMix: { value: 0.0 },
    uFadeOneSided: { value: 0 },
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
    uDebugFlat: { value: 0 },
    uFadeMode: { value: 0 },
    uFadeInner: { value: 0.35 },
    uFadeOuter: { value: 0.65 },
    uFadePower: { value: 1.5 },
    uFadeAngle: { value: 0.0 },
    uFadeOffset: { value: 0.0 },
    uFadeCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uFadeLevels: { value: 1.0 },
    uFadeStepMix: { value: 0.0 },
    uFadeOneSided: { value: 0 },
  });
  const cameraPosRef = useRef(new THREE.Vector3());
  const cameraDirRef = useRef(new THREE.Vector3());
  const cameraUpRef = useRef(new THREE.Vector3());
  const cameraRightRef = useRef(new THREE.Vector3());
  const whiteColorRef = useRef(new THREE.Color('#ffffff'));
  const edgeGlowTargetColorRef = useRef(new THREE.Color());
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
  const prevApertureRef = useRef(0);
  const currentApertureRef = useRef(0);
  const lastCanonicalModeRef = useRef<CanonicalSpineMode>('idle');
  const smoothPlaneOpacityRef = useRef<number[]>(Array(5).fill(0));
  const smoothPlaneIntensityRef = useRef<number[]>(Array(5).fill(0));
  const smoothShardOpacityRef = useRef<number[]>([]);
  const halftonePrimedRef = useRef(false);
  const bootStableFramesRef = useRef(0);
  const lastBootResRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  useFrame((state, delta) => {
    const v = visualizationRef.current;
    if (!v) return;
    const scene = v.scene;
    const spine = scene?.spine;
    if (!spine) return;

    const show = v.vizIntensity !== 'off';
    if (!groupRef.current) return;
    groupRef.current.visible = false;
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
      prevApertureRef.current = currentApertureRef.current;
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
    const targetApertureSlide = getApertureSlideByMode(canonicalMode);
    currentApertureRef.current =
      prevApertureRef.current +
      (targetApertureSlide - prevApertureRef.current) * eased;

    const spread = currentSpreadRef.current;
    const processingMotionBoost = spine.style.processingMotionBoost ?? 1;
    const processingExtraOverlap = spine.style.processingExtraOverlap ?? 0;
    const processingEdgeBoost = spine.style.processingEdgeBoost ?? 1;
    const perPlaneDriftScale = spine.style.perPlaneDriftScale ?? 0;
    const perPlaneDriftPhaseStep = spine.style.perPlaneDriftPhaseStep ?? 0;

    // Keep envelope size stable across states; state expression comes from aperture slide, not zoom.
    const effectiveVerticalSpread = 1;
    const effectiveBandWidth = 1;
    const isProcessing = canonicalMode === 'processing';
    const processingOverflow = 1;
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
    const axisDebugOn =
      typeof __DEV__ !== 'undefined' &&
      __DEV__ &&
      !!v.motionAxisDebug?.enabled;
    let axisX = 1;
    let axisY = 1;
    let planeDeformGain = 1;
    let planeBendGain = 1;
    let planeWarpGain = 1;
    let shardDriftGain = 1;
    if (axisDebugOn) {
      const mode = v.motionAxisDebug.axisLockMode ?? 'none';
      const xGain = Math.max(0, v.motionAxisDebug.xGain ?? 1);
      const yGain = Math.max(0, v.motionAxisDebug.yGain ?? 1);
      planeDeformGain = Math.max(0, v.motionAxisDebug.planeDeformGain ?? 1);
      planeBendGain = Math.max(0, v.motionAxisDebug.planeBendGain ?? 1);
      planeWarpGain = Math.max(0, v.motionAxisDebug.planeWarpGain ?? 1);
      shardDriftGain = Math.max(0, v.motionAxisDebug.shardDriftGain ?? 1);
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

    let driftFactor = 0;
    if (!v.reduceMotion) {
      if (canonicalMode === 'idle') driftFactor = 1;
      else if (canonicalMode === 'listening') driftFactor = 1.25;
      else if (canonicalMode === 'processing') driftFactor = 1.35;
      else if (canonicalMode === 'speaking') driftFactor = 0.8;
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
    const driftXEffective = driftX * axisX * planeDeformGain;
    const driftYEffective = driftY * axisY * planeDeformGain;
    const lockedDriftX = isProcessing && !axisDebugOn ? 0 : driftXEffective;

    groupRef.current.position
      .copy(cameraPosRef.current)
      .add(cameraDirRef.current.multiplyScalar(overlayDistance))
      .addScaledVector(cameraRightRef.current, lockedDriftX)
      .addScaledVector(cameraUpRef.current, spineCenterWorldY + driftYEffective);
    groupRef.current.quaternion.copy(cam.quaternion);

    const planeCount = spine.planeCount;
    while (planeMaterialsRef.current.length < planeCount) {
      planeMaterialsRef.current.push(createOpacityPlaneMaterial());
    }
    const planeMats = planeMaterialsRef.current;
    if (smoothPlaneOpacityRef.current.length < planeCount) {
      smoothPlaneOpacityRef.current.length = planeCount;
    }
    if (smoothPlaneIntensityRef.current.length < planeCount) {
      smoothPlaneIntensityRef.current.length = planeCount;
    }
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
    const dx = Math.abs(resX - lastBootResRef.current.x);
    const dy = Math.abs(resY - lastBootResRef.current.y);
    if (dx < 1 && dy < 1) {
      bootStableFramesRef.current += 1;
    } else {
      bootStableFramesRef.current = 0;
      lastBootResRef.current = { x: resX, y: resY };
    }
    if (bootStableFramesRef.current < 2) return;
    groupRef.current.visible = true;
    if (!halftonePrimedRef.current && resX > 8 && resY > 8) {
      halftonePrimedRef.current = true;
    }
    const edgeIntensity = Math.max(0, Math.min(1, halftoneProfile.intensity));

    for (let i = 0; i < planeCount; i++) {
      const mesh = planeRefs.current[i];
      if (!mesh) continue;
      const widthScale = spine.style.planeWidthScale[i] ?? 1;
      const baseHeightScale = spine.style.planeHeightScale?.[i] ?? 1;
      const heightScale = baseHeightScale;
      const offsetX = spine.style.planeOffsetX[i] ?? 0;
      const opacityScale = spine.style.planeOpacityScale[i] ?? 1;
      const offsetY = (spine.style.planeOffsetY?.[i] ?? 0) * unitHeight;
      const localY =
        -halfHeight + unitHeight * (i + 0.5) + unitHeight * gap * i + offsetY;
      const relativeToCenter = i - halftonePlaneIndex;
      const apertureStride = unitHeight * 0.92;
      const apertureShift =
        Math.sign(relativeToCenter) *
        Math.abs(relativeToCenter) *
        apertureStride *
        currentApertureRef.current;
      const apertureShiftEffective =
        apertureShift * axisY * planeDeformGain * planeBendGain;

      const perPlanePhase = i * perPlaneDriftPhaseStep;
      const scale = perPlaneDriftScale;
      const perPlaneX =
        isProcessing
          ? 0
          : envelopeWidthWorld *
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
      const perPlaneXEffective =
        perPlaneX * axisX * planeDeformGain * planeWarpGain;
      const perPlaneYEffective =
        perPlaneY * axisY * planeDeformGain * planeWarpGain;

      const planeZ = spine.planes?.[i]?.z;
      if (typeof planeZ !== 'number') {
        // Contract: builder must provide final Z for every spine plane.
        mesh.visible = false;
        continue;
      }
      mesh.position.set(
        envelopeWidthWorld * offsetX + perPlaneXEffective,
        localY + apertureShiftEffective + perPlaneYEffective,
        planeZ,
      );
      mesh.scale.set(
        envelopeWidthWorld * widthScale,
        unitHeight * heightScale,
        1,
      );

      const halftoneEnabled = spine.style.halftoneEnabled ?? true;
      const planeUsesHalftone =
        halftoneEnabled &&
        (v.spineUseHalftonePlanes
          ? i === halftonePlaneIndex || spine.style.planeAccent?.[i] === true
          : i === halftonePlaneIndex);
      const targetMat = planeUsesHalftone ? halftoneMat : planeMats[i];
      if (targetMat && mesh.material !== targetMat) {
        mesh.material = targetMat;
      }
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
        mesh.visible = halftonePrimedRef.current;
        if (!halftonePrimedRef.current) continue;
        halftoneMat.uniforms.uColor.value.set(planeColor);
        // Opacity is the membrane visibility; intensity should NOT zero the membrane.
        // Keep opacity scene-driven and use uIntensity only to shape the dots.
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
        const organism = scene.organism;
        const motion = scene.motion;
        const organismIntensityK = organism && !v.reduceMotion ? organism.presence * 0.1 : 0;
        const organismSkewK = organism && !v.reduceMotion ? organism.presence * organism.focusBias * 0.02 : 0;
        const organismDensityK =
          organism && !v.reduceMotion
            ? organism.presence * 0.12 + Math.abs(organism.focusBias) * organism.presence * 0.06
            : 0;
        const motionIntensityK = motion && !v.reduceMotion
          ? motion.tension * 0.24 + motion.energy * 0.1 + Math.max(0, motion.breath - 0.5) * 0.08
          : 0;
        const motionSkewK = motion && organism && !v.reduceMotion
          ? motion.attention * organism.focusBias * 0.03
          : 0;
        const motionDensityK = motion && !v.reduceMotion
          ? motion.energy * 0.24 + motion.openness * 0.16 + motion.microMotion * 0.12
          : 0;
        halftoneMat.uniforms.uIntensity.value = Math.max(
          0,
          Math.min(
            1,
            nextIntensity +
              organismIntensityK +
              organismSkewK +
              motionIntensityK +
              motionSkewK,
          ),
        );
        halftoneMat.uniforms.uDensity.value =
          halftoneProfile.density * (1 + organismDensityK + motionDensityK);
        halftoneMat.uniforms.uTime.value = v.clock;
        halftoneMat.uniforms.uResolution.value.set(resX, resY);
        halftoneMat.uniforms.uPlanePhase.value = i * 1.7;
        const planeW = envelopeWidthWorld * widthScale;
        const planeH = unitHeight * heightScale;
        halftoneMat.uniforms.uPlaneSize.value.set(planeW, planeH);
        halftoneMat.uniforms.uDebugFlat.value = spine.style.halftoneDebugFlat
          ? 1
          : 0;
        const fadeMode =
          spine.style.halftoneFadeMode === 'none'
            ? 0
            : spine.style.halftoneFadeMode === 'radial'
            ? 1
            : spine.style.halftoneFadeMode === 'linear'
            ? 2
            : 3;
        halftoneMat.uniforms.uFadeMode.value = fadeMode;
        halftoneMat.uniforms.uFadeInner.value =
          spine.style.halftoneFadeInner ?? 0.35;
        halftoneMat.uniforms.uFadeOuter.value =
          spine.style.halftoneFadeOuter ?? 0.65;
        halftoneMat.uniforms.uFadePower.value =
          spine.style.halftoneFadePower ?? 1.5;
        halftoneMat.uniforms.uFadeAngle.value =
          spine.style.halftoneFadeAngle ?? 0.0;
        halftoneMat.uniforms.uFadeOffset.value =
          spine.style.halftoneFadeOffset ?? 0.0;
        halftoneMat.uniforms.uFadeCenter.value.set(
          spine.style.halftoneFadeCenterX ?? 0.5,
          spine.style.halftoneFadeCenterY ?? 0.5,
        );
        halftoneMat.uniforms.uFadeLevels.value =
          spine.style.halftoneFadeLevels ?? 1.0;
        halftoneMat.uniforms.uFadeStepMix.value =
          spine.style.halftoneFadeStepMix ?? 0.0;
        halftoneMat.uniforms.uFadeOneSided.value = spine.style
          .halftoneFadeOneSided
          ? 1
          : 0;
      } else {
        mesh.visible = true;
        const mat = planeMats[i];
        const planeX =
          envelopeWidthWorld * offsetX + perPlaneXEffective;
        const beamHalfWidth = Math.max(
          0.0001,
          envelopeWidthWorld * (spine.style.beamHalfWidthFrac ?? 0.12),
        );
        const beamVisBase = Math.exp(
          -((planeX * planeX) / (beamHalfWidth * beamHalfWidth)),
        );
        const lightCore = scene?.spineLightCore;
        const lightCoreOpacity = lightCore?.enabled
          ? lightCore.opacityBase *
            (lightCore.opacityByMode?.[canonicalMode] ?? 1)
          : 1;
        const beamVis = THREE.MathUtils.clamp(
          beamVisBase * lightCoreOpacity,
          0,
          1,
        );
        const glowSide =
          Math.abs(planeX) < beamHalfWidth * 0.12 ? 0 : planeX > 0 ? -1 : 1;
        mat.uniforms.uColor.value.set(planeColor);
        mat.uniforms.uOpacity.value = nextOpacity;
        mat.uniforms.uEdgeGlowStrength.value =
          spine.style.edgeGlowStrength ?? 0.0;
        mat.uniforms.uEdgeGlowWidth.value =
          spine.style.edgeGlowWidth ?? 0.05;
        mat.uniforms.uRimColor.value
          .set(planeColor)
          .lerp(whiteColorRef.current, 0.14);
        edgeGlowTargetColorRef.current.set(spine.style.edgeGlowColor ?? planeColor);
        mat.uniforms.uEdgeGlowColor.value
          .set(planeColor)
          .lerp(edgeGlowTargetColorRef.current, 0.2);
        mat.uniforms.uBeamVis.value = beamVis;
        mat.uniforms.uGlowSide.value = glowSide;
        mat.uniforms.uEdgeYWeight.value = spine.style.edgeYWeight ?? 0.12;
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
    const motion = scene.motion;
    const motionEnergy = motion?.energy ?? 0;
    const motionOpenness = motion?.openness ?? 0;
    const motionSettle = motion?.settle ?? 0;
    const motionMicro = motion?.microMotion ?? 0;
    const motionMicroForShards = motionMicro * shardDriftGain;
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
      const shardDriftScale =
        (shard.driftScale ?? 1) *
        0.32 *
        (1 + motionEnergy * 0.55 + motionMicroForShards * 0.28) *
        (1 - motionSettle * 0.35);
      const shardDriftX = !v.reduceMotion
        ? isProcessing && !axisDebugOn
          ? 0
          : envelopeWidthWorld *
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
      const shardDriftXEffective = shardDriftX * axisX;
      const shardDriftYEffective = shardDriftY * axisY;
      mesh.position.set(
        envelopeWidthWorld * shard.offsetX + shardDriftXEffective,
        envelopeHeightWorld * shard.offsetY + shardDriftYEffective,
        shard.z,
      );
      mesh.scale.set(
        envelopeWidthWorld * (shard.widthScale ?? shardBaseWidthScale),
        unitHeight * shard.heightScale,
        1,
      );
      if (mesh.material) {
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.blending = THREE.NormalBlending;
        mat.color.set('#050913');
        const targetShardOpacity =
          spine.style.opacity *
          shard.opacityScale *
          dynamicOpacityBoost *
          spine.style.shardOpacityScale *
          0.92 *
          (1 + motionOpenness * 0.14 + motionEnergy * 0.12 - motionSettle * 0.12);
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
        mat.opacity = THREE.MathUtils.clamp(nextShardOpacity, 0, 0.9);
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
      mat.uniforms.uDebugFlat.value = spine.style.halftoneDebugFlat ? 1 : 0;
      mat.uniforms.uFadeMode.value = 0;
      mat.uniforms.uFadeInner.value = spine.style.halftoneFadeInner ?? 0.35;
      mat.uniforms.uFadeOuter.value = spine.style.halftoneFadeOuter ?? 0.65;
      mat.uniforms.uFadePower.value = spine.style.halftoneFadePower ?? 1.5;
      mat.uniforms.uFadeAngle.value = spine.style.halftoneFadeAngle ?? 0.0;
      mat.uniforms.uFadeOffset.value = spine.style.halftoneFadeOffset ?? 0.0;
      mat.uniforms.uFadeCenter.value.set(
        spine.style.halftoneFadeCenterX ?? 0.5,
        spine.style.halftoneFadeCenterY ?? 0.5,
      );
      mat.uniforms.uFadeLevels.value = spine.style.halftoneFadeLevels ?? 1.0;
      mat.uniforms.uFadeStepMix.value = spine.style.halftoneFadeStepMix ?? 0.0;
      mat.uniforms.uFadeOneSided.value = spine.style.halftoneFadeOneSided
        ? 1
        : 0;
    }
  });

  const scene = visualizationRef.current?.scene;
  if (!validateSceneDescription(scene)) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(
        '[Spine] Not mounting: scene or scene.spine invalid. Ensure visualizationRef.current.scene = getSceneDescription() at viz mount (e.g. VoiceScreen).',
      );
    }
    return null;
  }
  const spine = scene!.spine;
  const layers = scene!.layers;
  while (planeMaterialsRef.current.length < spine.planeCount) {
    planeMaterialsRef.current.push(createOpacityPlaneMaterial());
  }
  const spineBaseRo = getDescriptorRenderOrderBase(
    scene,
    descriptor,
    'spineBase',
    layers.spineBase.renderOrderBase,
  );
  const spineShardsRo = getDescriptorRenderOrderBase(
    scene,
    descriptor,
    'spineShards',
    layers.spineShards.renderOrderBase,
  );
  const edgeMeshRoOffset = spineBaseRo + spine.planeCount;

  const blending = THREE.NormalBlending;

  const shards = spine.shards ?? [];

  return (
    <group
      ref={groupRef}
      visible={visualizationRef.current?.vizIntensity !== 'off'}
      renderOrder={spineBaseRo}
    >
      {shards.map((shard, i) => (
        <mesh
          key={`shard-${i}`}
          ref={el => {
            shardRefs.current[i] = el;
          }}
          renderOrder={spineShardsRo + i}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            color="#050913"
            transparent
            opacity={
              spine.style.opacity *
              (shard.opacityScale ?? 0.7) *
              spine.style.shardOpacityScale *
              0.92
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
        const configuredOrder = spine.style.planeRenderOrder?.[i];
        const planeRenderOrder =
          spineBaseRo + (typeof configuredOrder === 'number' ? configuredOrder : i);
        return (
          <mesh
            key={`plane-${i}`}
            visible={true}
            ref={el => {
              planeRefs.current[i] = el;
              if (el) {
                const mat = planeMaterialsRef.current[i];
                if (mat) {
                  el.material = mat;
                  if ('uniforms' in mat) {
                    const supportMat = mat as THREE.ShaderMaterial;
                    supportMat.uniforms.uColor.value.set(
                      spine.style.planeColors?.[i] ?? spine.style.color,
                    );
                    supportMat.uniforms.uOpacity.value =
                      spine.style.opacity *
                      (spine.style.planeOpacityScale?.[i] ?? 1);
                  }

                  const accent = spine.style.planeAccent?.[i] === true;
                  const desiredBlending = accent
                    ? THREE.AdditiveBlending
                    : THREE.NormalBlending;

                  // Allow the scene to choose blending for BOTH basic and halftone planes.
                  // (Halftone visibility relies on additive for the hero plane.)
                  if (mat.blending !== desiredBlending) {
                    mat.blending = desiredBlending;
                    mat.needsUpdate = true;
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
      <mesh ref={leftEdgeRef} renderOrder={edgeMeshRoOffset + 0} visible={false}>
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
      <mesh ref={rightEdgeRef} renderOrder={edgeMeshRoOffset + 1} visible={false}>
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
      {children ?? null}
    </group>
  );
}
