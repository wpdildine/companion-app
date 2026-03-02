/**
 * Background planes (decon-modern field). Layout and style from nodeMapRef.current.scene.backgroundPlanes;
 * only dynamic signals (clock, reduceMotion, panelRects) from ref.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { NodeMapEngineRef } from '../types';

const SEED = 12.9898;

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
  // Temp vectors for camera-space placement (avoid allocations)
  const tmpCamPos = useRef(new THREE.Vector3());
  const tmpDir = useRef(new THREE.Vector3());
  const tmpRight = useRef(new THREE.Vector3());
  const tmpUp = useRef(new THREE.Vector3());
  const tmpPos = useRef(new THREE.Vector3());

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
    const view = getViewSizeAtPos(camera, tmpCamPos.current.clone().addScaledVector(tmpDir.current, d), {
      width: fallbackViewportWidth,
      height: fallbackViewportHeight,
    });

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

  useFrame(state => {
    const v = nodeMapRef.current;
    if (!v) return;
    const bp = v.scene?.backgroundPlanes;
    const show = v.vizIntensity !== 'off';
    if (!show) {
      if (g1.current?.material)
        (g1.current.material as THREE.MeshBasicMaterial).opacity = 0;
      if (g2.current?.material)
        (g2.current.material as THREE.MeshBasicMaterial).opacity = 0;
      return;
    }
    if (!bp) {
      if (g1.current?.material)
        (g1.current.material as THREE.MeshBasicMaterial).opacity = 0;
      if (g2.current?.material)
        (g2.current.material as THREE.MeshBasicMaterial).opacity = 0;
      return;
    }
    const hueShift = v.hueShift ?? 0;
    colorRef.current.setHSL((bp.hue + hueShift) % 1, bp.sat, bp.lum);
    const opacity = Math.max(0.25, Math.min(0.65, bp.opacityBase));
    const viewportWidth = state.viewport.width;
    const viewportHeight = state.viewport.height;
    const camera = state.camera;
    // Camera basis for background planes
    camera.getWorldPosition(tmpCamPos.current);
    camera.getWorldDirection(tmpDir.current);
    tmpRight.current.crossVectors(tmpDir.current, camera.up).normalize();
    tmpUp.current.crossVectors(tmpRight.current, tmpDir.current).normalize();
    const viewportMin = Math.min(viewportWidth, viewportHeight);
    const driftWorld = v.reduceMotion ? 0 : bp.driftPxNorm * viewportMin;
    const n = Math.min(bp.count, 2);
    if (g1.current?.material) {
      (g1.current.material as THREE.MeshBasicMaterial).color.copy(
        colorRef.current,
      );
      (g1.current.material as THREE.MeshBasicMaterial).opacity =
        n >= 1 ? opacity : 0;
      const d1 = 6.5;
      const dx1 = Math.sin(v.clock * 0.3) * driftWorld;
      const dy1 = Math.cos(v.clock * 0.27) * driftWorld;
      g1.current.position
        .copy(tmpCamPos.current)
        .addScaledVector(tmpDir.current, d1)
        .addScaledVector(tmpRight.current, dx1)
        .addScaledVector(tmpUp.current, dy1);

      const view1 = getViewSizeAtPos(camera, g1.current.position, {
        width: viewportWidth,
        height: viewportHeight,
      });
      g1.current.scale.set(view1.width * 1.02, view1.height * 1.02, 1);
      g1.current.quaternion.copy(camera.quaternion);
    }
    if (g2.current?.material) {
      (g2.current.material as THREE.MeshBasicMaterial).color.copy(
        colorRef.current,
      );
      (g2.current.material as THREE.MeshBasicMaterial).opacity =
        n >= 2 ? opacity * (bp.opacitySecond / bp.opacityBase) : 0;
      const d2 = 6.7;
      const dx2 = Math.sin(v.clock * 0.35 + SEED) * driftWorld;
      const dy2 = Math.cos(v.clock * 0.31 + SEED) * driftWorld;
      g2.current.position
        .copy(tmpCamPos.current)
        .addScaledVector(tmpDir.current, d2)
        .addScaledVector(tmpRight.current, dx2)
        .addScaledVector(tmpUp.current, dy2);

      const view2 = getViewSizeAtPos(camera, g2.current.position, {
        width: viewportWidth,
        height: viewportHeight,
      });
      g2.current.scale.set(view2.width * 1.05, view2.height * 1.05, 1);
      g2.current.quaternion.copy(camera.quaternion);
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
  });

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
      <mesh ref={g1} position={[0, 0, 0]} scale={[1, 1, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.28}
          depthWrite={false}
          blending={THREE.NormalBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={g2} position={[0, 0, 0]} scale={[1, 1, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.2}
          depthWrite={false}
          blending={THREE.NormalBlending}
          side={THREE.DoubleSide}
        />
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
          blending={THREE.NormalBlending}
        />
      </mesh>
    </>
  );
}
