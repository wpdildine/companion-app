/**
 * Spine light-core layer: single backlight beam between background and spine.
 * Dumb renderer: reads scene.spine + scene.spineLightCore + scene.layers only.
 */

import { useFrame } from '@react-three/fiber/native';
import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { VisualizationEngineRef } from '../../engine/types';
import type { CanonicalSceneMode } from '../../scene/canonicalMode';

function toCanonicalMode(mode: string): CanonicalSceneMode {
  switch (mode) {
    case 'idle':
    case 'listening':
    case 'processing':
    case 'speaking':
      return mode;
    default:
      return 'idle';
  }
}

export function SpineLightCoreLayer({
  visualizationRef,
}: {
  visualizationRef: React.RefObject<VisualizationEngineRef | null>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const cameraPosRef = useRef(new THREE.Vector3());
  const cameraDirRef = useRef(new THREE.Vector3());
  const cameraUpRef = useRef(new THREE.Vector3());
  const shaderMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color('#8fd6ff') },
          uOpacity: { value: 0 },
          uTime: { value: 0 },
          uWarpAmpX: { value: 0 },
          uWarpAmpY: { value: 0 },
          uWarpFreq: { value: 0.12 },
          uOrbStrength: { value: 0.8 },
          uOrbRadius: { value: 0.2 },
          uOrbFalloff: { value: 2.0 },
          uOrbCenterY: { value: 0.5 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision mediump float;
          varying vec2 vUv;
          uniform vec3 uColor;
          uniform float uOpacity;
          uniform float uTime;
          uniform float uWarpAmpX;
          uniform float uWarpAmpY;
          uniform float uWarpFreq;
          uniform float uOrbStrength;
          uniform float uOrbRadius;
          uniform float uOrbFalloff;
          uniform float uOrbCenterY;
          void main() {
            vec2 uv = vUv;
            uv.x += sin((vUv.y + uTime * uWarpFreq) * 6.2831853) * uWarpAmpX;
            uv.y += sin((vUv.x - uTime * uWarpFreq * 0.73) * 6.2831853) * uWarpAmpY;
            vec2 c = uv - vec2(0.5);
            float r = length(c);
            float radialCore = exp(-pow(r / 0.29, 2.0));
            float radialFalloff = 1.0 - smoothstep(0.24, 0.62, r);
            float centerBoost = 0.84 + 0.9 * radialCore;
            vec2 orbCenter = vec2(0.5, uOrbCenterY);
            float orbDist = length(uv - orbCenter);
            float orb = exp(-pow(orbDist / max(0.0001, uOrbRadius), max(0.1, uOrbFalloff)));
            float alpha = uOpacity * radialCore * radialFalloff * centerBoost;
            alpha *= (1.0 + orb * uOrbStrength);
            if (alpha < 0.001) discard;
            vec3 rgb = uColor * (1.0 + orb * (uOrbStrength * 0.35));
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

  useFrame(state => {
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
    mesh.renderOrder = layers.spineLightCore.renderOrderBase;

    const mode = toCanonicalMode(v.currentMode);
    mat.uniforms.uColor.value.set(lightCore.color);
    mat.uniforms.uOpacity.value = Math.min(
      1,
      Math.max(0, lightCore.opacityBase * (lightCore.opacityByMode[mode] ?? 1)),
    );
    const warpScale = lightCore.warpScaleByMode[mode] ?? 1;
    const motionScale = v.reduceMotion ? 0 : warpScale;
    const activityBoost = 1 + (mode === 'processing' ? v.activity * 0.35 : 0);
    mat.uniforms.uTime.value = v.clock;
    mat.uniforms.uWarpFreq.value = lightCore.warpFreq;
    mat.uniforms.uWarpAmpX.value =
      lightCore.warpAmpX * motionScale * activityBoost;
    mat.uniforms.uWarpAmpY.value =
      lightCore.warpAmpY * motionScale * activityBoost;
    const orbStrength = lightCore.orbDebugObvious
      ? lightCore.orbStrength * lightCore.orbDebugMultiplier
      : lightCore.orbStrength;
    mat.uniforms.uOrbStrength.value = orbStrength;
    mat.uniforms.uOrbRadius.value = lightCore.orbRadius;
    mat.uniforms.uOrbFalloff.value = lightCore.orbFalloff;
    mat.uniforms.uOrbCenterY.value = lightCore.orbCenterY;
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
