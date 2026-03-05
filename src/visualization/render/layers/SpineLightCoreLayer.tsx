/**
 * Opacity plane material for spine and related layers.
 * Controls opacity, edge softness, rim lighting, and glow effects.
 */

import * as THREE from 'three';

export const opacityPlaneMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uColor: { value: new THREE.Color('#8fd6ff') },
    uOpacity: { value: 0 },
    uEdgeSoftness: { value: 0.08 },

    uRimStrength: { value: 0.18 },
    uRimWidth: { value: 0.08 },
    uRimColor: { value: new THREE.Color('#e8f6ff') },

    uEdgeGlowStrength: { value: 0.35 },
    uEdgeGlowWidth: { value: 0.07 },
    uEdgeGlowColor: { value: new THREE.Color('#8fd6ff') },
    uGlowRespondsToCore: { value: 0.85 },
    uCoreInfluenceFalloff: { value: 2.0 },
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
    uniform float uGlowRespondsToCore;
    uniform float uCoreInfluenceFalloff;

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

      // Edge glow: stronger along vertical edges than horizontal, like "lit glass".
      float glowW = max(0.0001, uEdgeGlowWidth);
      float edgeX = 1.0 - smoothstep(0.0, glowW, dx);
      float edgeY = 1.0 - smoothstep(0.0, glowW, dy);
      float edgeMask = max(edgeX * 1.25, edgeY * 0.85);

      // Approximate a "core beam" influence centered on the spine axis (u = 0.5).
      float coreInfluence = 1.0 - clamp(
        pow(abs(vUv.x - 0.5) * 2.0, max(0.1, uCoreInfluenceFalloff)),
        0.0,
        1.0
      );
      float respond = clamp(uGlowRespondsToCore, 0.0, 1.0);
      float glowFactor = edgeMask * mix(1.0, coreInfluence, respond);

      // Slightly bias glow up the center column so overlaps feel more luminous.
      float centerBoost = 0.78 + 0.42 * coreInfluence;

      vec3 glow = uEdgeGlowColor * (uEdgeGlowStrength * glowFactor * centerBoost);

      // Compose: keep alpha from body mask (stable), but push brightness via rim/glow.
      vec3 rgb = uColor + rim + glow;
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
