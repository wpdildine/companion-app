/**
 * Background planes (decon-modern field). Layout and style from nodeMapRef.current.scene.backgroundPlanes;
 * only dynamic signals (clock, reduceMotion, panelRects) from ref.
 * Plane 1 (base): broad gradient + vignette + low-freq noise. Plane 2 (detail): halftone + microgrid + speckle (screen feel).
 */

import { useFrame } from '@react-three/fiber/native';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { NodeMapEngineRef } from '../types';
import { BACKGROUND_LAYER } from './PostFXPass';
import { SHADER_DEBUG_FLAGS } from './shaderDebugFlags';

const SEED = 12.9898;

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
  float r2 = dot(c, c);
  float vig = 1.0 - smoothstep(0.15, 0.65, r2);
  float grad = 0.7 + 0.3 * (1.0 - vUv.y);
  float n = noise(vUv * 3.0 + uNoisePhase) - 0.5;
  float lowFreq = noise(vUv * 1.2 + uNoisePhase * 0.3);
  float mod = 1.0 + (lowFreq - 0.5) * 0.12 + n * 0.04;
  vec3 col = uColor * grad * vig * mod;
  float a = uOpacity * uIntensity;
  gl_FragColor = vec4(col, a);
}
`;

// ---- Plane 2: detail (halftone + microgrid + speckle, screen feel) ----
const DETAIL_PLANE_VERTEX = BASE_PLANE_VERTEX;

const DETAIL_PLANE_FRAGMENT = `
precision mediump float;

varying vec2 vUv;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uNoisePhase;
uniform float uIntensity;
uniform float uHalftoneThreshold;
uniform float uHalftoneScale;
uniform vec2 uResolution;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  // Aspect-correct screen-space UV so halftone dots stay circular on non-square viewports.
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / res;
  float aspect = res.x / res.y;
  vec2 uvIso = vec2(uv.x * aspect, uv.y);
  float speckle = noise(uvIso * 60.0 + uNoisePhase * 0.6) - 0.5;

  float microgrid = 0.0;
  float gridFreq = 140.0;
  vec2 g = fract(uvIso * gridFreq);
  // Derivative-free AA approximation based on pixel size.
  float px = 1.0 / max(1.0, min(uResolution.x, uResolution.y));
  float aaX = px * gridFreq;
  float aaY = px * gridFreq;
  float lineX = smoothstep(1.0 - (0.04 + aaX), 1.0 - (0.04 - aaX), g.x);
  float lineY = smoothstep(1.0 - (0.04 + aaY), 1.0 - (0.04 - aaY), g.y);
  microgrid = clamp((lineX + lineY) * 0.35, 0.0, 1.0);

  // Halftone: AA circular dots in screen space.
  float cell = (72.0 / max(0.25, uHalftoneScale)); // larger -> more dots
  vec2 p = uvIso * cell + uNoisePhase * 0.15;
  vec2 f = fract(p) - 0.5;
  float d = length(f);
  float dotR = 0.28;
  // Derivative-free AA: approximate edge width in UV units.
  float px2 = 1.0 / max(1.0, min(uResolution.x, uResolution.y));
  float aa = px2 * cell;
  float dot = 1.0 - smoothstep(dotR - aa, dotR + aa, d);
  // Threshold controls how "filled" the dots feel.
  float halftone = smoothstep(uHalftoneThreshold - 0.08, uHalftoneThreshold + 0.08, dot);

  float detail = halftone * 0.5 + microgrid + speckle * 0.15;
  detail = clamp(detail, 0.0, 1.0);
  vec3 col = uColor * (0.4 + 0.6 * detail);
  float a = uOpacity * uIntensity * (0.7 + detail * 0.3);
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

