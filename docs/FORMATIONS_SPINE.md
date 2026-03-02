import React from 'react';
import { useFrame } from '@react-three/fiber';
import \* as THREE from 'three';

interface SpineProps {
spine: {
envelopeNdc: {
width: number;
height: number;
centerY: number;
};
style: {
opacity: number;
zStep: number;
planeGap: number;
driftAmpX: number;
driftAmpY: number;
driftHz: number;
processingOverflowBoost: number;
edgeBandWidth: number;
edgeOpacity: number;
};
transitionMsIn: number;
transitionMsOut: number;
easing: (t: number) => number;
};
halftoneProfile: {
intensity: number;
density: number;
};
planeCount: number;
clock: number;
mode: string;
}

export const Spine: React.FC<SpineProps> = ({ spine, halftoneProfile, planeCount, clock, mode }) => {
const groupRef = React.useRef<THREE.Group>(null);

useFrame(() => {
if (!groupRef.current) return;

    const envelopeWidthWorld = spine.envelopeNdc.width * 2; // Assuming NDC to world scale factor 2
    const envelopeHeightWorld = spine.envelopeNdc.height * 2;

    // Compute group-level drift
    const driftFactor = 1; // could be modulated by mode or time if needed
    const driftRate = spine.style.driftHz;
    const driftX =
      envelopeWidthWorld *
      spine.style.driftAmpX *
      driftFactor *
      Math.sin(clock * driftRate * 2 * Math.PI);
    const driftY =
      envelopeHeightWorld *
      spine.style.driftAmpY *
      driftFactor *
      Math.cos(clock * driftRate * 2 * Math.PI);

    groupRef.current.position.set(driftX, driftY, 0);

    for (let i = 0; i < planeCount; i++) {
      const mesh = groupRef.current.children[i] as THREE.Mesh;
      if (!mesh) continue;

      // Compute local Y for plane positioning
      const planeGapWorld = envelopeHeightWorld * spine.style.planeGap;
      const centerYWorld = spine.envelopeNdc.centerY * 2;
      const localY = centerYWorld + (i - (planeCount - 1) / 2) * planeGapWorld;

      // Per-plane micro drift
      const perPlanePhase = i * 1.15;
      const perPlaneX =
        envelopeWidthWorld *
        spine.style.driftAmpX *
        driftFactor *
        0.6 *
        Math.sin(clock * driftRate * 2 * Math.PI + perPlanePhase);
      const perPlaneY =
        envelopeHeightWorld *
        spine.style.driftAmpY *
        driftFactor *
        0.45 *
        Math.cos(clock * driftRate * 1.7 * 2 * Math.PI + perPlanePhase);

      // Position mesh with both group-level and per-plane drift
      const offsetX = 0; // Assuming offsetX is 0 as original
      mesh.position.set(envelopeWidthWorld * offsetX + perPlaneX, localY + perPlaneY, i * spine.style.zStep);

      // Update opacity with boosted halftone intensity
      const baseOpacity = spine.style.opacity;
      const dynamicOpacityBoost = 1 + halftoneProfile.intensity * 0.7;
      mesh.material.opacity = baseOpacity * dynamicOpacityBoost;
    }

});

// Render planes
const planes = [];
for (let i = 0; i < planeCount; i++) {
planes.push(
<mesh key={i}>
<planeGeometry args={[spine.envelopeNdc.width * 2, spine.envelopeNdc.height * 2]} />
<meshBasicMaterial transparent opacity={spine.style.opacity} color="#fff" />
</mesh>
);
}

return <group ref={groupRef}>{planes}</group>;
};
