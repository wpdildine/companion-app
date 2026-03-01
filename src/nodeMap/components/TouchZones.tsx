/**
 * Touch zone affordances (rules / center / cards). Dumb renderer: viewport math and
 * camera-facing placement only; all layout and style from nodeMapRef.current.scene.
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import type { NodeMapEngineRef } from '../types';

const planeEdgesGeometry = new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1));
const OVERLAY_DISTANCE = 10;

export function TouchZones({
  nodeMapRef,
  highlighted = false,
}: {
  nodeMapRef: React.RefObject<NodeMapEngineRef | null>;
  highlighted?: boolean;
}) {
  const areaGroupRef = useRef<THREE.Group>(null);
  const rulesAreaRef = useRef<THREE.Mesh>(null);
  const centerAreaRef = useRef<THREE.Mesh>(null);
  const cardsAreaRef = useRef<THREE.Mesh>(null);
  const rulesAreaEdgesRef = useRef<THREE.LineSegments>(null);
  const centerAreaEdgesRef = useRef<THREE.LineSegments>(null);
  const cardsAreaEdgesRef = useRef<THREE.LineSegments>(null);
  const cameraPosRef = useRef(new THREE.Vector3());
  const cameraDirRef = useRef(new THREE.Vector3());

  useFrame(state => {
    const v = nodeMapRef.current;
    if (!v) return;
    const scene = v.scene;
    if (!scene) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error(
          '[TouchZones] nodeMapRef.current.scene is missing. Set nodeMapRef.current.scene = getSceneDescription() in the screen that mounts the viz (e.g. VoiceScreen ref initializer).',
        );
      }
      return;
    }

    const { layout, style } = scene.zones;
    const show = v.vizIntensity !== 'off';

    if (!areaGroupRef.current) return;
    const w = v.canvasWidth > 0 ? v.canvasWidth : state.size.width;
    const h = v.canvasHeight > 0 ? v.canvasHeight : state.size.height;
    const areaVisible = highlighted && show && w > 0 && h > 0;
    areaGroupRef.current.visible = areaVisible;
    if (!areaVisible) return;

    const bandTopInsetPx = layout.bandTopInsetPx;
    const activeHeightRatio = Math.max(
      0,
      Math.min(1, (h - bandTopInsetPx) / h),
    );
    const centerNdcY = -(bandTopInsetPx / h);

    const cam = state.camera as THREE.PerspectiveCamera;
    const fovDeg = typeof cam.fov === 'number' ? cam.fov : 60;
    const viewHeight =
      2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) * 0.5) * OVERLAY_DISTANCE;
    const viewWidth = viewHeight * (w / h);
    const activeHeight = viewHeight * activeHeightRatio;
    const centerY = centerNdcY * (viewHeight * 0.5);

    const leftRatio = layout.leftRatio;
    const centerRatio = layout.centerRatio;
    const rightRatio = layout.rightRatio;

    cam.getWorldPosition(cameraPosRef.current);
    cam.getWorldDirection(cameraDirRef.current);
    areaGroupRef.current.position
      .copy(cameraPosRef.current)
      .add(cameraDirRef.current.multiplyScalar(OVERLAY_DISTANCE));
    areaGroupRef.current.quaternion.copy(cam.quaternion);

    if (rulesAreaRef.current?.material) {
      rulesAreaRef.current.scale.set(
        viewWidth * leftRatio,
        activeHeight,
        1,
      );
      rulesAreaRef.current.position.set(
        -viewWidth * (0.5 - leftRatio * 0.5),
        centerY,
        0,
      );
      const m = rulesAreaRef.current.material as THREE.MeshBasicMaterial;
      m.color.set(style.rulesColor);
      m.opacity = style.areaBaseOpacity;
      if (rulesAreaEdgesRef.current) {
        rulesAreaEdgesRef.current.position.copy(rulesAreaRef.current.position);
        rulesAreaEdgesRef.current.scale.copy(rulesAreaRef.current.scale);
      }
    }
    if (centerAreaRef.current?.material) {
      centerAreaRef.current.scale.set(
        viewWidth * centerRatio,
        activeHeight,
        1,
      );
      centerAreaRef.current.position.set(0, centerY, 0);
      const m = centerAreaRef.current.material as THREE.MeshBasicMaterial;
      m.color.set(style.centerColor);
      m.opacity = style.centerAreaOpacity;
      if (centerAreaEdgesRef.current) {
        centerAreaEdgesRef.current.position.copy(centerAreaRef.current.position);
        centerAreaEdgesRef.current.scale.copy(centerAreaRef.current.scale);
      }
    }
    if (cardsAreaRef.current?.material) {
      cardsAreaRef.current.scale.set(
        viewWidth * rightRatio,
        activeHeight,
        1,
      );
      cardsAreaRef.current.position.set(
        viewWidth * (0.5 - rightRatio * 0.5),
        centerY,
        0,
      );
      const m = cardsAreaRef.current.material as THREE.MeshBasicMaterial;
      m.color.set(style.cardsColor);
      m.opacity = style.areaBaseOpacity;
      if (cardsAreaEdgesRef.current) {
        cardsAreaEdgesRef.current.position.copy(cardsAreaRef.current.position);
        cardsAreaEdgesRef.current.scale.copy(cardsAreaRef.current.scale);
      }
    }
  });

  const scene = nodeMapRef.current?.scene;
  if (!scene) return null;

  const { style } = scene.zones;

  return (
    <group ref={areaGroupRef} visible={false} renderOrder={980}>
      <mesh ref={rulesAreaRef} renderOrder={981}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color={style.rulesColor}
          transparent
          opacity={style.areaPlaneOpacityRules}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
      <lineSegments
        ref={rulesAreaEdgesRef}
        geometry={planeEdgesGeometry}
        renderOrder={986}
      >
        <lineBasicMaterial color={style.edgeColor} depthTest={false} />
      </lineSegments>
      <mesh ref={centerAreaRef} renderOrder={982}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color={style.centerColor}
          transparent
          opacity={style.areaPlaneOpacityCenter}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
      <lineSegments
        ref={centerAreaEdgesRef}
        geometry={planeEdgesGeometry}
        renderOrder={986}
      >
        <lineBasicMaterial color={style.edgeColor} depthTest={false} />
      </lineSegments>
      <mesh ref={cardsAreaRef} renderOrder={983}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color={style.cardsColor}
          transparent
          opacity={style.areaPlaneOpacityCards}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
      <lineSegments
        ref={cardsAreaEdgesRef}
        geometry={planeEdgesGeometry}
        renderOrder={986}
      >
        <lineBasicMaterial color={style.edgeColor} depthTest={false} />
      </lineSegments>
    </group>
  );
}
