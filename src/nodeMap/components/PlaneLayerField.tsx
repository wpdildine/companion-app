/**
 * Background planes (decon-modern field). Layout and style from nodeMapRef.current.scene.backgroundPlanes;
 * only dynamic signals (clock, reduceMotion, panelRects) from ref.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { NodeMapEngineRef } from '../types';

const SEED = 12.9898;

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

  const placePanelPlane = (
    mesh: THREE.Mesh | null,
    rect: { x: number; y: number; w: number; h: number } | undefined,
    canvasWidth: number,
    canvasHeight: number,
    viewportWidth: number,
    viewportHeight: number,
    z: number,
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
    mesh.position.set(
      ndcX * (viewportWidth / 2),
      ndcY * (viewportHeight / 2),
      z,
    );
    mesh.scale.set(
      Math.max(0.001, (rect.w / canvasWidth) * viewportWidth * 1.04),
      Math.max(0.001, (rect.h / canvasHeight) * viewportHeight * 1.06),
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
      if (g1.current?.material) (g1.current.material as THREE.MeshBasicMaterial).opacity = 0;
      if (g2.current?.material) (g2.current.material as THREE.MeshBasicMaterial).opacity = 0;
      return;
    }
    if (!bp) {
      if (g1.current?.material) (g1.current.material as THREE.MeshBasicMaterial).opacity = 0;
      if (g2.current?.material) (g2.current.material as THREE.MeshBasicMaterial).opacity = 0;
      return;
    }
    const hueShift = v.hueShift ?? 0;
    colorRef.current.setHSL((bp.hue + hueShift) % 1, bp.sat, bp.lum);
    const opacity = Math.max(0.25, Math.min(0.65, bp.opacityBase));
    const drift = v.reduceMotion ? 0 : bp.driftPxNorm;
    const n = Math.min(bp.count, 2);
    if (g1.current?.material) {
      (g1.current.material as THREE.MeshBasicMaterial).color.copy(colorRef.current);
      (g1.current.material as THREE.MeshBasicMaterial).opacity = n >= 1 ? opacity : 0;
      g1.current.position.x = Math.sin(v.clock * 0.3) * drift;
      g1.current.position.y = Math.cos(v.clock * 0.27) * drift;
    }
    if (g2.current?.material) {
      (g2.current.material as THREE.MeshBasicMaterial).color.copy(colorRef.current);
      (g2.current.material as THREE.MeshBasicMaterial).opacity = n >= 2 ? opacity * (bp.opacitySecond / bp.opacityBase) : 0;
      g2.current.position.x = Math.sin(v.clock * 0.35 + SEED) * drift;
      g2.current.position.y = Math.cos(v.clock * 0.31 + SEED) * drift;
    }

    const panelOpacity = opacity * 0.48;
    const answerMat = answerPlane.current?.material as THREE.MeshBasicMaterial | undefined;
    const cardsMat = cardsPlane.current?.material as THREE.MeshBasicMaterial | undefined;
    const rulesMat = rulesPlane.current?.material as THREE.MeshBasicMaterial | undefined;
    if (answerMat) {
      answerMat.color.copy(colorRef.current);
      answerMat.opacity = panelOpacity * 0.65;
    }
    if (cardsMat) {
      cardsMat.color.copy(colorRef.current);
      cardsMat.opacity = panelOpacity;
    }
    if (rulesMat) {
      shiftedColorRef.current.copy(colorRef.current).offsetHSL(0.02, 0.02, 0.03);
      rulesMat.color.copy(shiftedColorRef.current);
      rulesMat.opacity = panelOpacity * 0.95;
    }

    const canvasWidth = Math.max(1, v.canvasWidth ?? state.size.width);
    const canvasHeight = Math.max(1, v.canvasHeight ?? state.size.height);
    const viewportWidth = state.viewport.width;
    const viewportHeight = state.viewport.height;
    placePanelPlane(
      answerPlane.current,
      v.panelRects?.answer,
      canvasWidth,
      canvasHeight,
      viewportWidth,
      viewportHeight,
      -1.0,
    );
    placePanelPlane(
      cardsPlane.current,
      v.panelRects?.cards,
      canvasWidth,
      canvasHeight,
      viewportWidth,
      viewportHeight,
      -1.12,
    );
    placePanelPlane(
      rulesPlane.current,
      v.panelRects?.rules,
      canvasWidth,
      canvasHeight,
      viewportWidth,
      viewportHeight,
      -1.2,
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
      <mesh ref={g1} position={[0, 0, -1.2]} scale={[4, 4, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={color} transparent opacity={0.28} depthWrite={false} blending={THREE.NormalBlending} />
      </mesh>
      <mesh ref={g2} position={[0, 0, -1.4]} scale={[4, 4, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} depthWrite={false} blending={THREE.NormalBlending} />
      </mesh>
      <mesh ref={answerPlane} position={[0, 0, -1.0]} scale={[1, 1, 1]} visible={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={color} transparent opacity={0.12} depthWrite={false} blending={THREE.NormalBlending} />
      </mesh>
      <mesh ref={cardsPlane} position={[0, 0, -1.12]} scale={[1, 1, 1]} visible={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={color} transparent opacity={0.14} depthWrite={false} blending={THREE.NormalBlending} />
      </mesh>
      <mesh ref={rulesPlane} position={[0, 0, -1.2]} scale={[1, 1, 1]} visible={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={color} transparent opacity={0.14} depthWrite={false} blending={THREE.NormalBlending} />
      </mesh>
    </>
  );
}
