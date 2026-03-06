/**
 * Back plane layer: rear structural slabs behind the spine.
 * Dumb renderer: reads scene.backPlane and scene.layers.backPlane only.
 * Optional: scene.motion with very low gains for mode coupling.
 */

import { useFrame } from '@react-three/fiber/native';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { VisualizationEngineRef } from '../../engine/types';
import { createBackPlaneMaterial } from '../../materials/backPlane/backPlaneMaterial';

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
}: {
  visualizationRef: React.RefObject<VisualizationEngineRef | null>;
}) {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const tmpCamPos = useRef(new THREE.Vector3());
  const tmpDir = useRef(new THREE.Vector3());
  const colorRef = useRef(new THREE.Color(0.45, 0.48, 0.58));
  const sizeRef = useRef({ width: 1, height: 1 });

  const materials = useMemo(() => {
    return [
      createBackPlaneMaterial(0.12, 0.0),
      createBackPlaneMaterial(0.07, 0.37),
    ];
  }, []);
  useEffect(
    () => () => {
      for (const mat of materials) {
        mat.map?.dispose();
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
    const backPlaneRo = layers?.backPlane?.renderOrderBase ?? 1250;
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
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = plane.opacityBase * (1 + motionGain * 0.25);
      mat.color
        .copy(colorRef.current)
        .multiplyScalar(0.85 + motionGain * 0.35);
      const tex = mat.map;
      if (tex) {
        const phase = Number(mat.userData.layerPhase ?? 0);
        tex.offset.x = (phase * 0.17 + v.clock * 0.004 * driftScale) % 1;
        tex.offset.y = (phase * 0.09 + v.clock * 0.012 * driftScale) % 1;
      }
      const z = plane.z;
      mesh.position
        .copy(tmpCamPos.current)
        .addScaledVector(tmpDir.current, z);
      const view = getViewSizeAtDistance(camera, z, sizeRef.current);
      const sx = (plane.scaleX ?? 1.35) * view.width;
      const sy = (plane.scaleY ?? 1.35) * view.height;
      if (mat.map) {
        // Keep halftone dots circular in world-space: repeatX/repeatY tracks plane aspect.
        const aspectXY = sx / Math.max(0.001, sy);
        const densityY = 88;
        const densityX = densityY * aspectXY;
        mat.map.repeat.set(densityX, densityY);
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
