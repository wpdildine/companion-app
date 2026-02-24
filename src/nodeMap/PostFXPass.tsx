import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VizEngineRef } from './types';

const postVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const postFragment = `
  precision highp float;
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
    vec2 dir = normalize(centered + vec2(1e-6, 0.0));
    vec2 ca = dir * uChromatic * (0.35 + r2 * 0.85);

    float sceneR = texture2D(uScene, clamp(vUv + ca, 0.0, 1.0)).r;
    float sceneG = texture2D(uScene, vUv).g;
    float sceneB = texture2D(uScene, clamp(vUv - ca, 0.0, 1.0)).b;
    vec3 col = vec3(sceneR, sceneG, sceneB);

    float vig = smoothstep(0.95, 0.2, r2);
    col *= mix(1.0, vig, clamp(uVignette, 0.0, 1.0));

    float n = hash(vUv * uResolution.xy + uTime * 61.7) - 0.5;
    col += n * uGrain;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function PostFXPass({
  vizRef,
}: {
  vizRef: React.RefObject<VizEngineRef | null>;
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
    material.uniforms.uResolution.value.set(
      w,
      h,
    );
  }, [gl, material, renderTarget, size.width, size.height]);

  useEffect(() => {
    return () => {
      renderTarget.dispose();
      material.dispose();
    };
  }, [material, renderTarget]);

  useFrame((state, delta) => {
    const v = vizRef.current;
    if (!v || !v.postFxEnabled) {
      gl.setRenderTarget(null);
      gl.clear();
      gl.render(scene, camera);
      return;
    }

    material.uniforms.uScene.value = renderTarget.texture;
    material.uniforms.uTime.value += delta;
    material.uniforms.uVignette.value = v.postFxVignette;
    material.uniforms.uChromatic.value = v.postFxChromatic;
    material.uniforms.uGrain.value = v.postFxGrain;

    gl.setRenderTarget(renderTarget);
    gl.clear();
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    gl.clear();
    gl.render(postScene, postCamera);
  }, 1);

  return null;
}
