/**
 * Halftone fragment: dot pattern with uPlanePhase for per-mesh variation.
 * Halftone must remain readable on mobile; avoid discard-only alpha where possible.
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

void main() {
  // World-unit grid: stable isotropic spacing regardless of plane aspect/scale.
  float densityScale = mix(0.85, 1.35, clamp(uDensity / 2.5, 0.0, 1.0));
  float cellSize = 0.065 / densityScale;
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

  // Known-good path: true cutout dots (no baseline fill between dots).
  float a = uOpacity * clamp(uIntensity, 0.0, 1.0) * dotMask * interiorMask;
  if (a < 0.008) discard;
  gl_FragColor = vec4(uColor, a);
}
`;
