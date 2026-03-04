import { useFrame, useThree } from '@react-three/fiber/native';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { VisualizationEngineRef } from '../../engine/types';
import { SHADER_DEBUG_FLAGS } from './shaderDebugFlags';

/** Set to false to re-enable vignette / grain / chromatic (cinematic). */
const POST_FX_DISABLED = false;

/** Post-FX tuning knobs (single place to adjust look). */
const POSTFX_DEFAULT_VIGNETTE = 0.78;
const POSTFX_MIN_VIGNETTE = 0.62;
const POSTFX_DEFAULT_CHROMATIC = 0.0018;
const POSTFX_DEFAULT_GRAIN = 0.05;
const POSTFX_SMOOTH_SECONDS = 0.18;
const POSTFX_VIGNETTE_INNER = 0.06;
const POSTFX_VIGNETTE_OUTER = 0.42;
const POSTFX_CHROMA_REF_MIN_RES = 1080;

/** Layer index for background-only pass (vignette/grain). Foreground stays on layer 0. */
export const BACKGROUND_LAYER = 1;

const postVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const postFragment = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif

  varying vec2 vUv;
  uniform sampler2D uScene;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uVignette;
  uniform float uChromatic;
  uniform float uGrain;
  uniform sampler2D uGrainTex;

  void main() {
    vec2 centered = vUv - 0.5;
    float r2 = dot(centered, centered);

    vec3 col;
    if (uChromatic <= 0.000001) {
      col = texture2D(uScene, vUv).rgb;
    } else {
      // Chromatic offset: subtle radial CA.
      vec2 dir = normalize(centered + vec2(1e-6, 0.0));
      vec2 ca = dir * uChromatic * (0.35 + r2 * 0.85);
      float sceneR = texture2D(uScene, clamp(vUv + ca, 0.0, 1.0)).r;
      float sceneG = texture2D(uScene, vUv).g;
      float sceneB = texture2D(uScene, clamp(vUv - ca, 0.0, 1.0)).b;
      col = vec3(sceneR, sceneG, sceneB);
    }

    // Vignette: r2 is 0 at center, ~0.5 at corners.
    // ramp = 0 at center -> 1 at edges.
    float ramp = smoothstep(${POSTFX_VIGNETTE_INNER.toFixed(
      2,
    )}, ${POSTFX_VIGNETTE_OUTER.toFixed(2)}, r2);
    float vig = 1.0 - ramp;
    col *= mix(1.0, vig, clamp(uVignette, 0.0, 1.0));

    // Grain: texture-based (blue-noise-style) to avoid hash artifacts on mobile GPUs.
    if (uGrain > 0.000001) {
      vec2 grainUv = fract(vUv * (uResolution.xy / 64.0) + vec2(uTime * 0.013, uTime * 0.017));
      float n = texture2D(uGrainTex, grainUv).r - 0.5;
      col += n * uGrain;
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function PostFXPass({
  visualizationRef,
}: {
  visualizationRef: React.RefObject<VisualizationEngineRef | null>;
}) {
  const { gl, scene, camera, size } = useThree();
  const postCamera = useMemo(
    () => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    [],
  );
  const postScene = useMemo(() => new THREE.Scene(), []);
  const grainTex = useMemo(() => {
    const dim = 64;
    const data = new Uint8Array(dim * dim * 4);
    for (let i = 0; i < dim * dim; i++) {
      // Uniform grayscale noise packed in RGB; alpha opaque.
      const v = Math.floor(Math.random() * 256);
      const o = i * 4;
      data[o] = v;
      data[o + 1] = v;
      data[o + 2] = v;
      data[o + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, dim, dim, THREE.RGBAFormat);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }, []);
  const renderTarget = useMemo(
    () =>
      new THREE.WebGLRenderTarget(1, 1, {
        depthBuffer: false,
        stencilBuffer: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      }),
    [],
  );
  useEffect(() => {
    renderTarget.texture.generateMipmaps = false;
  }, [renderTarget]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uScene: { value: null as THREE.Texture | null },
          uResolution: { value: new THREE.Vector2(1, 1) },
          uTime: { value: 0 },
          uVignette: { value: POSTFX_DEFAULT_VIGNETTE },
          uChromatic: { value: POSTFX_DEFAULT_CHROMATIC },
          uGrain: { value: POSTFX_DEFAULT_GRAIN },
          uGrainTex: { value: grainTex },
        },
        vertexShader: postVertex,
        fragmentShader: postFragment,
        depthWrite: false,
        depthTest: false,
      }),
    [grainTex],
  );

  useEffect(() => {
    // Fullscreen triangle avoids diagonal seam artifacts that can appear with 2-triangle quads.
    const tri = new THREE.BufferGeometry();
    tri.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [-1, -1, 0, 3, -1, 0, -1, 3, 0],
        3,
      ),
    );
    tri.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2),
    );
    const quad = new THREE.Mesh(tri, material);
    postScene.add(quad);
    return () => {
      postScene.remove(quad);
      quad.geometry.dispose();
    };
  }, [material, postScene]);

  useEffect(() => {
    const pixelRatio = Math.max(1, gl.getPixelRatio?.() ?? 1);
    const w = Math.max(1, Math.floor(size.width * pixelRatio));
    const h = Math.max(1, Math.floor(size.height * pixelRatio));
    renderTarget.setSize(w, h);
    material.uniforms.uResolution.value.set(w, h);
  }, [gl, material, renderTarget, size.width, size.height]);

  useEffect(() => {
    return () => {
      renderTarget.dispose();
      material.dispose();
      grainTex.dispose();
    };
  }, [grainTex, material, renderTarget]);

  const smoothFxRef = useRef({
    vignette: POSTFX_DEFAULT_VIGNETTE,
    chromatic: POSTFX_DEFAULT_CHROMATIC,
    grain: POSTFX_DEFAULT_GRAIN,
  });
  const postReadyRef = useRef(false);
  const postWarmupFramesRef = useRef(0);
  const lastRtSizeRef = useRef({ w: 0, h: 0 });

  useFrame((_state, delta) => {
    const v = visualizationRef.current;
    if (!v || POST_FX_DISABLED || !SHADER_DEBUG_FLAGS.postFx) {
      gl.setRenderTarget(null);
      gl.clear();
      gl.render(scene, camera);
      return;
    }

    const pixelRatio = Math.max(1, gl.getPixelRatio?.() ?? 1);
    const expectedW = Math.max(1, Math.floor(size.width * pixelRatio));
    const expectedH = Math.max(1, Math.floor(size.height * pixelRatio));
    const rtW = (renderTarget as unknown as { width?: number }).width ?? 0;
    const rtH = (renderTarget as unknown as { height?: number }).height ?? 0;
    const sizeChanged =
      expectedW !== lastRtSizeRef.current.w ||
      expectedH !== lastRtSizeRef.current.h;
    if (sizeChanged) {
      lastRtSizeRef.current = { w: expectedW, h: expectedH };
      postReadyRef.current = false;
      postWarmupFramesRef.current = 0;
    }
    if (rtW !== expectedW || rtH !== expectedH) {
      gl.setRenderTarget(null);
      gl.clear();
      gl.render(scene, camera);
      return;
    }
    if (!postReadyRef.current) {
      postWarmupFramesRef.current += 1;
      if (postWarmupFramesRef.current < 3) {
        gl.setRenderTarget(null);
        gl.clear();
        gl.render(scene, camera);
        return;
      }
      postReadyRef.current = true;
    }

    material.uniforms.uScene.value = renderTarget.texture;
    material.uniforms.uTime.value = _state.clock.getElapsedTime();

    // Smooth post-FX over ~180ms to prevent step-change flash on mode flip
    const kFx = 1.0 - Math.exp(-Math.max(0, delta) / POSTFX_SMOOTH_SECONDS);
    let targetVignette = Math.max(POSTFX_MIN_VIGNETTE, v.postFxVignette);
    let targetChromatic = Math.max(
      POSTFX_DEFAULT_CHROMATIC,
      v.postFxChromatic,
    );
    let targetGrain = Math.max(POSTFX_DEFAULT_GRAIN, v.postFxGrain);
    smoothFxRef.current.vignette +=
      (targetVignette - smoothFxRef.current.vignette) * kFx;
    // Normalize chroma in pixel space so perceived strength is consistent across resolutions.
    const minRes = Math.max(1, Math.min(expectedW, expectedH));
    const chromaResolutionScale = THREE.MathUtils.clamp(
      POSTFX_CHROMA_REF_MIN_RES / minRes,
      0.65,
      1.6,
    );
    const effectiveTargetChromatic = targetChromatic * chromaResolutionScale;
    const effectiveTargetGrain = targetGrain;
    smoothFxRef.current.chromatic +=
      (effectiveTargetChromatic - smoothFxRef.current.chromatic) * kFx;
    smoothFxRef.current.grain +=
      (effectiveTargetGrain - smoothFxRef.current.grain) * kFx;
    material.uniforms.uVignette.value = smoothFxRef.current.vignette;
    material.uniforms.uChromatic.value = smoothFxRef.current.chromatic;
    material.uniforms.uGrain.value = smoothFxRef.current.grain;

    const cam = camera as THREE.PerspectiveCamera;
    const prevLayers = cam.layers.mask;

    // Pass A: render full scene into post target so chromatic/vignette/grain apply globally.
    cam.layers.enableAll();
    gl.setRenderTarget(renderTarget);
    gl.clear();
    gl.render(scene, camera);

    // Draw post-processed image to screen.
    gl.setRenderTarget(null);
    gl.clear();
    gl.render(postScene, postCamera);

    cam.layers.mask = prevLayers;
  }, 1);

  return null;
}
