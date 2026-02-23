/**
 * R3F implementation of the node map (Lane A).
 * Loaded only when @react-three/fiber/native + expo-gl are available.
 */

import { StyleSheet, View } from 'react-native';
import { Canvas } from '@react-three/fiber/native';
import { StarfieldPoints } from './StarfieldPoints';
import { NodeCloudPoints } from './NodeCloudPoints';
import { ConnectionLines } from './ConnectionLines';
import { EngineLoop } from './EngineLoop';
import type { VizEngineRef } from './types';

export function NodeMapCanvasR3F({
  vizRef,
}: {
  vizRef: React.RefObject<VizEngineRef | null>;
}) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <Canvas
        style={StyleSheet.absoluteFill}
        camera={{ position: [0, 0, 6], fov: 60 }}
        gl={{ alpha: true, antialias: true }}
      >
        <color attach="background" args={['#0a0612']} />
        <EngineLoop vizRef={vizRef} />
        <StarfieldPoints vizRef={vizRef} />
        <NodeCloudPoints vizRef={vizRef} />
        <ConnectionLines vizRef={vizRef} />
      </Canvas>
    </View>
  );
}
