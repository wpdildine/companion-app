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
uniform float uFadeMode;
uniform float uFadeInner;
uniform float uFadeOuter;
uniform float uFadePower;

void main() {
  // World-unit grid: stable isotropic spacing regardless of plane aspect/scale.
  float densityScale = mix(0.95, 2.0, clamp(uDensity / 2.8, 0.0, 1.0));
  float cellSize = 0.06 / densityScale;
  vec2 phase = vec2(uPlanePhase * 0.013, uPlanePhase * 0.021);
  vec2 p = vUv * uPlaneSize + phase;
  vec2 cell = fract(p / cellSize) - 0.5;
  float d = length(cell) * cellSize;
  float dotRadius = cellSize * 0.26;
  float dotFeather = cellSize * 0.08;
  float dotMask = 1.0 - smoothstep(dotRadius, dotRadius + dotFeather, d);

  // Keep pattern strictly inside each plane bounds.
  float edgeX = smoothstep(0.03, 0.06, vUv.x) * smoothstep(0.03, 0.06, 1.0 - vUv.x);
  float edgeY = smoothstep(0.03, 0.06, vUv.y) * smoothstep(0.03, 0.06, 1.0 - vUv.y);
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

  // Known-good path: true cutout dots (no baseline fill between dots).
  float a = uOpacity * clamp(uIntensity, 0.0, 1.0) * dotMask * interiorMask * coverage;
  if (a < 0.008) discard;
  gl_FragColor = vec4(uColor, a);
}
`;
