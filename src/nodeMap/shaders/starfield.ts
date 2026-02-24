/**
 * Starfield shader: twinkle via uTime.
 */

export const starfieldVertex = `
  attribute vec3 aColor;
  attribute float size;
  uniform float uTime;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vColor = aColor;
    float t = uTime * 1.4 + position.x * 8.0 + position.z * 6.0;
    vTwinkle = 0.55 + 0.45 * sin(t);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float px = size * (1100.0 / -mv.z) * (0.8 + 0.4 * vTwinkle);
    gl_PointSize = clamp(px, 1.2, 5.0);
  }
`;

export const starfieldFragment = `
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = 1.0 - smoothstep(0.0, 0.5, d);
    float core = 1.0 - smoothstep(0.0, 0.25, d);
    a = a * (0.65 + 0.35 * vTwinkle) + core * 0.25;
    gl_FragColor = vec4(vColor, min(a, 1.0));
  }
`;
