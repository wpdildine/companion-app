/**
 * Visual touch affordances for cluster interactions.
 * Shows lightweight ring zones where users can tap to reveal related UI blocks.
 */

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getTwoClusterCenters } from '../helpers/formations';
import type { NodeMapEngineRef } from '../types';

// Single source of truth for touch-zone colors. Changing these values updates
// both ring and area materials at runtime.
const RULES_ZONE_COLOR = '#ffffff';
const CARDS_ZONE_COLOR = '#2659d9';
const CENTER_ZONE_COLOR = '#bfc7e0';
const RING_BASE_OPACITY = 0.45;
const RING_HIGHLIGHT_BASE_OPACITY = 0.68;
const AREA_BASE_OPACITY = 0.36;
const CENTER_AREA_OPACITY = 0.2;

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

  useFrame(state => {
    const v = nodeMapRef.current;
    if (!v) return;
    const show = v.vizIntensity !== 'off';
    const rulesVisible = show && (v.rulesClusterCount ?? 0) > 0;
    const cardsVisible = show && (v.cardsClusterCount ?? 0) > 0;
    const targetScale = highlighted ? 1.15 : 1;
    const scaleLerp = 0.18;
    if (rulesRingRef.current?.material) {
      rulesRingRef.current.visible = rulesVisible;
      const m = rulesRingRef.current.material as THREE.MeshBasicMaterial;
      m.color.set(RULES_ZONE_COLOR);
      m.opacity = highlighted
        ? RING_HIGHLIGHT_BASE_OPACITY + Math.min(0.16, v.touchInfluence * 0.25)
        : RING_BASE_OPACITY + Math.min(0.14, v.touchInfluence * 0.2);
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
      m.color.set(CARDS_ZONE_COLOR);
      m.opacity = highlighted
        ? RING_HIGHLIGHT_BASE_OPACITY + Math.min(0.16, v.touchInfluence * 0.25)
        : RING_BASE_OPACITY + Math.min(0.14, v.touchInfluence * 0.2);
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
    const areaScaleY = 1;

    cam.getWorldPosition(cameraPosRef.current);
    cam.getWorldDirection(cameraDirRef.current);
    areaGroupRef.current.position
      .copy(cameraPosRef.current)
      .add(cameraDirRef.current.multiplyScalar(overlayDistance));
    areaGroupRef.current.quaternion.copy(cam.quaternion);

    if (rulesAreaRef.current?.material) {
      rulesAreaRef.current.scale.set(
        viewWidth * leftRatio,
        activeHeight * areaScaleY,
        1,
      );
      rulesAreaRef.current.position.set(
        -viewWidth * (0.5 - leftRatio * 0.5),
        centerY,
        0,
      );
      const m = rulesAreaRef.current.material as THREE.MeshBasicMaterial;
      m.color.set(RULES_ZONE_COLOR);
      m.opacity = AREA_BASE_OPACITY;
    }
    if (centerAreaRef.current?.material) {
      centerAreaRef.current.scale.set(viewWidth * centerRatio, activeHeight, 1);
      centerAreaRef.current.position.set(0, centerY, 0);
      const m = centerAreaRef.current.material as THREE.MeshBasicMaterial;
      m.color.set(CENTER_ZONE_COLOR);
      m.opacity = CENTER_AREA_OPACITY;
    }
    if (cardsAreaRef.current?.material) {
      cardsAreaRef.current.scale.set(
        viewWidth * rightRatio,
        activeHeight * areaScaleY,
        1,
      );
      cardsAreaRef.current.position.set(
        viewWidth * (0.5 - rightRatio * 0.5),
        centerY,
        0,
      );
      const m = cardsAreaRef.current.material as THREE.MeshBasicMaterial;
      m.color.set(CARDS_ZONE_COLOR);
      m.opacity = AREA_BASE_OPACITY;
    }
  });

  return (
    <>
      <group ref={areaGroupRef} visible={false} renderOrder={980}>
        <mesh ref={rulesAreaRef} renderOrder={981}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            color={RULES_ZONE_COLOR}
            transparent
            opacity={0.12}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
            depthTest={false}
          />
        </mesh>
        <mesh ref={centerAreaRef} renderOrder={982}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            color={CENTER_ZONE_COLOR}
            transparent
            opacity={0.035}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
            depthTest={false}
          />
        </mesh>
        <mesh ref={cardsAreaRef} renderOrder={983}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            color={CARDS_ZONE_COLOR}
            transparent
            opacity={0.12}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
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
        renderOrder={984}
      >
        <ringGeometry args={[0.95, 1.15, 48]} />
        <meshBasicMaterial
          color={RULES_ZONE_COLOR}
          transparent
          opacity={0.16}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
          depthTest={false}
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
        renderOrder={985}
      >
        <ringGeometry args={[0.95, 1.15, 48]} />
        <meshBasicMaterial
          color={CARDS_ZONE_COLOR}
          transparent
          opacity={0.16}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
    </>
  );
}