export function PlaneLayerField({
  nodeMapRef,
}: {
  nodeMapRef: React.RefObject<NodeMapEngineRef | null>;
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
      },
    });
    baseMatRef.current = m;
    return m;
  }, []);
  const detailMat = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      vertexShader: DETAIL_PLANE_VERTEX,
      fragmentShader: DETAIL_PLANE_FRAGMENT,
      // Removed: extensions: { derivatives: true },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Vector3(0.5, 0.5, 0.6) },
        uOpacity: { value: 0.18 },
        uNoisePhase: { value: 0 },
        uIntensity: { value: 0.8 },
        uHalftoneThreshold: { value: 0.4 },
        uHalftoneScale: { value: 1.0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
      },
    });
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
    const v = nodeMapRef.current;
    if (!v) return;
    const bp = v.scene?.backgroundPlanes;
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
    const hueShift = v.hueShift ?? 0;
    colorRef.current.setHSL((bp.hue + hueShift) % 1, bp.sat, bp.lum);
    const opacity = Math.max(0.25, Math.min(0.65, bp.opacityBase));
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
    const viewportMin = Math.min(viewportWidth, viewportHeight);
    const driftBase = bp.driftPxNorm * viewportMin;
    const modeFactor = v.currentMode === 'processing' ? 1.2 : 1;
    const driftWorld = v.reduceMotion ? 0 : driftBase * 0.1 * modeFactor;
    const n = Math.min(bp.count, 2);

    const noisePhase = v.clock * 0.12;
    const isProcessing = v.currentMode === 'processing';
    const targetIntensity = isProcessing
      ? 0.85 + v.activity * 0.15
      : 0.6 + v.activity * 0.25;
    const targetThreshold = 0.38 + 0.08 * Math.sin(v.clock * 0.4);
    const targetScale = 0.92 + 0.12 * Math.sin(v.clock * 0.28);

    // ~200ms smoothing to prevent one-frame pops on mode change
    const k = 1.0 - Math.exp(-Math.max(0, delta) / 0.2);
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
    }
    if (detailMatRef.current) {
      detailMatRef.current.uniforms.uColor.value.set(
        colorRef.current.r,
        colorRef.current.g,
        colorRef.current.b,
      );
      detailMatRef.current.uniforms.uOpacity.value =
        SHADER_DEBUG_FLAGS.backgroundDetail && n >= 2
          ? opacity * (bp.opacitySecond / bp.opacityBase)
          : 0;
      detailMatRef.current.uniforms.uNoisePhase.value = noisePhase;
      detailMatRef.current.uniforms.uIntensity.value =
        n >= 2 ? intensityRamp : 0;
      detailMatRef.current.uniforms.uHalftoneThreshold.value =
        halftoneThreshold;
      detailMatRef.current.uniforms.uHalftoneScale.value = halftoneScale;
    }

    if (g1.current) {
      const d1 = 6.5;
      g1.current.position
        .copy(tmpCamPos.current)
        .addScaledVector(tmpDir.current, d1);
      const view1 = getViewSizeAtPos(camera, g1.current.position, {
        width: viewportWidth,
        height: viewportHeight,
      });
      g1.current.scale.set(view1.width * 1.22, view1.height * 1.22, 1);
      g1.current.quaternion.copy(camera.quaternion);
    }
    if (g2.current) {
      const d2 = 6.7;
      g2.current.position
        .copy(tmpCamPos.current)
        .addScaledVector(tmpDir.current, d2);
      const view2 = getViewSizeAtPos(camera, g2.current.position, {
        width: viewportWidth,
        height: viewportHeight,
      });
      g2.current.scale.set(view2.width * 1.6, view2.height * 1.6, 1);
      g2.current.quaternion.copy(camera.quaternion);
    }

    // Prevent one-frame flash of default mesh transform on mount/refresh.
    // Require two stable frames before revealing planes.
    if (!bgInitializedRef.current) {
      bgWarmupFramesRef.current += 1;
      if (bgWarmupFramesRef.current >= 2) {
        bgInitializedRef.current = true;
        if (g1.current) g1.current.visible = SHADER_DEBUG_FLAGS.backgroundBase;
        if (g2.current)
          g2.current.visible = SHADER_DEBUG_FLAGS.backgroundDetail;
      } else {
        if (g1.current) g1.current.visible = false;
        if (g2.current) g2.current.visible = false;
      }
    }

    const panelOpacity = opacity * 0.48;
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
      answerMat.opacity = panelOpacity * 0.65;
    }
    if (cardsMat) {
      cardsMat.color.copy(colorRef.current);
      cardsMat.opacity = panelOpacity;
    }
    if (rulesMat) {
      shiftedColorRef.current
        .copy(colorRef.current)
        .offsetHSL(0.02, 0.02, 0.03);
      rulesMat.color.copy(shiftedColorRef.current);
      rulesMat.opacity = panelOpacity * 0.95;
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
      6.2,
    );
    placePanelPlane(
      cardsPlane.current,
      v.panelRects?.cards,
      canvasWidth,
      canvasHeight,
      viewportWidth,
      viewportHeight,
      camera,
      6.3,
    );
    placePanelPlane(
      rulesPlane.current,
      v.panelRects?.rules,
      canvasWidth,
      canvasHeight,
      viewportWidth,
      viewportHeight,
      camera,
      6.35,
    );
  }, 10);

  const bp = nodeMapRef.current?.scene?.backgroundPlanes;
  if (!bp) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error(
        '[PlaneLayerField] nodeMapRef.current.scene.backgroundPlanes is missing. Set nodeMapRef.current.scene = getSceneDescription() in the screen that mounts the viz (e.g. VoiceScreen ref initializer).',
      );
    }
    return null;
  }

  const color = new THREE.Color().setHSL(bp.hue, bp.sat, bp.lum);

  return (
    <>
      <mesh
        ref={g1}
        position={[0, 0, 0]}
        scale={[1, 1, 1]}
        visible={false}
        layers={BACKGROUND_LAYER}
        frustumCulled={false}
        renderOrder={-100}
      >
        <planeGeometry args={[1, 1]} />
        <primitive object={baseMat} attach="material" />
      </mesh>
      <mesh
        ref={g2}
        position={[0, 0, 0]}
        scale={[1, 1, 1]}
        visible={false}
        layers={BACKGROUND_LAYER}
        frustumCulled={false}
        renderOrder={-99}
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
