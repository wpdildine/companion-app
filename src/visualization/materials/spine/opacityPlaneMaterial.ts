import * as THREE from 'three';

/**
 * Soft-opacity plane material for spine support planes.
 * Opacity comes from a UV edge-falloff mask (not a hard rectangle alpha).
 */
export function createOpacityPlaneMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#8aa7d6') },
      uOpacity: { value: 0.25 },
      uEdgeSoftness: { value: 0.028 },
      uRimStrength: { value: 0.1 },
      uRimWidth: { value: 0.08 },
      uRimColor: { value: new THREE.Color('#cfefff') },
      uEdgeGlowStrength: { value: 0.22 },
      uEdgeGlowWidth: { value: 0.07 },
      uEdgeGlowColor: { value: new THREE.Color('#a8ddff') },
      uBeamVis: { value: 1.0 },
      uGlowSide: { value: 0.0 },
      uEdgeYWeight: { value: 0.22 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;
      varying vec2 vUv;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uEdgeSoftness;

      uniform float uRimStrength;
      uniform float uRimWidth;
      uniform vec3 uRimColor;

      uniform float uEdgeGlowStrength;
      uniform float uEdgeGlowWidth;
      uniform vec3 uEdgeGlowColor;
      uniform float uBeamVis;
      uniform float uGlowSide;
      uniform float uEdgeYWeight;

      void main() {
        // Distance to the nearest edge per-axis.
        float dx = min(vUv.x, 1.0 - vUv.x);
        float dy = min(vUv.y, 1.0 - vUv.y);
        float edgeDist = min(dx, dy);

        // Soft body mask (avoid hard-rect alpha).
        float softness = max(0.0001, uEdgeSoftness);
        float bodyMask = smoothstep(0.0, softness, edgeDist);

        float alpha = uOpacity * bodyMask;
        if (alpha < 0.001) discard;

        // Rim highlight: subtly brighter near top/bottom and sides.
        float rimW = max(0.0001, uRimWidth);
        float rimX = 1.0 - smoothstep(0.0, rimW, dx);
        float rimY = 1.0 - smoothstep(0.0, rimW, dy);
        float rimMask = max(rimX, rimY);
        vec3 rim = uRimColor * (uRimStrength * rimMask);

        // Edge glow: primarily vertical edges; optionally choose only one side.
        float glowW = max(0.0001, uEdgeGlowWidth);

        // Vertical edges as separate masks
        float edgeLeft  = 1.0 - smoothstep(0.0, glowW, vUv.x);
        float edgeRight = 1.0 - smoothstep(0.0, glowW, 1.0 - vUv.x);

        // Horizontal edges (top/bottom) are much weaker in the reference.
        float edgeTop    = 1.0 - smoothstep(0.0, glowW, 1.0 - vUv.y);
        float edgeBottom = 1.0 - smoothstep(0.0, glowW, vUv.y);
        float edgeY = max(edgeTop, edgeBottom) * clamp(uEdgeYWeight, 0.0, 1.0);

        // If uGlowSide is ~0, glow both vertical edges.
        // If uGlowSide < 0, glow left edge only. If > 0, glow right edge only.
        float useSingleSide = step(0.05, abs(uGlowSide));
        float pickRight = step(0.0, uGlowSide); // 0 when negative, 1 when positive
        float edgeXBoth = max(edgeLeft, edgeRight);
        float edgeXOne = mix(edgeLeft, edgeRight, pickRight);
        float edgeX = mix(edgeXBoth, edgeXOne, useSingleSide);

        // Final edge mask (mostly vertical edges, tiny top/bottom)
        float edgeMask = max(edgeX, edgeY);

        float beam = clamp(uBeamVis, 0.0, 1.0);
        float glowFactor = edgeMask * beam;
        vec3 glow = uEdgeGlowColor * (uEdgeGlowStrength * glowFactor);

        // Compose: keep alpha from body mask (stable), but push brightness via rim/glow.
        vec3 rgb = uColor + rim * (0.25 + 0.75 * beam) + glow;
        gl_FragColor = vec4(rgb, alpha);
      }
    `,
    transparent: true,
    toneMapped: false,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });
}
