/**
 * Back plane layer: rear structural slabs behind the spine.
 * Dumb renderer: reads scene.backPlane and scene.layers.backPlane only.
 * Optional: scene.motion with very low gains for mode coupling.
 */

import { useFrame } from '@react-three/fiber/native';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { VisualizationEngineRef } from '../../engine/types';

const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = `
precision mediump float;
varying vec2 vUv;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uNoisePhase;

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
  vec2 c = vUv - 0.5;
  float r2 = dot(c, c);
  float vig = 1.0 - smoothstep(0.12, 0.7, r2);
  float n = noise(vUv * 2.0 + uNoisePhase) - 0.5;
  float mod = 1.0 + n * 0.06;
  vec3 col = uColor * vig * mod;
  float a = uOpacity * vig;
  gl_FragColor = vec4(col, a);
}
`;

function getViewSizeAtPos(
  camera: THREE.Camera,
  planePos: THREE.Vector3,
  fallback: { width: number; height: number },
): { width: number; height: number } {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const camPos = new THREE.Vector3();
  camera.getWorldPosition(camPos);
  const v = new THREE.Vector3().subVectors(planePos, camPos);
  const d = Math.max(0.01, v.dot(dir));
  const cam = camera as THREE.PerspectiveCamera;
  if (cam.isPerspectiveCamera) {
    const fovRad = THREE.MathUtils.degToRad(cam.fov ?? 50);
    const height = 2 * Math.tan(fovRad / 2) * d;
    const width = height * (cam.aspect ?? fallback.width / fallback.height);
    return { width, height };
  }
  return fallback;
}

export function BackPlaneLayer({
  visualizationRef,
}: {
  visualizationRef: React.RefObject<VisualizationEngineRef | null>;
}) {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const tmpCamPos = useRef(new THREE.Vector3());
  const tmpDir = useRef(new THREE.Vector3());
  const colorRef = useRef(new THREE.Color(0.45, 0.48, 0.58));

  const materials = useMemo(() => {
    return [
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.NormalBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uColor: { value: new THREE.Vector3(0.45, 0.48, 0.58) },
          uOpacity: { value: 0.12 },
          uNoisePhase: { value: 0 },
        },
      }),
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.NormalBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uColor: { value: new THREE.Vector3(0.45, 0.48, 0.58) },
          uOpacity: { value: 0.07 },
          uNoisePhase: { value: 0.3 },
        },
      }),
    ];
  }, []);

  useFrame((state) => {
    const v = visualizationRef.current;
    if (!v?.scene?.backPlane?.planes.length) return;
    const bp = v.scene.backPlane;
    const layers = v.scene.layers;
    const backPlaneRo = layers?.backPlane?.renderOrderBase ?? 1250;
    const camera = state.camera;
    const viewport = { width: state.viewport.width, height: state.viewport.height };
    camera.getWorldPosition(tmpCamPos.current);
    camera.getWorldDirection(tmpDir.current);
    const motion = v.scene?.motion;
    const motionGain = motion ? motion.energy * 0.12 : 0;

    for (let i = 0; i < bp.planes.length; i++) {
      const plane = bp.planes[i]!;
      const mesh = meshRefs.current[i];
      if (!mesh) continue;
      const driftScale = plane.driftScale ?? 0.4;
      const noisePhase = v.clock * 0.08 * driftScale + motionGain * 0.5;
      const mat = mesh.material as THREE.ShaderMaterial;
      if (mat.uniforms) {
        mat.uniforms.uOpacity.value = plane.opacityBase * (1 + motionGain * 0.3);
        mat.uniforms.uNoisePhase.value = noisePhase;
        // EXGL/iOS: uColor is a vec3 uniform backed by THREE.Vector3.
        // Do not use Vector3.copy(Color): Color has r/g/b (not x/y/z), which can produce
        // undefined components and crash uniform3fv with "unsupported type".
        mat.uniforms.uColor.value.set(
          colorRef.current.r,
          colorRef.current.g,
          colorRef.current.b,
        );
      }
      const z = plane.z;
      mesh.position
        .copy(tmpCamPos.current)
        .addScaledVector(tmpDir.current, z);
      const view = getViewSizeAtPos(camera, mesh.position, viewport);
      const sx = (plane.scaleX ?? 1.35) * view.width;
      const sy = (plane.scaleY ?? 1.35) * view.height;
      mesh.scale.set(sx, sy, 1);
      mesh.quaternion.copy(camera.quaternion);
      mesh.renderOrder = backPlaneRo + i;
    }
  });

  const scene = visualizationRef.current?.scene;
  const bp = scene?.backPlane;
  const layers = scene?.layers;
  if (!bp || bp.count === 0 || !layers?.backPlane) return null;

  const backPlaneRo = layers.backPlane.renderOrderBase;
  colorRef.current.setHSL(0.6, 0.35, 0.52);

  return (
    <group>
      {bp.planes.map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshRefs.current[i] = el;
          }}
          position={[0, 0, 0]}
          scale={[1, 1, 1]}
          frustumCulled={false}
          renderOrder={backPlaneRo + i}
        >
          <planeGeometry args={[1, 1]} />
          <primitive object={materials[i]!} attach="material" />
        </mesh>
      ))}
    </group>
  );
}
