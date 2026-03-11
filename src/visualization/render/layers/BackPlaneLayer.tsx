/**
 * Back plane layer: rear structural slabs behind the spine.
 * Dumb renderer: reads scene.backPlane and scene.layers.backPlane only.
 * Optional: scene.motion with very low gains for mode coupling.
 */

import { useFrame } from '@react-three/fiber/native';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { VisualizationEngineRef } from '../../engine/types';
import type { LayerDescriptor } from '../../scene/layerDescriptor';
import { createBackPlaneMaterial } from '../../materials/backPlane/backPlaneMaterial';
import { createBackPlaneGlitchMaterial } from '../../materials/backPlane/backPlaneGlitchMaterial';
import { getDescriptorRenderOrderBase } from './descriptorRenderOrder';

function getViewSizeAtDistance(
  camera: THREE.Camera,
  distance: number,
  fallback: { width: number; height: number },
): { width: number; height: number } {
  const d = Math.max(0.01, distance);
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
  descriptor,
}: {
  visualizationRef: React.RefObject<VisualizationEngineRef | null>;
  descriptor?: LayerDescriptor;
}) {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const tmpCamPos = useRef(new THREE.Vector3());
  const tmpDir = useRef(new THREE.Vector3());
  const colorRef = useRef(new THREE.Color(0.45, 0.48, 0.58));
  const sizeRef = useRef({ width: 1, height: 1 });

  const materials = useMemo(() => {
    return [
      createBackPlaneMaterial(0.12, 0.0),
      createBackPlaneGlitchMaterial(0.07, 0.37),
    ];
  }, []);
  useEffect(
    () => () => {
      for (const mat of materials) {
        if ((mat as THREE.MeshBasicMaterial).map) {
          (mat as THREE.MeshBasicMaterial).map?.dispose();
          (mat as THREE.MeshBasicMaterial).alphaMap?.dispose();
        }
        if ((mat as THREE.ShaderMaterial).isShaderMaterial) {
          const u = (mat as THREE.ShaderMaterial).uniforms;
          if (u?.uBaseTex?.value) {
            (u.uBaseTex.value as THREE.Texture).dispose();
          }
        }
        mat.dispose();
      }
    },
    [materials],
  );

  useFrame((state) => {
    const v = visualizationRef.current;
    if (!v?.scene?.backPlane?.planes.length) return;
    const bp = v.scene.backPlane;
    const layers = v.scene.layers;
    const backPlaneRo = getDescriptorRenderOrderBase(
      v.scene,
      descriptor,
      'backPlane',
      1250,
    );
    const camera = state.camera;
    sizeRef.current.width = state.viewport.width;
    sizeRef.current.height = state.viewport.height;
    camera.getWorldPosition(tmpCamPos.current);
    camera.getWorldDirection(tmpDir.current);
    const motion = v.scene?.motion;
    const motionGain = motion ? motion.energy * 0.12 : 0;

    for (let i = 0; i < bp.planes.length; i++) {
      const plane = bp.planes[i]!;
      const mesh = meshRefs.current[i];
      if (!mesh) continue;
      const driftScale = plane.driftScale ?? 0.4;
      const z = plane.z;
      const view = getViewSizeAtDistance(camera, z, sizeRef.current);
      const sx = (plane.scaleX ?? 1.35) * view.width;
      const sy = (plane.scaleY ?? 1.35) * view.height;
      const mat = mesh.material;
      if ((mat as THREE.ShaderMaterial).isShaderMaterial) {
        const shaderMat = mat as THREE.ShaderMaterial;
        const boostedOpacity = plane.opacityBase * (2.6 + motionGain * 0.45);
        shaderMat.uniforms.uOpacity.value = Math.min(0.26, boostedOpacity);
        shaderMat.uniforms.uTime.value = v.clock * (0.7 + driftScale * 0.35);
        shaderMat.uniforms.uResolution.value.set(
          Math.max(1, state.size.width),
          Math.max(1, state.size.height),
        );
        shaderMat.uniforms.uIntensity.value = 1.35 + motionGain * 0.9;
        shaderMat.uniforms.uColor.value.set(
          Math.min(1, colorRef.current.r * 1.25),
          Math.min(1, colorRef.current.g * 1.35),
          Math.min(1, colorRef.current.b * 1.55),
        );
        const aspectXY = sx / Math.max(0.001, sy);
        const densityY = 88;
        const densityX = densityY * aspectXY;
        shaderMat.uniforms.uTileRepeat.value.set(densityX, densityY);
      } else {
        const basicMat = mat as THREE.MeshBasicMaterial;
        basicMat.opacity = plane.opacityBase * (1 + motionGain * 0.25);
        basicMat.color
          .copy(colorRef.current)
          .multiplyScalar(0.85 + motionGain * 0.35);
        const tex = basicMat.map;
        if (tex) {
          const phase = Number(basicMat.userData.layerPhase ?? 0);
          tex.offset.x = phase * 0.17;
          tex.offset.y = phase * 0.09;
        }
      }
      mesh.position
        .copy(tmpCamPos.current)
        .addScaledVector(tmpDir.current, z);
      if ((mat as THREE.MeshBasicMaterial).map) {
        const basicMat = mat as THREE.MeshBasicMaterial;
        // Keep halftone dots circular in world-space: repeatX/repeatY tracks plane aspect.
        const aspectXY = sx / Math.max(0.001, sy);
        // Keep dot pixel density stable even if plane scale changes.
        // 142 * 0.62 ~= 88 (previous tuning baseline).
        const scaleY = sy / Math.max(0.001, view.height);
        const densityY = 142 * scaleY;
        const densityX = densityY * aspectXY;
        basicMat.map?.repeat.set(densityX, densityY);
      }
      mesh.scale.set(sx, sy, 1);
      mesh.quaternion.copy(camera.quaternion);
      mesh.renderOrder = backPlaneRo + i;
    }
  });

  const scene = visualizationRef.current?.scene;
  const bp = scene?.backPlane;
  const layers = scene?.layers;
  if (!bp || bp.count === 0 || !layers?.backPlane) return null;

  const backPlaneRo = getDescriptorRenderOrderBase(
    visualizationRef.current?.scene,
    descriptor,
    'backPlane',
    layers.backPlane.renderOrderBase,
  );
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
