/**
 * Touch zone affordances. Dumb renderer: viewport math and camera-facing placement
 * only; all layout/style from visualizationRef.current.scene.
 */

import { useFrame } from '@react-three/fiber/native';
import { useRef } from 'react';
import * as THREE from 'three';
import { getActiveBandVerticalEnvelope } from '../../interaction/activeBandEnvelope';
import type { VisualizationEngineRef } from '../../runtime/runtimeTypes';
import type { LayerDescriptor } from '../../scene/layerDescriptor';
import { getDescriptorRenderOrderBase } from './descriptorRenderOrder';

const planeEdgesGeometry = new THREE.EdgesGeometry(
  new THREE.PlaneGeometry(1, 1),
);

/** Rules / center / cards overlay slots from scene.zones.layout. */
const MAX_ZONE_COUNT = 3;

type OverlaySegment = {
  widthRatio: number;
  heightRatio: number;
  centerNdcX: number;
  centerNdcY: number;
  color: string;
  opacity: number;
  buttonInsetRatio: number;
  edgeOpacity: number;
};

export function TouchZones({
  visualizationRef,
  descriptor,
}: {
  visualizationRef: React.RefObject<VisualizationEngineRef | null>;
  descriptor?: LayerDescriptor;
}) {
  const areaGroupRef = useRef<THREE.Group>(null);
  const zoneAreaRefs = useRef<Array<THREE.Mesh | null>>([]);
  const zoneButtonRefs = useRef<Array<THREE.Mesh | null>>([]);
  const zoneEdgeRefs = useRef<Array<THREE.LineSegments | null>>([]);
  const cameraPosRef = useRef(new THREE.Vector3());
  const cameraDirRef = useRef(new THREE.Vector3());

  useFrame(state => {
    const v = visualizationRef.current;
    if (!v) return;
    const scene = v.scene;
    if (!scene) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error(
          '[TouchZones] visualizationRef.current.scene is missing. Set visualizationRef.current.scene = getSceneDescription() in the screen that mounts the viz (e.g. AgentSurface ref initializer).',
        );
      }
      return;
    }

    const { layout, style } = scene.zones;
    const show = v.vizIntensity !== 'off';
    const showZones = v.showTouchZones ?? false;

    if (!areaGroupRef.current) return;
    const w = v.canvasWidth > 0 ? v.canvasWidth : state.size.width;
    const h = v.canvasHeight > 0 ? v.canvasHeight : state.size.height;
    const areaVisible = showZones && show && w > 0 && h > 0;
    areaGroupRef.current.visible = areaVisible;
    if (!areaVisible) return;

    const envelope = getActiveBandVerticalEnvelope(layout.bandTopInsetPx, h);
    const { activeHeightRatio, centerNdcY } = envelope;

    const cam = state.camera as THREE.PerspectiveCamera;
    const fovDeg = typeof cam.fov === 'number' ? cam.fov : 60;
    const viewHeight =
      2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) * 0.5) * 10;
    const viewWidth = viewHeight * (w / h);
    const activeHeight = viewHeight * activeHeightRatio;
    const centerY = centerNdcY * (viewHeight * 0.5);

    const defaultSegments: OverlaySegment[] = [
      {
        widthRatio: layout.leftRatio,
        heightRatio: 1,
        centerNdcX: -1 + layout.leftRatio,
        centerNdcY: 0,
        color: style.rulesColor,
        opacity: style.areaPlaneOpacityRules,
        buttonInsetRatio: 0.9,
        edgeOpacity: 1,
      },
      {
        widthRatio: layout.centerRatio,
        heightRatio: 1,
        centerNdcX: 0,
        centerNdcY: 0,
        color: style.centerColor,
        opacity: style.areaPlaneOpacityCenter,
        buttonInsetRatio: 0.9,
        edgeOpacity: 1,
      },
      {
        widthRatio: layout.rightRatio,
        heightRatio: 1,
        centerNdcX: 1 - layout.rightRatio,
        centerNdcY: 0,
        color: style.cardsColor,
        opacity: style.areaPlaneOpacityCards,
        buttonInsetRatio: 0.9,
        edgeOpacity: 1,
      },
    ];
    const segments = defaultSegments;

    cam.getWorldPosition(cameraPosRef.current);
    cam.getWorldDirection(cameraDirRef.current);
    areaGroupRef.current.position
      .copy(cameraPosRef.current)
      .add(cameraDirRef.current.multiplyScalar(10));
    areaGroupRef.current.quaternion.copy(cam.quaternion);

    for (let index = 0; index < MAX_ZONE_COUNT; index += 1) {
      const areaRef = zoneAreaRefs.current[index];
      const edgeRef = zoneEdgeRefs.current[index];
      const segment = segments[index];
      const visible = segment != null;

      if (areaRef) areaRef.visible = visible;
      const buttonRef = zoneButtonRefs.current[index];
      if (buttonRef) buttonRef.visible = visible;
      if (edgeRef) edgeRef.visible = visible;
      if (!visible || !areaRef?.material) continue;

      const width = viewWidth * segment.widthRatio;
      const height = activeHeight * segment.heightRatio;
      const centerX = segment.centerNdcX * (viewWidth * 0.5);
      const segmentCenterY = centerY + segment.centerNdcY * (activeHeight * 0.5);
      areaRef.scale.set(width, height, 1);
      areaRef.position.set(centerX, segmentCenterY, 0);

      const areaMaterial = areaRef.material as THREE.MeshBasicMaterial;
      areaMaterial.color.set(segment.color);
      areaMaterial.opacity = segment.opacity;

      if (buttonRef?.material) {
        buttonRef.scale.set(
          width * segment.buttonInsetRatio,
          height * Math.min(segment.buttonInsetRatio, 0.88),
          1,
        );
        buttonRef.position.set(centerX, segmentCenterY, 0.001);
        const buttonMaterial = buttonRef.material as THREE.MeshBasicMaterial;
        buttonMaterial.color
          .set(segment.color)
          .offsetHSL(0, -0.08, segment.opacity > 0.3 ? 0.08 : -0.02);
        buttonMaterial.opacity = Math.min(segment.opacity + 0.14, 0.48);
      }

      if (edgeRef) {
        edgeRef.position.copy(areaRef.position);
        edgeRef.scale.copy(areaRef.scale);
        const edgeMaterial = edgeRef.material as THREE.LineBasicMaterial;
        edgeMaterial.opacity = segment.edgeOpacity;
        edgeMaterial.transparent = segment.edgeOpacity < 1;
      }
    }
  });

  const scene = visualizationRef.current?.scene;
  if (!scene) return null;

  const { style } = scene.zones;
  const debugOverlayBase = getDescriptorRenderOrderBase(
    scene,
    descriptor,
    'debugOverlay',
    4000,
  );

  return (
    <group ref={areaGroupRef} visible={false} renderOrder={debugOverlayBase}>
      {Array.from({ length: MAX_ZONE_COUNT }, (_, index) => (
        <group key={index}>
          <mesh
            ref={node => {
              zoneAreaRefs.current[index] = node;
            }}
            renderOrder={debugOverlayBase + index}
          >
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
          <mesh
            ref={node => {
              zoneButtonRefs.current[index] = node;
            }}
            renderOrder={debugOverlayBase + index}
          >
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
            ref={node => {
              zoneEdgeRefs.current[index] = node;
            }}
            geometry={planeEdgesGeometry}
            renderOrder={debugOverlayBase + index}
          >
            <lineBasicMaterial
              color={style.edgeColor}
              transparent
              opacity={1}
              depthTest={false}
            />
          </lineSegments>
        </group>
      ))}
    </group>
  );
}
