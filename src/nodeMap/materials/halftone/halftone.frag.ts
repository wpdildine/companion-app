/**
 * Halftone fragment: dot pattern with uPlanePhase for per-mesh variation.
 * Fade: coverage factor from uFadeMode (0=none, 1=radial, 2=linear). No uTime in logic; no UV animation.
 * Guardrail: coverage never below 0.15 inside inner region.
 */
export const HALFTONE_FRAGMENT = `
precision mediump float;
varying vec2 vUv;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uIntensity;
uniform float uDensity;
uniform float uTime;
uniform vec2 uResolution;
uniform float uPlanePhase;
uniform vec2 uPlaneSize;
uniform float uDebugFlat;
uniform float uFadeMode;
uniform float uFadeInner;
uniform float uFadeOuter;
uniform float uFadePower;

void main() {
  if (uDebugFlat > 0.5) {
    gl_FragColor = vec4(uColor.rgb, clamp(uOpacity, 0.0, 1.0));
    return;
  }

  // Pixel-space grid: dot size is invariant under mesh transforms.
  vec2 res = max(uResolution, vec2(1.0));
  float density01 = clamp(uDensity / 2.8, 0.0, 1.0);
  float spacingPx = mix(22.0, 11.0, density01); // denser => tighter spacing
  vec2 phasePx = vec2(uPlanePhase * 7.0, uPlanePhase * 11.0);
  vec2 p = gl_FragCoord.xy + phasePx;
  vec2 cell = mod(p, spacingPx) - 0.5 * spacingPx;
  float d = length(cell);

  // Fixed-radius circles in pixels (intensity no longer changes dot size).
  float dotRadiusPx = 3.2;
  float aaPx = 1.0;
  float dotMask = 1.0 - smoothstep(dotRadiusPx - aaPx, dotRadiusPx + aaPx, d);

  // Keep pattern strictly inside each plane bounds.
  float edgeX = smoothstep(0.01, 0.03, vUv.x) * smoothstep(0.01, 0.03, 1.0 - vUv.x);
  float edgeY = smoothstep(0.01, 0.03, vUv.y) * smoothstep(0.01, 0.03, 1.0 - vUv.y);
  float interiorMask = edgeX * edgeY;

  // Coverage from fade: 0=none (full), 1=radial, 2=linear. Stable; no time/UV animation.
  float coverage = 1.0;
  if (uFadeMode > 0.5) {
    if (uFadeMode < 1.5) {
      float dist = length(vUv - 0.5);
      coverage = 1.0 - smoothstep(uFadeInner, uFadeOuter, dist);
      coverage = pow(max(coverage, 0.0), uFadePower);
      if (dist <= uFadeInner) coverage = max(coverage, 0.15);
    } else {
      float distLinear = abs(vUv.y - 0.5) * 2.0;
      coverage = 1.0 - smoothstep(uFadeInner, uFadeOuter, distLinear);
      coverage = pow(max(coverage, 0.0), uFadePower);
      if (distLinear <= uFadeInner) coverage = max(coverage, 0.15);
    }
  }

  // Membrane fill + dots: keep a faint slab so the center plane reads on mobile,
  // then modulate up where dots are present (decon halftone grammar).
  // IMPORTANT: Do not multiply alpha by intensity; intensity shapes the dots above.
  float baseFill = 0.18; // 0..1 baseline alpha between dots
  float a = uOpacity * mix(baseFill, 1.0, dotMask) * interiorMask * coverage;

  // Less aggressive discard: mobile precision + multiple multipliers can push values low.
  if (a < 0.001) discard;
  gl_FragColor = vec4(uColor, a);
}
`;
