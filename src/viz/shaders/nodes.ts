/**
 * Node cloud shader: breathing, leaf drift (fuzzy sphere), pulse intensity, glow.
 * uActivity scales opacity/glow (plan: "connect the dots").
 */

export const nodeVertex = `
  attribute float nodeSize;
  attribute float nodeType;
  attribute vec3 nodeColor;
  attribute float distanceFromRoot;
  attribute float decayPhase;
  attribute float decayRate;
  attribute float decayDepth;
  attribute float visible;
  uniform float uTime;
  uniform float uActivity;
  uniform float uMode;
  uniform float uBaseNodeSize;
  uniform vec3 uPulsePositions[3];
  uniform float uPulseTimes[3];
  uniform vec3 uPulseColors[3];
  uniform float uPulseSpeed;
  uniform vec3 uTouchWorld;
  uniform float uTouchInfluence;
  uniform mat4 uModelMatrix;
  uniform mat4 uViewMatrix;
  uniform mat4 uProjectionMatrix;
  uniform float uTouchRadius;
  uniform float uTouchStrength;
  uniform float uTouchMaxOffset;
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
    float localNoise = sin(position.x * 5.7 + position.y * 3.9 + position.z * 4.3 + uTime * 0.45 + decayPhase);
    float swirl = sin(uTime * (0.32 + decayRate * 0.18) + position.x * 2.1) + cos(uTime * (0.27 + decayRate * 0.15) + position.z * 1.9);
    // Keep spherical core, but loosen edge falloff so the outer shell extends further.
    float edgeRelax = smoothstep(0.25, 1.0, distanceFromRoot);
    float radialFuzz =
      (0.07 + decayDepth * 0.36) * (0.75 + edgeRelax * 1.45) * localNoise +
      (0.05 + edgeRelax * 0.12) * swirl;
    float tangentFuzzA = sin(uTime * 0.38 + decayPhase + position.y * 4.0);
    float tangentFuzzB = cos(uTime * 0.31 + decayPhase + position.x * 4.0);
    vec3 tangent = normalize(vec3(-position.z + 1e-3, 0.0, position.x + 1e-3));
    vec3 bitangent = normalize(cross(normalize(position), tangent));
    vec3 pos =
      position +
      normalize(position) * radialFuzz +
      tangent * (0.03 + decayDepth * 0.08 + edgeRelax * 0.06) * tangentFuzzA +
      bitangent * (0.03 + decayDepth * 0.08 + edgeRelax * 0.06) * tangentFuzzB;
    vec4 worldPreTouch = uModelMatrix * vec4(pos, 1.0);
    float touchDistWorld = distance(worldPreTouch.xyz, uTouchWorld);
    vec3 touchAwayWorld = touchDistWorld > 0.01 ? normalize(worldPreTouch.xyz - uTouchWorld) : vec3(0.0);
    float radiusMask = 1.0 - smoothstep(0.0, uTouchRadius, touchDistWorld);
    float repulse = min(uTouchMaxOffset, uTouchInfluence * uTouchStrength * radiusMask * radiusMask);
    vec4 world = vec4(worldPreTouch.xyz + touchAwayWorld * repulse, 1.0);
    vec3 sphereDir = normalize(position);
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
    // Coordinate node palette with starfield: same warm/cool endpoints and cadence.
    vec3 starWarm = vec3(1.0, 0.9, 0.78);
    vec3 starCool = vec3(0.72, 0.82, 1.0);
    float starSync = 0.5 + 0.5 * sin(uTime * 1.4 + position.x * 8.0 + position.z * 6.0);
    vec3 starSyncColor = mix(starWarm, starCool, starSync);
    vec3 baseColor = mix(nodeColor, gradientColor, 0.38 + 0.16 * uActivity);
    float hueWave = 0.5 + 0.5 * sin(uTime * (0.9 + decayRate * 0.35) + decayPhase + distanceFromRoot * 8.0);
    vec3 oscillateA = vec3(0.30, 0.58, 1.00);
    vec3 oscillateB = vec3(0.98, 0.30, 0.82);
    vec3 oscillateColor = mix(oscillateA, oscillateB, hueWave);
    baseColor = mix(baseColor, starSyncColor, 0.48);
    baseColor = mix(baseColor, oscillateColor, 0.62);
    // Mode-based color to match starfield: listening=red, processing=blue, speaking=cyan/green.
    if (uMode >= 0.5 && uMode < 1.5) {
      float hard = abs(sin(uTime * 3.2 + decayPhase + distanceFromRoot * 4.0));
      vec3 listenColor = mix(vec3(0.72, 0.06, 0.10), vec3(1.0, 0.22, 0.16), pow(hard, 2.8));
      baseColor = mix(baseColor, listenColor, 0.78);
    } else if (uMode >= 1.5 && uMode < 2.5) {
      float soft = 0.5 + 0.5 * sin(uTime * 1.1 + decayPhase + distanceFromRoot * 4.0);
      vec3 processColor = mix(vec3(0.20, 0.40, 1.00), vec3(0.45, 0.72, 1.00), soft);
      baseColor = mix(baseColor, processColor, 0.72);
    } else if (uMode >= 2.5 && uMode < 3.5) {
      float talk = clamp(uActivity, 0.0, 1.0);
      float osc = 0.5 + 0.5 * sin(uTime * (0.9 + talk * 2.6) + decayPhase + distanceFromRoot * 4.0);
      vec3 speakColor = mix(vec3(0.14, 0.85, 0.95), vec3(0.18, 0.95, 0.45), osc);
      baseColor = mix(baseColor, speakColor, 0.75);
    }
    float touchDistGlow = distance(world.xyz, uTouchWorld);
    float touchBoost = uTouchInfluence * (1.0 - smoothstep(0.0, 2.0, touchDistGlow));
    float pulseBoost = clamp(pulse, 0.0, 1.0);
    float glowGate = max(touchBoost, pulseBoost);
    float randA = sin(uTime * (0.23 + decayRate * 0.41) + decayPhase * 1.7);
    float randB = cos(uTime * (0.61 + decayRate * 0.27) + decayPhase * 0.37);
    float randC = sin(uTime * (1.07 + decayRate * 0.53) + decayPhase * 2.31 + position.y * 1.7);
    float randomDecayMix = clamp(0.5 + 0.5 * (0.5 * randA + 0.3 * randB + 0.2 * randC), 0.0, 1.0);
    float randomDecay = 1.0 - decayDepth * (0.12 + 0.95 * randomDecayMix);
    vec3 brightBase = baseColor * (1.25 + 0.2 * uActivity);
    vColor = mix(brightBase, brightBase + vec3(0.18), glowGate * 0.55);
    float baseAlpha = (0.42 + 0.34 * uActivity) * breath * randomDecay;
    vAlpha = baseAlpha + glowGate * (0.10 + 0.16 * uActivity);
    vec4 mv = uViewMatrix * world;
    gl_Position = uProjectionMatrix * mv;
    float sizeDecay = 1.0 - decayDepth * 0.22 * (0.35 + 0.65 * randomDecayMix);
    float s = (uBaseNodeSize + nodeSize) * sizeDecay * (220.0 / -mv.z) * (1.0 + pulse * 0.35 + touchBoost * 0.2);
    gl_PointSize = max(s, 2.4) * max(0.0, visible);
    vAlpha *= max(0.0, visible);
  }
`;

export const nodeFragment = `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vPulse;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    // Sharper point profile to reduce blur/haze.
    float edge = 1.0 - smoothstep(0.0, 0.34, d);
    float core = 1.0 - smoothstep(0.0, 0.13, d);
    float a = (edge * 0.35 + core * 0.65) * vAlpha;
    a += vPulse * 0.14 * (1.0 - d * 2.0);
    gl_FragColor = vec4(vColor, min(a, 1.0));
  }
`;
