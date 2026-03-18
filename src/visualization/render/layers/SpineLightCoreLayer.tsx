/**
 * Spine light-core layer: single backlight beam between background and spine.
 * Dumb renderer: reads scene.spine + scene.spineLightCore + scene.layers only.
 */

import { useFrame } from '@react-three/fiber/native';
import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { VisualizationEngineRef } from '../../runtime/runtimeTypes';
import { useVizIsolationGate } from '../../runtime/VizRuntimeIsolationContext';
import type { LayerDescriptor } from '../../scene/layerDescriptor';
import { getActiveBandVerticalEnvelope } from '../../interaction/activeBandEnvelope';
import { getDescriptorRenderOrderBase } from './descriptorRenderOrder';
import { computeTransientModulation, scaleModulation } from '../utils/transientModulation';
import { interpolateModeValue } from '../../runtime/modeTransition';

export function SpineLightCoreLayer({
  visualizationRef,
  descriptor,
}: {
  visualizationRef: React.RefObject<VisualizationEngineRef | null>;
  descriptor?: LayerDescriptor;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const cameraPosRef = useRef(new THREE.Vector3());
  const cameraDirRef = useRef(new THREE.Vector3());
  const cameraUpRef = useRef(new THREE.Vector3());
  const baseColorRef = useRef(new THREE.Color());
  const tintColorRef = useRef(new THREE.Color());
  const mixedColorRef = useRef(new THREE.Color());
  const baseOrbColorRef = useRef(new THREE.Color());
  const mixedOrbColorRef = useRef(new THREE.Color());
  const shaderMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color('#8fd6ff') },
          uOrbColor: { value: new THREE.Color('#9b7dff') },
          uOpacity: { value: 0 },
          uTime: { value: 0 },
          uWarpAmpX: { value: 0 },
          uWarpAmpY: { value: 0 },
          uWarpFreq: { value: 0.12 },
          uOrbStrength: { value: 0.8 },
          uOrbRadius: { value: 0.2 },
          uOrbFalloff: { value: 2.0 },
          uOrbCenterY: { value: 0.5 },
          uBeamCenterXOffset: { value: 0 },
          uBendAmount: { value: 0 },
          uBendBias: { value: 0 },
        },
        vertexShader: `
          varying vec2 vUv;
          uniform float uBendAmount;
          uniform float uBendBias;
          void main() {
            vUv = uv;
            vec3 pos = position;
            // Anchor at bottom, flex most at top in local overlay space.
            // Use geometry Y directly (not UV assumptions) and displace only local X.
            float h = clamp(position.y + 0.5, 0.0, 1.0);
            float bendProfile = h * h;
            pos.x += uBendAmount * uBendBias * bendProfile;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: `
          precision mediump float;
          varying vec2 vUv;
          uniform vec3 uColor;
          uniform vec3 uOrbColor;
          uniform float uOpacity;
          uniform float uTime;
          uniform float uWarpAmpX;
          uniform float uWarpAmpY;
          uniform float uWarpFreq;
          uniform float uOrbStrength;
          uniform float uOrbRadius;
          uniform float uOrbFalloff;
          uniform float uOrbCenterY;
          uniform float uBeamCenterXOffset;
          void main() {
            vec2 uv = vUv;
            uv.x += sin((vUv.y + uTime * uWarpFreq) * 6.2831853) * uWarpAmpX;
            uv.y += sin((vUv.x - uTime * uWarpFreq * 0.73) * 6.2831853) * uWarpAmpY;
            vec2 beamCenter = vec2(0.5 + uBeamCenterXOffset, 0.5);
            vec2 c = uv - beamCenter;
            float r = length(c);
            float radialCore = exp(-pow(r / 0.29, 2.0));
            float radialFalloff = 1.0 - smoothstep(0.24, 0.62, r);
            float centerBoost = 0.84 + 0.9 * radialCore;
            vec2 orbCenter = vec2(0.5, uOrbCenterY);
            vec2 od = abs(uv - orbCenter);
            // Square distance (Chebyshev): rectilinear field.
            float orbDist = max(od.x, od.y);
            float orbNorm = clamp(1.0 - (orbDist / max(0.0001, uOrbRadius)), 0.0, 1.0);
            // Hard quantization (no smoothing): visible stepped square bands.
            float orbLevels = 6.0;
            float orbStep = floor(orbNorm * orbLevels) / orbLevels;
            float orb = pow(orbStep, max(0.1, uOrbFalloff * 0.55));
            float alpha = uOpacity * radialCore * radialFalloff * centerBoost;
            alpha *= (1.0 + orb * uOrbStrength);
            if (alpha < 0.001) discard;
            float beamTerm = (0.88 + radialCore * 0.42);
            float orbTerm = orb * (uOrbStrength * 0.95);
            vec3 rgb = uColor * beamTerm + uOrbColor * orbTerm;
            gl_FragColor = vec4(rgb, alpha);
          }
        `,
        transparent: true,
        toneMapped: false,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  useEffect(() => () => shaderMat.dispose(), [shaderMat]);

  const r3fFrameOn = useVizIsolationGate('r3f_frame');
  useFrame(state => {
    if (!r3fFrameOn) return;
    const v = visualizationRef.current;
    const scene = v?.scene;
    const spine = scene?.spine;
    const lightCore = scene?.spineLightCore;
    const layers = scene?.layers;
    const mesh = meshRef.current;
    const mat = shaderMat;
    if (!v || !scene || !spine || !lightCore || !layers || !mesh || !mat)
      return;

    const visible = v.vizIntensity !== 'off' && lightCore.enabled;
    mesh.visible = visible;
    if (!visible) return;

    const w = v.canvasWidth > 0 ? v.canvasWidth : state.size.width;
    const h = v.canvasHeight > 0 ? v.canvasHeight : state.size.height;
    if (!(w > 0 && h > 0)) return;

    const { layout } = scene.zones;
    const { activeHeightRatio, centerNdcY } = getActiveBandVerticalEnvelope(
      layout.bandTopInsetPx,
      h,
    );

    const cam = state.camera as THREE.PerspectiveCamera;
    const fovDeg = typeof cam.fov === 'number' ? cam.fov : 60;
    const overlayDistance = spine.style.overlayDistance;
    const viewHeight =
      2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) * 0.5) * overlayDistance;
    const aspect = h > 0 ? w / h : 1;
    const viewWidth = viewHeight * aspect;
    const activeHeight = viewHeight * activeHeightRatio;

    const envelopeWidthWorld = viewWidth * spine.envelopeNdc.width;
    const envelopeHeightWorld = activeHeight * (spine.envelopeNdc.height / 2);
    const spineCenterWorldY =
      centerNdcY * (viewHeight * 0.5) +
      spine.envelopeNdc.centerY * (activeHeight * 0.5);

    cam.getWorldPosition(cameraPosRef.current);
    cam.getWorldDirection(cameraDirRef.current);
    cameraUpRef.current.copy(cam.up).normalize();

    mesh.position
      .copy(cameraPosRef.current)
      .add(cameraDirRef.current.multiplyScalar(overlayDistance))
      .addScaledVector(cameraUpRef.current, spineCenterWorldY)
      .addScaledVector(
        cameraDirRef.current,
        spine.style.zStep * lightCore.zOffset,
      );
    mesh.quaternion.copy(cam.quaternion);
    mesh.scale.set(
      envelopeWidthWorld * lightCore.widthScale,
      envelopeHeightWorld * lightCore.heightScale,
      1,
    );
    mesh.renderOrder = getDescriptorRenderOrderBase(
      v.scene,
      descriptor,
      'spineLightCore',
      layers.spineLightCore.renderOrderBase,
    );

    const mod = scaleModulation(
      computeTransientModulation(v.lastEvent, v.lastEventTime, v.clock, scene.transientEffects),
      lightCore.modulationWeights,
    );
    const tintMix = mod.hueShift;
    const baseColor = baseColorRef.current.set(lightCore.color);
    const tintColor = tintColorRef.current.set(lightCore.modulationTintColor);
    const mixedColor = mixedColorRef.current.copy(baseColor).lerp(tintColor, tintMix);
    const baseOrbColor = baseOrbColorRef.current.set(lightCore.orbColor);
    const mixedOrbColor = mixedOrbColorRef.current.copy(baseOrbColor).lerp(tintColor, tintMix);
    mat.uniforms.uColor.value.copy(mixedColor);
    mat.uniforms.uOrbColor.value.copy(mixedOrbColor);
    const motion = scene.motion;
    const motionEnergy = motion?.energy ?? 0;
    const motionTension = motion?.tension ?? 0;
    const motionSettle = motion?.settle ?? 0;
    const motionAttention = motion?.attention ?? 0;
    const motionMicro = motion?.microMotion ?? 0;
    const motionBreath = motion?.breath ?? 0.5;
    const opacityByMode = interpolateModeValue(v, {
      idle: lightCore.opacityByMode.idle ?? 1,
      listening: lightCore.opacityByMode.listening ?? 1,
      processing: lightCore.opacityByMode.processing ?? 1,
      speaking: lightCore.opacityByMode.speaking ?? 1,
    });
    const baseOpacity = lightCore.opacityBase * opacityByMode;
    const organism = scene.organism;
    const presenceOpacityBoost = organism && !v.reduceMotion ? 1 + organism.presence * 0.08 : 1;
    const motionOpacityBoost =
      1 +
      motionEnergy * 0.2 +
      Math.max(0, motionBreath - 0.5) * 0.18 -
      motionSettle * 0.16;
    const transientOpacityBoost = 1 + mod.opacityBias;
    mat.uniforms.uOpacity.value = Math.min(
      1,
      Math.max(0, baseOpacity * presenceOpacityBoost * motionOpacityBoost * transientOpacityBoost),
    );
    const warpScale = interpolateModeValue(v, {
      idle: lightCore.warpScaleByMode.idle ?? 1,
      listening: lightCore.warpScaleByMode.listening ?? 1,
      processing: lightCore.warpScaleByMode.processing ?? 1,
      speaking: lightCore.warpScaleByMode.speaking ?? 1,
    });
    const motionScale = v.reduceMotion ? 0 : warpScale;
    const processingBlend = interpolateModeValue(v, {
      idle: 0,
      listening: 0,
      processing: 1,
      speaking: 0,
    });
    const activityBoost = 1 + processingBlend * v.activity * 0.35;
    const motionWarpBoost =
      1 +
      motionEnergy * 0.65 +
      motionMicro * 0.3 +
      Math.abs(motionBreath - 0.5) * 0.25;
    const settleDamp = 1 - motionSettle * 0.6;
    mat.uniforms.uTime.value = v.clock;
    mat.uniforms.uWarpFreq.value = lightCore.warpFreq;
    const transientWarpBoost = 1 + mod.agitation;
    mat.uniforms.uWarpAmpX.value =
      lightCore.warpAmpX *
      motionScale *
      activityBoost *
      motionWarpBoost *
      settleDamp *
      transientWarpBoost *
      (1 - processingBlend);
    mat.uniforms.uWarpAmpY.value =
      lightCore.warpAmpY *
      motionScale *
      activityBoost *
      motionWarpBoost *
      settleDamp *
      transientWarpBoost;
    const orbStrength = lightCore.orbDebugObvious
      ? lightCore.orbStrength * lightCore.orbDebugMultiplier
      : lightCore.orbStrength;
    const transientOrbBoost = 1 + mod.agitation;
    mat.uniforms.uOrbStrength.value = orbStrength * transientOrbBoost;
    mat.uniforms.uOrbRadius.value = lightCore.orbRadius;
    mat.uniforms.uOrbFalloff.value = lightCore.orbFalloff;
    mat.uniforms.uOrbCenterY.value = lightCore.orbCenterY;

    const beamLeanPct = 0.05;
    const bendAmpScale = 0.09;
    mat.uniforms.uBeamCenterXOffset.value =
      v.reduceMotion || !organism ? 0 : organism.focusBias * beamLeanPct * (1 + motionAttention * 0.18);
    mat.uniforms.uBendAmount.value =
      v.reduceMotion || !organism
        ? 0
        : organism.presence * bendAmpScale * (1 + motionTension * 0.55) * settleDamp;
    mat.uniforms.uBendBias.value = organism ? organism.focusBias : 0;

    mat.blending =
      lightCore.blend === 'additive'
        ? THREE.AdditiveBlending
        : THREE.NormalBlending;
  });

  return (
    <mesh ref={meshRef} visible={false} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <primitive object={shaderMat} attach="material" />
    </mesh>
  );
}
