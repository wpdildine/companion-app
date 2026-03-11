/**
 * Background planes (decon-modern field). Layout and style from visualizationRef.current.scene.backgroundPlanes;
 * only dynamic signals (clock, reduceMotion, panelRects) from ref.
 * Plane 1 (base): broad gradient + vignette + low-freq noise. Plane 2 (detail): asymmetric tile field.
 */

import { useFrame } from '@react-three/fiber/native';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getLayerRuntimeInputs } from '../../engine/layerRuntimeInputs';
import type { VisualizationEngineRef } from '../../engine/types';
import type { LayerDescriptor } from '../../scene/layerDescriptor';
import { createBackgroundDetailMaterial } from '../../materials/background/backgroundDetailMaterial';
import { SHADER_DEBUG_FLAGS } from '../canvas/shaderDebugFlags';
import { getDescriptorRenderOrderBase } from './descriptorRenderOrder';
import { computeTransientModulation, scaleModulation } from '../utils/transientModulation';

// ---- Plane 1: base (gradient + vignette + low-freq noise) ----
const BASE_PLANE_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const BASE_PLANE_FRAGMENT = `
precision mediump float;
varying vec2 vUv;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uNoisePhase;
uniform float uIntensity;
uniform float uVignetteScale;
uniform float uRadialFalloff;
uniform float uValueVariation;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 c = vUv - 0.5;
  float r = length(c);
  float r2 = dot(c, c);
  float vigInner = 0.15;
  float vigOuter = 0.65 - (1.0 - uVignetteScale) * 0.15;
  float vig = 1.0 - smoothstep(vigInner, vigOuter, r2);
  float radialFalloff = 1.0 - uRadialFalloff * smoothstep(0.2, 0.75, r);
  float grad = 0.7 + 0.3 * (1.0 - vUv.y);
  float n = noise(vUv * 3.0 + uNoisePhase) - 0.5;
  float lowFreq = noise(vUv * 1.2 + uNoisePhase * 0.3);
  float mod = 1.0 + (lowFreq - 0.5) * (0.12 + uValueVariation) + n * (0.04 + uValueVariation * 0.5);
  vec3 col = uColor * grad * vig * radialFalloff * mod;
  float a = uOpacity * uIntensity * vig;
  gl_FragColor = vec4(col, a);
}
`;

function getViewSizeAtPos(
  camera: THREE.Camera,
  planePos: THREE.Vector3,
  fallbackViewport: { width: number; height: number },
): { width: number; height: number } {
  // If we can, compute the view size at the plane's depth along the camera's forward axis.
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const camPos = new THREE.Vector3();
  camera.getWorldPosition(camPos);
  const v = new THREE.Vector3().subVectors(planePos, camPos);
  const d = Math.max(0.01, v.dot(dir));

  const anyCam = camera as any;
  if (anyCam?.isPerspectiveCamera) {
    const fovRad = THREE.MathUtils.degToRad(anyCam.fov ?? 50);
    const height = 2 * Math.tan(fovRad / 2) * d;
    const width =
      height *
      (anyCam.aspect ?? fallbackViewport.width / fallbackViewport.height);
    return { width, height };
  }

  if (anyCam?.isOrthographicCamera) {
    const width = Math.abs((anyCam.right ?? 1) - (anyCam.left ?? -1));
    const height = Math.abs((anyCam.top ?? 1) - (anyCam.bottom ?? -1));
    return { width, height };
  }

  return { width: fallbackViewport.width, height: fallbackViewport.height };
}

