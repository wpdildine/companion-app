/**
 * Spine rot layer: rotated planes in overlay space.
 * Rendered under Spine group (no camera-facing transform here).
 * Dumb renderer: reads scene.spineRot + scene.layers only.
 */

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';
import type { VisualizationEngineRef } from '../../engine/types';
import type { LayerDescriptor } from '../../scene/layerDescriptor';
import { createBasicPlaneMaterial } from '../../materials/basicPlaneMaterial';
import { createHalftoneMaterial } from '../../materials/halftone/halftonePlaneMaterial';
import type { CanonicalSceneMode } from '../../scene/canonicalMode';
import { getDescriptorRenderOrderBase } from './descriptorRenderOrder';

function toCanonicalMode(mode: string): CanonicalSceneMode {
  switch (mode) {
    case 'idle':
    case 'listening':
    case 'processing':
    case 'speaking':
      return mode;
    case 'touched':
      return 'listening';
    case 'released':
      return 'speaking';
    default:
      return 'idle';
  }
}

export function SpineRotLayer({
  visualizationRef,
  descriptor,
}: {
  visualizationRef: React.RefObject<VisualizationEngineRef | null>;
  descriptor?: LayerDescriptor;
}) {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const ghostMatsRef = useRef<THREE.MeshBasicMaterial[]>([]);
  const halftoneMatRef = useRef<THREE.ShaderMaterial | null>(null);
  if (!halftoneMatRef.current) halftoneMatRef.current = createHalftoneMaterial();
  const halftoneMat = halftoneMatRef.current;

  const scene = visualizationRef.current?.scene;
  const planes = scene?.spineRot?.planes ?? [];

  while (ghostMatsRef.current.length < planes.length) {
    ghostMatsRef.current.push(createBasicPlaneMaterial('#6ea8ff'));
  }

  useFrame(state => {
    const v = visualizationRef.current;
    const sceneNow = v?.scene;
    const spineRotNow = sceneNow?.spineRot;
    const layersNow = sceneNow?.layers;
    const spineNow = sceneNow?.spine;
    if (!spineRotNow || !layersNow || !spineNow) return;

    const modeNow = toCanonicalMode(v?.currentMode ?? 'idle');
    const visibleCount = spineRotNow.planeCountByMode[modeNow] ?? 0;
    const spineRotRo = getDescriptorRenderOrderBase(
      sceneNow,
      descriptor,
      'spineRot',
      layersNow.spineRot.renderOrderBase,
    );
    const opacityBase = spineRotNow.opacityBase;
    const halftoneProfile = spineNow.halftoneProfiles[modeNow];
    const resX = Math.max(1, state.size.width * (state.gl.getPixelRatio?.() ?? 1));
    const resY = Math.max(1, state.size.height * (state.gl.getPixelRatio?.() ?? 1));

    for (let i = 0; i < planes.length; i++) {
      const mesh = meshRefs.current[i];
      const plane = spineRotNow.planes[i];
      if (!mesh || !plane) continue;
      mesh.visible = i < visibleCount;
      if (!mesh.visible) continue;

      mesh.position.set(0, 0, plane.z);
      mesh.rotation.set(0, 0, plane.rotationZ);
      mesh.scale.set(plane.scaleX, plane.scaleY, 1);
      mesh.renderOrder = spineRotRo + i;

      if (plane.useHalftone && halftoneMat) {
        halftoneMat.uniforms.uColor.value.set(plane.color);
        halftoneMat.uniforms.uOpacity.value = plane.opacityScale * opacityBase;
        halftoneMat.uniforms.uIntensity.value = halftoneProfile.intensity;
        halftoneMat.uniforms.uDensity.value = halftoneProfile.density;
        halftoneMat.uniforms.uTime.value = v?.clock ?? 0;
        halftoneMat.uniforms.uResolution.value.set(resX, resY);
        halftoneMat.uniforms.uPlanePhase.value = i * 1.1;
        halftoneMat.uniforms.uPlaneSize.value.set(plane.scaleX, plane.scaleY);
        halftoneMat.uniforms.uDebugFlat.value = spineNow.style.halftoneDebugFlat ? 1 : 0;
      } else {
        const mat = ghostMatsRef.current[i];
        if (!mat) continue;
        mat.color.set(plane.color);
        mat.opacity = plane.opacityScale * opacityBase;
      }
    }
  });

  const spineRot = scene?.spineRot;
  const layers = scene?.layers;
  if (!spineRot || !layers) return null;
  const canonical = toCanonicalMode(visualizationRef.current?.currentMode ?? 'idle');
  const countForMode = spineRot.planeCountByMode[canonical] ?? 0;
  if (planes.length === 0 || countForMode === 0) return null;

  const spineRotRo = getDescriptorRenderOrderBase(
    scene,
    descriptor,
    'spineRot',
    layers.spineRot.renderOrderBase,
  );
  const ghostMats = ghostMatsRef.current;

  return (
    <>
      {planes.map((plane, i) => {
        const mat = plane.useHalftone ? halftoneMat : ghostMats[i];
        if (!mat) return null;
        return (
          <mesh
            key={`rot-${i}`}
            ref={el => {
              meshRefs.current[i] = el;
            }}
            renderOrder={spineRotRo + i}
            visible={i < countForMode}
          >
            <planeGeometry args={[1, 1]} />
            <primitive object={mat} attach="material" />
          </mesh>
        );
      })}
    </>
  );
}
