import * as THREE from 'three';

const BACK_PLANE_GLITCH_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const BACK_PLANE_GLITCH_FRAGMENT = `
precision mediump float;
varying vec2 vUv;

uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
uniform vec2 uResolution;
uniform float uIntensity;
uniform float uLayerPhase;
uniform sampler2D uBaseTex;
uniform vec2 uTileRepeat;

#define DURATION 5.0
#define AMT 0.5
#define SS(a, b, x) (smoothstep(a, b, x) * smoothstep(b, a, x))

float hash11(float p) {
  return fract(sin(p * 127.1) * 43758.5453123);
}

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec3 hash33(vec3 p) {
  return fract(sin(vec3(
    dot(p, vec3(127.1, 311.7, 74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6))
  )) * 43758.5453123) * 2.0 - 1.0;
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float noise3(vec3 x) {
  vec3 p = floor(x);
  vec3 w = fract(x);
  vec3 u = w * w * (3.0 - 2.0 * w);

  float a = dot(hash33(p + vec3(0.0, 0.0, 0.0)), w - vec3(0.0, 0.0, 0.0));
  float b = dot(hash33(p + vec3(1.0, 0.0, 0.0)), w - vec3(1.0, 0.0, 0.0));
  float c = dot(hash33(p + vec3(0.0, 1.0, 0.0)), w - vec3(0.0, 1.0, 0.0));
  float d = dot(hash33(p + vec3(1.0, 1.0, 0.0)), w - vec3(1.0, 1.0, 0.0));
  float e = dot(hash33(p + vec3(0.0, 0.0, 1.0)), w - vec3(0.0, 0.0, 1.0));
  float f = dot(hash33(p + vec3(1.0, 0.0, 1.0)), w - vec3(1.0, 0.0, 1.0));
  float g = dot(hash33(p + vec3(0.0, 1.0, 1.0)), w - vec3(0.0, 1.0, 1.0));
  float h = dot(hash33(p + vec3(1.0, 1.0, 1.0)), w - vec3(1.0, 1.0, 1.0));

  float k0 = a;
  float k1 = b - a;
  float k2 = c - a;
  float k3 = e - a;
  float k4 = a - b - c + d;
  float k5 = a - c - e + g;
  float k6 = a - b - e + f;
  float k7 = -a + b + c - d + e - f - g + h;
  return k0 + k1*u.x + k2*u.y + k3*u.z + k4*u.x*u.y + k5*u.y*u.z + k6*u.z*u.x + k7*u.x*u.y*u.z;
}

float gnoise01(vec3 x) {
  return 0.5 + 0.5 * noise3(x);
}

vec3 sampleBase(vec2 uv) {
  vec2 tuv = fract(uv * uTileRepeat);
  return texture2D(uBaseTex, tuv).rgb;
}

float fbm2(vec2 p) {
  float v = 0.0;
  float a = 0.55;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = vUv;
  float t = uTime + uLayerPhase * 0.37;
  float glitchAmount = SS(DURATION * 0.001, DURATION * AMT, mod(t, DURATION));
  vec3 base = sampleBase(uv);
  vec3 col = base;

  // No UV distortion: glitch is color/intensity only.
  float bt = floor(t * 30.0) * 300.0;
  float blockGlitch = 0.2 + 0.9 * glitchAmount;
  float blockNoiseX = step(gnoise01(vec3(0.0, uv.x * 3.0, bt)), blockGlitch);
  float blockNoiseX2 = step(gnoise01(vec3(0.0, uv.x * 1.5, bt * 1.2)), blockGlitch);
  float blockNoiseY = step(gnoise01(vec3(0.0, uv.y * 4.0, bt)), blockGlitch);
  float blockNoiseY2 = step(gnoise01(vec3(0.0, uv.y * 6.0, bt * 1.2)), blockGlitch);
  float block = clamp(blockNoiseX2 * blockNoiseY2 + blockNoiseX * blockNoiseY, 0.0, 1.0);

  float chromaPulse = 0.85 + 0.15 * sin(t * 11.0 + uv.y * 44.0);
  vec3 tintA = vec3(1.08, 0.98, 1.22);
  vec3 tintB = vec3(0.92, 1.08, 1.18);
  vec3 glitchTint = mix(tintA, tintB, block * chromaPulse);
  col *= glitchTint;

  float grain = hash33(vec3(uv * res, floor(mod(t * 60.0, 1000.0)))).r;
  col += (0.08 + 0.25 * glitchAmount) * grain;
  col -= (0.08 + 0.22 * glitchAmount) * sin(4.0 * t + uv.y * res.y * 1.75);

  float vig = 8.0 * uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
  col *= vec3(pow(vig, 0.33)) * 1.35;

  float radial = 1.0 - smoothstep(0.08, 0.84, length((vUv - 0.5) * vec2(res.x / res.y, 1.0)));
  col = mix(col, col * uColor, 0.85);
  col *= (0.82 + 0.18 * uIntensity);
  float alpha = uOpacity * radial * (0.65 + 0.35 * glitchAmount);
  if (alpha < 0.001) discard;
  gl_FragColor = vec4(col, alpha);
}
`;

function createSolidSourceTexture(): THREE.DataTexture {
  const data = new Uint8Array([255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function createBackPlaneGlitchMaterial(
  initialOpacity: number,
  layerPhase: number,
): THREE.ShaderMaterial {
  const baseTex = createSolidSourceTexture();
  return new THREE.ShaderMaterial({
    vertexShader: BACK_PLANE_GLITCH_VERTEX,
    fragmentShader: BACK_PLANE_GLITCH_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      uColor: { value: new THREE.Vector3(0.45, 0.48, 0.58) },
      uOpacity: { value: initialOpacity },
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uIntensity: { value: 1 },
      uLayerPhase: { value: layerPhase },
      uBaseTex: { value: baseTex },
      uTileRepeat: { value: new THREE.Vector2(88, 88) },
    },
  });
}
