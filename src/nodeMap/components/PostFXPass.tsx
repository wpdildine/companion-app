import { useFrame, useThree } from '@react-three/fiber/native';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { NodeMapEngineRef } from '../types';

/** Set to false to re-enable vignette / grain / chromatic (cinematic). */
const POST_FX_DISABLED = false;

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

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec2 centered = vUv - 0.5;
    float r2 = dot(centered, centered);

    // Chromatic offset: subtle radial CA.
    vec2 dir = normalize(centered + vec2(1e-6, 0.0));
    vec2 ca = dir * uChromatic * (0.35 + r2 * 0.85);

    float sceneR = texture2D(uScene, clamp(vUv + ca, 0.0, 1.0)).r;
    float sceneG = texture2D(uScene, vUv).g;
    float sceneB = texture2D(uScene, clamp(vUv - ca, 0.0, 1.0)).b;
    vec3 col = vec3(sceneR, sceneG, sceneB);

    // Vignette: r2 is 0 at center, ~0.5 at corners.
    // ramp = 0 at center -> 1 at edges.
    float ramp = smoothstep(0.10, 0.55, r2);
    float vig = 1.0 - ramp;
    col *= mix(1.0, vig, clamp(uVignette, 0.0, 1.0));

    // Grain: stable per-frame to avoid shimmer/flicker on mobile.
    float frame = floor(uTime * 60.0);
    float n = hash(vUv * uResolution.xy + frame * 19.19) - 0.5;
    col += n * uGrain;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function PostFXPass({
  nodeMapRef,
}: {
  nodeMapRef: React.RefObject<NodeMapEngineRef | null>;
}) {
  const { gl, scene, camera, size } = useThree();
  const postCamera = useMemo(
    () => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    [],
  );
  const postScene = useMemo(() => new THREE.Scene(), []);
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
          uVignette: { value: 0.28 },
          uChromatic: { value: 0.0018 },
          uGrain: { value: 0.05 },
        },
        vertexShader: postVertex,
        fragmentShader: postFragment,
        depthWrite: false,
        depthTest: false,
      }),
    [],
  );

  useEffect(() => {
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
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
    };
  }, [material, renderTarget]);

  useFrame((_state, delta) => {
    const v = nodeMapRef.current;
    if (!v || POST_FX_DISABLED) {
      gl.setRenderTarget(null);
      gl.clear();
      gl.render(scene, camera);
      return;
    }

    // Save and disable autoClear for manual multi-pass compositing.
    const prevAutoClear = gl.autoClear;
    const prevAutoClearColor = gl.autoClearColor;
    const prevAutoClearDepth = gl.autoClearDepth;
    const prevAutoClearStencil = gl.autoClearStencil;

    // We manage clearing manually for multi-pass compositing.
    gl.autoClear = false;
    gl.autoClearColor = false;
    gl.autoClearDepth = false;
    gl.autoClearStencil = false;

    material.uniforms.uScene.value = renderTarget.texture;
    material.uniforms.uTime.value = _state.clock.getElapsedTime();
    material.uniforms.uVignette.value = v.postFxVignette;
    material.uniforms.uChromatic.value = v.postFxChromatic;
    material.uniforms.uGrain.value = v.postFxGrain;

    const cam = camera as THREE.PerspectiveCamera;
    const prevLayers = cam.layers.mask;

    // Pass A: render only background (layer 1) to renderTarget
    cam.layers.set(BACKGROUND_LAYER);
    gl.setRenderTarget(renderTarget);
    gl.clear();
    gl.render(scene, camera);

    // Draw post-processed background to screen
    gl.setRenderTarget(null);
    gl.clear();
    gl.render(postScene, postCamera);

    // Clear depth only so foreground composites over the already-drawn post quad.
    gl.clearDepth();
    gl.clear(false, true, false);

    // Pass B: render foreground (layer 0) on top, no PostFX
    cam.layers.set(0);
    gl.render(scene, camera);

    cam.layers.mask = prevLayers;

    // Restore renderer autoClear flags.
    gl.autoClear = prevAutoClear;
    gl.autoClearColor = prevAutoClearColor;
    gl.autoClearDepth = prevAutoClearDepth;
    gl.autoClearStencil = prevAutoClearStencil;
  }, 1);

  return null;
}
