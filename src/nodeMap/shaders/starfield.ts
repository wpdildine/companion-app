/**
 * Starfield shader: twinkle via uTime.
 */

export const starfieldVertex = `
  attribute vec3 aColor;
  attribute float size;
  uniform float uTime;
  uniform float uMode;
  uniform float uActivity;
  varying vec3 vColor;
  varying float vTwinkle;
  varying float vPhase;
  void main() {
    vColor = aColor;
    float t = uTime * 1.4 + position.x * 8.0 + position.z * 6.0;
    vPhase = t;
    // Mode patterns:
    // 0 idle: soft pulsating
    // 1 listening: hard red pulsating
    // 2 processing: blue soft pulsating
    // 3 speaking: cyan/green oscillation (speed by activity)
    if (uMode < 0.5) {
      vTwinkle = 0.72 + 0.28 * sin(t * 0.9);
    } else if (uMode < 1.5) {
      float hard = abs(sin(t * 3.2));
      vTwinkle = 0.2 + 0.8 * pow(hard, 2.8);
    } else if (uMode < 2.5) {
      vTwinkle = 0.65 + 0.35 * sin(t * 1.1);
    } else if (uMode < 3.5) {
      float talk = clamp(uActivity, 0.0, 1.0);
      vTwinkle = 0.55 + 0.45 * sin(t * (1.0 + talk * 2.8));
    } else {
      vTwinkle = 0.62 + 0.38 * sin(t * 1.6);
    }
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float px = size * (1100.0 / -mv.z) * (0.8 + 0.4 * vTwinkle);
    gl_PointSize = clamp(px, 1.2, 5.0);
  }
`;

export const starfieldFragment = `
  varying vec3 vColor;
  varying float vTwinkle;
  varying float vPhase;
  uniform float uTime;
  uniform float uMode;
  uniform float uActivity;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = 1.0 - smoothstep(0.0, 0.5, d);
    float core = 1.0 - smoothstep(0.0, 0.25, d);
    a = a * (0.65 + 0.35 * vTwinkle) + core * 0.25;
    vec3 col = vColor;
    if (uMode < 0.5) {
      col *= vec3(0.92, 0.95, 1.0);
    } else if (uMode < 1.5) {
      col = mix(vec3(0.72, 0.06, 0.10), vec3(1.0, 0.22, 0.16), vTwinkle);
    } else if (uMode < 2.5) {
      col = mix(vec3(0.20, 0.40, 1.00), vec3(0.45, 0.72, 1.00), vTwinkle);
    } else if (uMode < 3.5) {
      float talk = clamp(uActivity, 0.0, 1.0);
      float osc = 0.5 + 0.5 * sin(vPhase * (0.9 + talk * 2.6) + uTime * 0.9);
      col = mix(vec3(0.14, 0.85, 0.95), vec3(0.18, 0.95, 0.45), osc);
    }
    gl_FragColor = vec4(col, min(a, 1.0));
  }
`;
