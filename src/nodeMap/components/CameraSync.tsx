/**
 * Syncs orthographic camera bounds to canvas dimensions so world coords map 1:1 to the view.
 * Visible area: x in [-aspect, aspect], y in [-1, 1] with aspect = width/height.
 */

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { NodeMapEngineRef } from '../types';

const ZOOM = 1;

function syncCamera(
  camera: THREE.Camera,
  width: number,
  height: number,
  nodeMapRef: React.RefObject<NodeMapEngineRef | null>,
) {
  if (!(camera instanceof THREE.OrthographicCamera) || width <= 0 || height <= 0) return;
  const aspect = width / height;
  camera.left = -aspect * ZOOM;
  camera.right = aspect * ZOOM;
  camera.top = ZOOM;
  camera.bottom = -ZOOM;
  camera.near = 0.1;
  camera.far = 100;
  camera.updateProjectionMatrix();
  if (nodeMapRef?.current) {
    nodeMapRef.current.canvasWidth = width;
    nodeMapRef.current.canvasHeight = height;
  }
}

export function CameraSync({ nodeMapRef }: { nodeMapRef: React.RefObject<NodeMapEngineRef | null> }) {
  const { camera, size } = useThree();
  const prevSize = useRef({ width: 0, height: 0 });

  useEffect(() => {
    syncCamera(camera, size.width, size.height, nodeMapRef);
  }, [camera, size.width, size.height, nodeMapRef]);

  useFrame(() => {
    if (size.width === prevSize.current.width && size.height === prevSize.current.height) return;
    prevSize.current = { width: size.width, height: size.height };
    syncCamera(camera, size.width, size.height, nodeMapRef);
  });

  return null;
}
