/**
 * Node cloud shader: breathing, leaf drift (fuzzy sphere), pulse intensity, glow.
 * uActivity scales opacity/glow (plan: "connect the dots").
 */

export const nodeVertex = `
  attribute float nodeSize;
  attribute float nodeType;
  attribute vec3 nodeColor;
  attribute float distanceFromRoot;
  uniform float uTime;
  uniform float uActivity;
  uniform float uBaseNodeSize;
  uniform vec3 uPulsePositions[3];
  uniform float uPulseTimes[3];
  uniform vec3 uPulseColors[3];
  uniform float uPulseSpeed;
  uniform vec3 uTouchWorld;
  uniform float uTouchInfluence;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vPulse;

  float getPulseIntensity(vec3 worldPos) {
    float intensity = 0.0;
    for (int i = 0; i < 3; i++) {
      float age = uTime - uPulseTimes[i];
      if (age < 0.0) continue;
      float dist = distance(worldPos, uPulsePositions[i]);
      float wave = dist - age * uPulseSpeed;
      intensity += exp(-wave * wave * 2.0) * (1.0 - smoothstep(0.0, 3.0, age));
    }
    return intensity;
  }

  void main() {
    float breath = 0.98 + 0.04 * sin(uTime * 1.2 + distanceFromRoot * 6.28);
    float drift = 0.02 * sin(uTime * 0.7 + position.x * 10.0) + 0.02 * cos(uTime * 0.5 + position.z * 10.0);
    vec3 pos = position + normalize(position) * drift;
    vec3 sphereDir = normalize(position);
    vec4 world = modelMatrix * vec4(pos, 1.0);
    float pulse = getPulseIntensity(world.xyz);
    vPulse = pulse;
    float gradientT = 0.5 + 0.5 * sin(
      sphereDir.y * 3.14159 +
      sphereDir.x * 1.7 +
      sphereDir.z * 0.9 +
      uTime * 0.45
    );
    vec3 gradientA = vec3(0.35, 0.55, 1.0);
    vec3 gradientB = vec3(0.95, 0.35, 0.85);
    vec3 gradientColor = mix(gradientA, gradientB, gradientT);
    vec3 baseColor = mix(nodeColor, gradientColor, 0.45 + 0.2 * uActivity);
    vColor = mix(baseColor, baseColor + vec3(0.3), pulse * 0.5);
    float touchDist = distance(world.xyz, uTouchWorld);
    float touchBoost = uTouchInfluence * (1.0 - smoothstep(0.0, 2.0, touchDist));
    vAlpha = (0.4 + 0.6 * uActivity) * breath * (1.0 + touchBoost * 0.5);
    vec4 mv = viewMatrix * world;
    gl_Position = projectionMatrix * mv;
    float s = (uBaseNodeSize + nodeSize) * (200.0 / -mv.z) * (1.0 + pulse * 0.5 + touchBoost * 0.3);
    gl_PointSize = max(s, 2.0);
  }
`;

export const nodeFragment = `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vPulse;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = 1.0 - smoothstep(0.0, 0.5, d);
    a *= vAlpha;
    a += vPulse * 0.3 * (1.0 - d * 2.0);
    gl_FragColor = vec4(vColor, min(a, 1.0));
  }
`;
