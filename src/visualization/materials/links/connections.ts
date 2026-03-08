/**
 * Connection layer: bezier curve, flow along path, pulse, uActivity for visibility.
 */

export const connectionVertex = `
  attribute float t;
  attribute vec3 startPoint;
  attribute vec3 endPoint;
  attribute float connectionStrength;
  attribute float pathIndex;
  attribute vec3 connectionColor;
  uniform float uTime;
  uniform float uActivity;
  uniform vec3 uPulsePositions[3];
  uniform float uPulseTimes[3];
  uniform vec3 uPulseColors[3];
  uniform float uPulseSpeed;
  uniform float uTouchInfluence;
  uniform vec3 uTouchWorld;
  uniform float uMotionMicro;
  uniform float uMotionAxisX;
  uniform float uMotionAxisY;
  uniform float uAlphaScale;
  varying float vT;
  varying vec3 vColor;
  varying float vAlpha;

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
    vec3 control = (startPoint + endPoint) * 0.5 + vec3(0.2 * sin(pathIndex), 0.1 * cos(pathIndex * 0.7), 0.15 * sin(pathIndex * 0.5));
    float oneMinusT = 1.0 - t;
    vec3 pos = oneMinusT * oneMinusT * startPoint + 2.0 * oneMinusT * t * control + t * t * endPoint;
    float micro = max(uMotionMicro, uTouchInfluence * 0.35) * 0.06;
    vec3 wobble = vec3(
      sin(uTime * 0.9 + pathIndex + t * 6.28) * micro * uMotionAxisX,
      cos(uTime * 0.7 + pathIndex * 1.3 + t * 5.0) * micro * uMotionAxisY,
      sin(uTime * 0.5 + pathIndex * 0.6 + t * 4.0) * micro * 0.5
    );
    pos += wobble;
    vec2 touchDelta = pos.xy - uTouchWorld.xy;
    float touchDist = length(touchDelta);
    float touchBoost = uTouchInfluence * (1.0 - smoothstep(0.0, 2.0, touchDist));
    if (touchDist > 0.0001) {
      vec2 touchDir = normalize(touchDelta);
      pos.xy += touchDir * touchBoost * 0.08;
    }
    vec4 world = modelMatrix * vec4(pos, 1.0);
    float pulse = getPulseIntensity(world.xyz);
    float pulseBoost = clamp(pulse, 0.0, 1.0);
    float glowGate = max(uTouchInfluence, pulseBoost);
    vT = t;
    vColor = mix(connectionColor, connectionColor + vec3(0.12), glowGate * 0.6);
    float flowMod = 0.7 + 0.3 * sin(uTime * 2.0 + pathIndex);
    float baseAlpha = connectionStrength * (0.16 + 0.22 * uActivity) * flowMod * uAlphaScale;
    float glowAlpha = connectionStrength * glowGate * (0.08 + 0.14 * uActivity) * uAlphaScale;
    vAlpha = baseAlpha + glowAlpha;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const connectionFragment = `
  varying float vT;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uTime;

  void main() {
    float flow = 0.6 + 0.4 * sin(uTime * 3.0 + vT * 6.28);
    gl_FragColor = vec4(vColor, vAlpha * flow);
  }
`;
