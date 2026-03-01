/**
 * Visual touch affordances for cluster interactions.
 * Shows lightweight ring zones where users can tap to reveal related UI blocks.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getTwoClusterCenters } from '../helpers/formations';
import type { NodeMapEngineRef } from '../types';

export function ClusterTouchZones({
  nodeMapRef,
  highlighted = false,
}: {
  nodeMapRef: React.RefObject<NodeMapEngineRef | null>;
  highlighted?: boolean;
}) {
  const centers = useMemo(() => getTwoClusterCenters(), []);
  const rulesRingRef = useRef<THREE.Mesh>(null);
  const cardsRingRef = useRef<THREE.Mesh>(null);
  const areaGroupRef = useRef<THREE.Group>(null);
  const rulesAreaRef = useRef<THREE.Mesh>(null);
  const centerAreaRef = useRef<THREE.Mesh>(null);
  const cardsAreaRef = useRef<THREE.Mesh>(null);
  const cameraPosRef = useRef(new THREE.Vector3());
  const cameraDirRef = useRef(new THREE.Vector3());

  useFrame((state) => {
    const v = nodeMapRef.current;
    if (!v) return;
    const show = v.vizIntensity !== 'off';
    const rulesVisible = show && (v.rulesClusterCount ?? 0) > 0;
    const cardsVisible = show && (v.cardsClusterCount ?? 0) > 0;
    const beat = 0.5 + 0.5 * Math.sin(v.clock * 4.2);
    const targetScale = highlighted ? 1.15 + beat * 0.08 : 1;
    const scaleLerp = 0.18;
    if (rulesRingRef.current?.material) {
      rulesRingRef.current.visible = rulesVisible;
      const m = rulesRingRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = highlighted
        ? 0.22 + beat * 0.11 + Math.min(0.15, v.touchInfluence * 0.25)
        : 0.12 + Math.min(0.12, v.touchInfluence * 0.2);
      rulesRingRef.current.rotation.z += highlighted ? 0.008 : 0.004;
      rulesRingRef.current.scale.x +=
        (targetScale - rulesRingRef.current.scale.x) * scaleLerp;
      rulesRingRef.current.scale.y +=
        (targetScale - rulesRingRef.current.scale.y) * scaleLerp;
      rulesRingRef.current.scale.z +=
        (targetScale - rulesRingRef.current.scale.z) * scaleLerp;
    }
    if (cardsRingRef.current?.material) {
      cardsRingRef.current.visible = cardsVisible;
      const m = cardsRingRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = highlighted
        ? 0.22 + beat * 0.11 + Math.min(0.15, v.touchInfluence * 0.25)
        : 0.12 + Math.min(0.12, v.touchInfluence * 0.2);
      cardsRingRef.current.rotation.z -= highlighted ? 0.008 : 0.004;
      cardsRingRef.current.scale.x +=
        (targetScale - cardsRingRef.current.scale.x) * scaleLerp;
      cardsRingRef.current.scale.y +=
        (targetScale - cardsRingRef.current.scale.y) * scaleLerp;
      cardsRingRef.current.scale.z +=
        (targetScale - cardsRingRef.current.scale.z) * scaleLerp;
    }

    if (!areaGroupRef.current) return;
    const w = v.canvasWidth > 0 ? v.canvasWidth : state.size.width;
    const h = v.canvasHeight > 0 ? v.canvasHeight : state.size.height;
    const areaVisible = highlighted && show && w > 0 && h > 0;
    areaGroupRef.current.visible = areaVisible;
    if (!areaVisible) return;

    const bandTopInsetPx = 112;
    const activeHeightRatio = Math.max(
      0,
      Math.min(1, (h - bandTopInsetPx) / h),
    );
    const centerNdcY = -(bandTopInsetPx / h);

    const cam = state.camera as THREE.PerspectiveCamera;
    const fovDeg = typeof cam.fov === 'number' ? cam.fov : 60;
    const overlayDistance = 10;
    const viewHeight =
      2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) * 0.5) * overlayDistance;
    const viewWidth = viewHeight * (w / h);
    const activeHeight = viewHeight * activeHeightRatio;
    const centerY = centerNdcY * (viewHeight * 0.5);

    const leftRatio = 0.44; // NDC split: x < -0.12
    const centerRatio = 0.12; // NDC dead strip: -0.12..0.12
    const rightRatio = 0.44; // NDC split: x > 0.12
    const beatSlow = 0.5 + 0.5 * Math.sin(v.clock * 1.8);
    const areaScaleY = 1 + beatSlow * 0.04;

    cam.getWorldPosition(cameraPosRef.current);
    cam.getWorldDirection(cameraDirRef.current);
    areaGroupRef.current.position
      .copy(cameraPosRef.current)
      .add(cameraDirRef.current.multiplyScalar(overlayDistance));
    areaGroupRef.current.quaternion.copy(cam.quaternion);

    if (rulesAreaRef.current?.material) {
      rulesAreaRef.current.scale.set(viewWidth * leftRatio, activeHeight * areaScaleY, 1);
      rulesAreaRef.current.position.set(
        -viewWidth * (0.5 - leftRatio * 0.5),
        centerY,
        0,
      );
      const m = rulesAreaRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.09 + beatSlow * 0.04;
    }
    if (centerAreaRef.current?.material) {
      centerAreaRef.current.scale.set(viewWidth * centerRatio, activeHeight, 1);
      centerAreaRef.current.position.set(0, centerY, 0);
      const m = centerAreaRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.035;
    }
    if (cardsAreaRef.current?.material) {
      cardsAreaRef.current.scale.set(viewWidth * rightRatio, activeHeight * areaScaleY, 1);
      cardsAreaRef.current.position.set(
        viewWidth * (0.5 - rightRatio * 0.5),
        centerY,
        0,
      );
      const m = cardsAreaRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.09 + beatSlow * 0.04;
    }
  });

  return (
    <>
      <group ref={areaGroupRef} visible={false}>
        <mesh ref={rulesAreaRef}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            color={new THREE.Color(0.35, 0.55, 1.0)}
            transparent
            opacity={0.12}
            side={THREE.DoubleSide}
            depthWrite={false}
            depthTest={false}
          />
        </mesh>
        <mesh ref={centerAreaRef}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            color={new THREE.Color(0.75, 0.78, 0.88)}
            transparent
            opacity={0.035}
            side={THREE.DoubleSide}
            depthWrite={false}
            depthTest={false}
          />
        </mesh>
        <mesh ref={cardsAreaRef}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            color={new THREE.Color(0.95, 0.35, 0.85)}
            transparent
            opacity={0.12}
            side={THREE.DoubleSide}
            depthWrite={false}
            depthTest={false}
          />
        </mesh>
      </group>
      <mesh
        ref={rulesRingRef}
        position={[
          centers.rulesCenter[0],
          centers.rulesCenter[1],
          centers.rulesCenter[2] + 0.02,
        ]}
        visible={false}
      >
        <ringGeometry args={[0.95, 1.15, 48]} />
        <meshBasicMaterial
          color={new THREE.Color(0.35, 0.55, 1.0)}
          transparent
          opacity={0.16}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh
        ref={cardsRingRef}
        position={[
          centers.cardsCenter[0],
          centers.cardsCenter[1],
          centers.cardsCenter[2] + 0.02,
        ]}
        visible={false}
      >
        <ringGeometry args={[0.95, 1.15, 48]} />
        <meshBasicMaterial
          color={new THREE.Color(0.95, 0.35, 0.85)}
          transparent
          opacity={0.16}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}