export function BackgroundLayer({
  visualizationRef,
  descriptor,
}: {
  visualizationRef: React.RefObject<VisualizationEngineRef | null>;
  descriptor?: LayerDescriptor;
}) {
  const g1 = useRef<THREE.Mesh>(null);
  const g2 = useRef<THREE.Mesh>(null);
  const answerPlane = useRef<THREE.Mesh>(null);
  const cardsPlane = useRef<THREE.Mesh>(null);
  const rulesPlane = useRef<THREE.Mesh>(null);
  const colorRef = useRef(new THREE.Color());
  const shiftedColorRef = useRef(new THREE.Color());
  const tmpCamPos = useRef(new THREE.Vector3());
  const tmpDir = useRef(new THREE.Vector3());
  const tmpRight = useRef(new THREE.Vector3());
  const tmpUp = useRef(new THREE.Vector3());
  const tmpPos = useRef(new THREE.Vector3());
  const bgInitializedRef = useRef(false);
  const bgWarmupFramesRef = useRef(0);
  const smoothIntensityRef = useRef(0.8);
  const smoothThresholdRef = useRef(0.4);
  const smoothScaleRef = useRef(1.0);

  const baseMatRef = useRef<THREE.ShaderMaterial | null>(null);
  const detailMatRef = useRef<THREE.ShaderMaterial | null>(null);
  const baseMat = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      vertexShader: BASE_PLANE_VERTEX,
      fragmentShader: BASE_PLANE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Vector3(0.5, 0.5, 0.6) },
        uOpacity: { value: 0.26 },
        uNoisePhase: { value: 0 },
        uIntensity: { value: 0.8 },
        uVignetteScale: { value: 1.25 },
        uRadialFalloff: { value: 0.4 },
        uValueVariation: { value: 0.08 },
      },
    });
    baseMatRef.current = m;
    return m;
  }, []);
  const detailMat = useMemo(() => {
    const m = createBackgroundDetailMaterial();
    detailMatRef.current = m;
    return m;
  }, []);

  const placePanelPlane = (
    mesh: THREE.Mesh | null,
    rect: { x: number; y: number; w: number; h: number } | undefined,
    canvasWidth: number,
    canvasHeight: number,
    fallbackViewportWidth: number,
    fallbackViewportHeight: number,
    camera: THREE.Camera,
    d: number,
  ) => {
    if (!mesh || !mesh.material) return;
    if (!rect || canvasWidth <= 0 || canvasHeight <= 0) {
      mesh.visible = false;
      return;
    }

    const centerX = rect.x + rect.w / 2;
    const centerY = rect.y + rect.h / 2;
    const ndcX = (centerX / canvasWidth) * 2 - 1;
    const ndcY = 1 - (centerY / canvasHeight) * 2;

    // Camera basis
    camera.getWorldPosition(tmpCamPos.current);
    camera.getWorldDirection(tmpDir.current);
    tmpRight.current.crossVectors(tmpDir.current, camera.up).normalize();
    tmpUp.current.crossVectors(tmpRight.current, tmpDir.current).normalize();

    // View size at depth d
    const view = getViewSizeAtPos(
      camera,
      tmpCamPos.current.clone().addScaledVector(tmpDir.current, d),
      {
        width: fallbackViewportWidth,
        height: fallbackViewportHeight,
      },
    );

    // World position corresponding to NDC at depth d
    tmpPos.current
      .copy(tmpCamPos.current)
      .addScaledVector(tmpDir.current, d)
      .addScaledVector(tmpRight.current, ndcX * (view.width / 2))
      .addScaledVector(tmpUp.current, ndcY * (view.height / 2));

    mesh.position.copy(tmpPos.current);
    mesh.quaternion.copy(camera.quaternion);
    mesh.scale.set(
      Math.max(0.001, (rect.w / canvasWidth) * view.width * 1.04),
      Math.max(0.001, (rect.h / canvasHeight) * view.height * 1.06),
      1,
    );
    mesh.visible = true;
  };

  useFrame((state, delta) => {
    const v = visualizationRef.current;
    if (!v) return;
    const runtime = getLayerRuntimeInputs(v);
    const bp = v.scene?.backgroundPlanes;
    const pf = v.scene?.planeField;
    const show = v.vizIntensity !== 'off';
    if (!show) {
      if (g1.current) g1.current.visible = false;
      if (g2.current) g2.current.visible = false;
      bgInitializedRef.current = false;
      bgWarmupFramesRef.current = 0;
      if (baseMatRef.current) baseMatRef.current.uniforms.uIntensity.value = 0;
      if (detailMatRef.current)
        detailMatRef.current.uniforms.uIntensity.value = 0;
      return;
    }
    if (!bp) {
      if (g1.current) g1.current.visible = false;
      if (g2.current) g2.current.visible = false;
      bgInitializedRef.current = false;
      bgWarmupFramesRef.current = 0;
      if (baseMatRef.current) baseMatRef.current.uniforms.uOpacity.value = 0;
      if (detailMatRef.current)
        detailMatRef.current.uniforms.uOpacity.value = 0;
      return;
    }
    if (!pf) {
      if (g1.current) g1.current.visible = false;
      if (g2.current) g2.current.visible = false;
      return;
    }
    const transient = scaleModulation(
      computeTransientModulation(
        runtime.lastEvent ?? null,
        runtime.lastEventTime ?? 0,
        runtime.clock ?? 0,
        scene.transientEffects,
      ),
      pf.modulationWeights,
    );
    const hueShift = (runtime.hueShift ?? 0) + transient.hueShift;
    colorRef.current.setHSL((bp.hue + hueShift) % 1, bp.sat, bp.lum);
    const opacity = Math.max(
      pf.opacityClampMin,
      Math.min(pf.opacityClampMax, bp.opacityBase * (1 + transient.opacityBias)),
    );
    const viewportWidth = state.viewport.width;
    const viewportHeight = state.viewport.height;
    const camera = state.camera;
    // Update screen pixel resolution uniform for screen-space patterns
    const pixelRatio = Math.max(1, state.gl.getPixelRatio?.() ?? 1);
    const resW = Math.max(1, Math.floor(state.size.width * pixelRatio));
    const resH = Math.max(1, Math.floor(state.size.height * pixelRatio));
    if (detailMatRef.current) {
      (detailMatRef.current.uniforms.uResolution.value as THREE.Vector2).set(
        resW,
        resH,
      );
    }
    // Camera basis for background planes
    camera.getWorldPosition(tmpCamPos.current);
    camera.getWorldDirection(tmpDir.current);
    tmpRight.current.crossVectors(tmpDir.current, camera.up).normalize();
    tmpUp.current.crossVectors(tmpRight.current, tmpDir.current).normalize();
    const n = Math.min(bp.count, 2);

    const noisePhase = (runtime.clock ?? 0) * pf.noisePhaseSpeed * (pf.slowDriftScale ?? 1);
    const isProcessing = runtime.mode === 'processing';
    let targetIntensity = isProcessing
      ? pf.intensityProcessingBase + (runtime.activity ?? 0) * pf.intensityProcessingActivityGain
      : pf.intensityIdleBase + (runtime.activity ?? 0) * pf.intensityIdleActivityGain;
    targetIntensity += transient.intensity;
    const motion = v.scene?.motion;
    if (motion) {
      targetIntensity += motion.energy * 0.12;
    }
    const targetThreshold =
      pf.thresholdBase + pf.thresholdAmp * Math.sin((runtime.clock ?? 0) * pf.thresholdHz);
    const targetScale =
      pf.halftoneScaleBase + pf.halftoneScaleAmp * Math.sin((runtime.clock ?? 0) * pf.halftoneScaleHz);

    // ~200ms smoothing to prevent one-frame pops on mode change
    const k = 1.0 - Math.exp(-Math.max(0, delta) / pf.smoothingSeconds);
    smoothIntensityRef.current +=
      (targetIntensity - smoothIntensityRef.current) * k;
    smoothThresholdRef.current +=
      (targetThreshold - smoothThresholdRef.current) * k;
    smoothScaleRef.current += (targetScale - smoothScaleRef.current) * k;

    const intensityRamp = smoothIntensityRef.current;
    const halftoneThreshold = smoothThresholdRef.current;
    const halftoneScale = smoothScaleRef.current;

    if (baseMatRef.current) {
      baseMatRef.current.uniforms.uColor.value.set(
        colorRef.current.r,
        colorRef.current.g,
        colorRef.current.b,
      );
      baseMatRef.current.uniforms.uOpacity.value =
        SHADER_DEBUG_FLAGS.backgroundBase && n >= 1 ? opacity : 0;
      baseMatRef.current.uniforms.uNoisePhase.value = noisePhase;
      baseMatRef.current.uniforms.uIntensity.value = n >= 1 ? intensityRamp : 0;
      baseMatRef.current.uniforms.uVignetteScale.value = pf.vignetteScale ?? 1.25;
      baseMatRef.current.uniforms.uRadialFalloff.value = pf.radialFalloffStrength ?? 0.4;
      baseMatRef.current.uniforms.uValueVariation.value = pf.valueVariation ?? 0.08;
    }
    if (detailMatRef.current) {
      detailMatRef.current.uniforms.uColor.value.set(
        colorRef.current.r,
        colorRef.current.g,
        colorRef.current.b,
      );
      detailMatRef.current.uniforms.uOpacity.value =
        SHADER_DEBUG_FLAGS.backgroundDetail && n >= 2
          ? Math.min(0.95, opacity * (bp.opacitySecond / bp.opacityBase) * 1.8)
          : 0;
      detailMatRef.current.uniforms.uNoisePhase.value = noisePhase;
      detailMatRef.current.uniforms.uIntensity.value =
        SHADER_DEBUG_FLAGS.backgroundDetail && n >= 2 ? intensityRamp : 0;
      detailMatRef.current.uniforms.uHalftoneThreshold.value =
        halftoneThreshold;
      detailMatRef.current.uniforms.uHalftoneScale.value = halftoneScale;
    }

    if (g1.current && bp.planes[0]) {
      const d1 = bp.planes[0].z;
      g1.current.position
        .copy(tmpCamPos.current)
        .addScaledVector(tmpDir.current, d1);
      const view1 = getViewSizeAtPos(camera, g1.current.position, {
        width: viewportWidth,
        height: viewportHeight,
      });
      g1.current.scale.set(
        view1.width * pf.basePlaneScale,
        view1.height * pf.basePlaneScale,
        1,
      );
      g1.current.quaternion.copy(camera.quaternion);
    }
    if (g2.current && bp.planes[1]) {
      const d2 = bp.planes[1].z;
      g2.current.position
        .copy(tmpCamPos.current)
        .addScaledVector(tmpDir.current, d2);
      const view2 = getViewSizeAtPos(camera, g2.current.position, {
        width: viewportWidth,
        height: viewportHeight,
      });
      g2.current.scale.set(
        view2.width * pf.detailPlaneScale,
        view2.height * pf.detailPlaneScale,
        1,
      );
      g2.current.quaternion.copy(camera.quaternion);
      g2.current.visible = SHADER_DEBUG_FLAGS.backgroundDetail && n >= 2;
    }

    // Prevent one-frame flash of default mesh transform on mount/refresh.
    // Require two stable frames before revealing planes.
    if (!bgInitializedRef.current) {
      bgWarmupFramesRef.current += 1;
      if (bgWarmupFramesRef.current >= 2) {
        bgInitializedRef.current = true;
        if (g1.current) g1.current.visible = SHADER_DEBUG_FLAGS.backgroundBase;
        if (g2.current)
          g2.current.visible = SHADER_DEBUG_FLAGS.backgroundDetail && n >= 2;
      } else {
        if (g1.current) g1.current.visible = false;
        if (g2.current) g2.current.visible = false;
      }
    }

    const panelOpacity = opacity * pf.panelOpacityScale;
    const answerMat = answerPlane.current?.material as
      | THREE.MeshBasicMaterial
      | undefined;
    const cardsMat = cardsPlane.current?.material as
      | THREE.MeshBasicMaterial
      | undefined;
    const rulesMat = rulesPlane.current?.material as
      | THREE.MeshBasicMaterial
      | undefined;
    if (answerMat) {
      answerMat.color.copy(colorRef.current);
      answerMat.opacity = panelOpacity * pf.answerOpacityScale;
    }
    if (cardsMat) {
      cardsMat.color.copy(colorRef.current);
      cardsMat.opacity = panelOpacity * pf.cardsOpacityScale;
    }
    if (rulesMat) {
      shiftedColorRef.current
        .copy(colorRef.current)
        .offsetHSL(pf.rulesHueShiftH, pf.rulesHueShiftS, pf.rulesHueShiftL);
      rulesMat.color.copy(shiftedColorRef.current);
      rulesMat.opacity = panelOpacity * pf.rulesOpacityScale;
    }

    const canvasWidth = Math.max(1, v.canvasWidth ?? state.size.width);
    const canvasHeight = Math.max(1, v.canvasHeight ?? state.size.height);
    placePanelPlane(
      answerPlane.current,
      v.panelRects?.answer,
      canvasWidth,
      canvasHeight,
      viewportWidth,
      viewportHeight,
      camera,
      pf.answerPanelDepth,
    );
    placePanelPlane(
      cardsPlane.current,
      v.panelRects?.cards,
      canvasWidth,
      canvasHeight,
      viewportWidth,
      viewportHeight,
      camera,
      pf.cardsPanelDepth,
    );
    placePanelPlane(
      rulesPlane.current,
      v.panelRects?.rules,
      canvasWidth,
      canvasHeight,
      viewportWidth,
      viewportHeight,
      camera,
      pf.rulesPanelDepth,
    );
  }, 10);

  const scene = visualizationRef.current?.scene;
  const bp = scene?.backgroundPlanes;
  const layers = scene?.layers;
  if (!bp || !layers?.background) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error(
        '[BackgroundLayer] visualizationRef.current.scene.backgroundPlanes or scene.layers is missing. Set visualizationRef.current.scene = getSceneDescription() in the screen that mounts the viz (e.g. VoiceScreen ref initializer).',
      );
    }
    return null;
  }

  const color = new THREE.Color().setHSL(bp.hue, bp.sat, bp.lum);
  const backgroundRenderOrderBase = getDescriptorRenderOrderBase(
    scene,
    descriptor,
    'background',
    layers.background.renderOrderBase,
  );

  return (
    <>
      <mesh
        ref={g1}
        position={[0, 0, 0]}
        scale={[1, 1, 1]}
        visible={false}
        frustumCulled={false}
        renderOrder={backgroundRenderOrderBase + 0}
      >
        <planeGeometry args={[1, 1]} />
        <primitive object={baseMat} attach="material" />
      </mesh>
      <mesh
        ref={g2}
        position={[0, 0, 0]}
        scale={[1, 1, 1]}
        visible={false}
        frustumCulled={false}
        renderOrder={backgroundRenderOrderBase + 1}
      >
        <planeGeometry args={[1, 1]} />
        <primitive object={detailMat} attach="material" />
      </mesh>
      <mesh
        ref={answerPlane}
        position={[0, 0, 0]}
        scale={[1, 1, 1]}
        visible={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.12}
          depthWrite={false}
          depthTest={false}
          blending={THREE.NormalBlending}
        />
      </mesh>
      <mesh
        ref={cardsPlane}
        position={[0, 0, 0]}
        scale={[1, 1, 1]}
        visible={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.14}
          depthWrite={false}
          depthTest={false}
          blending={THREE.NormalBlending}
        />
      </mesh>
      <mesh
        ref={rulesPlane}
        position={[0, 0, 0]}
        scale={[1, 1, 1]}
        visible={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.14}
          depthWrite={false}
          depthTest={false}
          blending={THREE.NormalBlending}
        />
      </mesh>
    </>
  );
}
