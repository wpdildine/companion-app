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

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float randSpan(vec2 p) {
  return hash(p) * 0.6 + 0.2;
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  float scale = mix(3.2, 5.6, clamp((uHalftoneScale - 0.3) / 2.2, 0.0, 1.0));
  vec2 uv = (2.0 * gl_FragCoord.xy - res.xy) / res.y;
  uv *= scale;

  float t = uNoisePhase * 1.8;
  uv += vec2(0.7, 0.5) * t;

  vec2 fl = floor(uv);
  vec2 fr = fract(uv);
  float ch = step(0.5, mod(fl.x + fl.y, 2.0));
  vec2 ax = mix(fr.yx, fr.xy, ch);

  float r1 = randSpan(fl);
  float a1 = ax.x - r1;
  float si = sign(a1);
  vec2 o1 = mix(vec2(0.0, si), vec2(si, 0.0), ch);

  float r2 = randSpan(fl + o1);
  float a2 = ax.y - r2;
  vec2 st = step(vec2(0.0), vec2(a1, a2));

  vec2 of = mix(st.yx, st.xy, ch);
  vec2 id = fl + of - 1.0;

  float ch2 = step(0.5, mod(id.x + id.y, 2.0));
  float r00 = randSpan(id + vec2(0.0, 0.0));
  float r10 = randSpan(id + vec2(1.0, 0.0));
  float r01 = randSpan(id + vec2(0.0, 1.0));
  float r11 = randSpan(id + vec2(1.0, 1.0));

  vec2 s0 = mix(vec2(r01, r00), vec2(r00, r10), ch2);
  vec2 s1 = mix(vec2(r10, r11), vec2(r11, r01), ch2);
  vec2 s = 1.0 - s0 + s1;

  vec2 puv = (uv - id - s0) / max(s, vec2(0.001));
  vec2 b = (0.5 - abs(puv - 0.5)) * s;
  float d = min(b.x, b.y);
  float edgeIn = smoothstep(0.012, 0.038, d); // sharp seams
  float seam = 1.0 - edgeIn;

  // Fixed occupancy target: ~75% filled.
  float fillSel = step(0.25, hash(id * 1.31 + 7.2));
  float tintMix = hash(id * 2.17 + 1.4);
  vec3 tintA = uColor * 0.72;
  vec3 tintB = min(vec3(1.0), uColor * 1.35 + vec3(0.02, 0.06, 0.1));
  vec3 fillCol = mix(tintA, tintB, tintMix);
  vec3 col = mix(vec3(0.0), fillCol, fillSel);

  col *= edgeIn;
  col -= seam * 0.28;
  col = max(col, vec3(0.0));

  // Visibility bias: keep the detail plane readable even when scene tint/opacity is low.
  vec3 biasColor = vec3(0.72, 0.0, 0.72);
  float biasMask = 0.22 + 0.58 * edgeIn;
  col = max(col, biasColor * biasMask);

  float radial = length((gl_FragCoord.xy / res) - 0.5);
  float vignette = 1.0 - smoothstep(0.22, 0.88, radial);
  float aShape = mix(0.24, 1.0, fillSel) * (0.8 + 0.2 * edgeIn);
  float a = uOpacity * max(0.9, uIntensity) * max(0.72, aShape) * (0.85 + 0.15 * vignette);
  a = max(a, uOpacity * 0.28);
  if (a < 0.001) discard;
  gl_FragColor = vec4(col, a);
}
`;
