export const BACKGROUND_DETAIL_FRAGMENT = `
precision mediump float;

varying vec2 vUv;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uNoisePhase;
uniform float uIntensity;
uniform float uHalftoneThreshold;
uniform float uHalftoneScale;
uniform vec2 uResolution;

// -----------------------------
// Pattern controls
// -----------------------------
const vec2 TILE_GRID = vec2(20.0, 2.0);    // Higher = denser/smaller tiles
const float TILE_MARGIN = 0.02;             // Higher = thicker black grout
const vec2 UV_SCROLL = vec2(0.01, 0.04);   // Pattern drift speed

// Fill clustering controls
const vec2 CLUSTER_BIG_SCALE = vec2(6.0, 6.0);
const vec2 CLUSTER_MID_SCALE = vec2(3.0, 3.0);
const float CLUSTER_BIG_WEIGHT = 0.9;
const float CLUSTER_MID_WEIGHT = 0.8;
const float LOCAL_JITTER_AMP = 0.12;
const float FILL_THRESHOLD = 0.68;          // Lower = more fill, higher = more black

// Colors/output
const vec3 COLOR_BG = vec3(0.0, 0.0, 0.0);
const vec3 COLOR_FILL = vec3(0.0, 0.9, 0.9);
const float BORDER_DARKEN = 0.95;
const float OUTPUT_ALPHA = 0.05;

float hash21(vec2 p) {
  // Deterministic mediump-safe tile hash.
  // Keep values bounded with mod to avoid precision collapse on mobile GPUs.
  vec2 q = mod(p, vec2(61.0, 59.0));
  float n = q.x * 0.06711056 + q.y * 0.00583715;
  return fract(52.9829189 * fract(n));
}

void main() {
  // Hard debug-visible tile pattern in screen space.
  vec2 res = max(uResolution, vec2(1.0));
  vec2 p = gl_FragCoord.xy / res + UV_SCROLL * uNoisePhase;
  vec2 g = p * TILE_GRID;
  vec2 cellId = floor(g);
  vec2 cellUv = fract(g);

  float margin = TILE_MARGIN;
  float inTile = step(margin, cellUv.x) * step(margin, cellUv.y) *
                 step(cellUv.x, 1.0 - margin) * step(cellUv.y, 1.0 - margin);
  float border = 1.0 - inTile;

  // Two-scale clump field so BOTH magenta and black form contiguous blobs.
  vec2 clusterBig = floor(cellId / CLUSTER_BIG_SCALE);
  vec2 clusterMid = floor(cellId / CLUSTER_MID_SCALE);
  float bigRnd = hash21(clusterBig + vec2(8.3, 1.7));
  float midRnd = hash21(clusterMid + vec2(3.9, 6.2));
  float localJitter =
    (hash21(cellId + vec2(2.7, 9.4)) - 0.5) * LOCAL_JITTER_AMP;
  float clumpField = clamp(
    CLUSTER_BIG_WEIGHT * bigRnd + CLUSTER_MID_WEIGHT * midRnd + localJitter,
    0.0,
    1.0
  );
  // High threshold keeps black dominant while preserving magenta islands.
  float fillSel = step(FILL_THRESHOLD, clumpField);

  vec3 blackBg = COLOR_BG;
  vec3 magentaTile = COLOR_FILL;

  float tileVisible = inTile * fillSel;
  vec3 col = mix(blackBg, magentaTile, tileVisible);
  // Hard grout/border to make tile structure obvious.
  col = mix(col, COLOR_BG, border * BORDER_DARKEN);
  gl_FragColor = vec4(col, OUTPUT_ALPHA);
}
`;
