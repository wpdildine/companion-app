/**
 * Starfield shader: twinkle via uTime.
 */

export const starfieldVertex = `
  attribute vec3 color;
  attribute float size;
  uniform float uTime;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vColor = color;
    float t = uTime * 2.0 + position.x * 100.0;
    vTwinkle = 0.6 + 0.4 * sin(t);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * (300.0 / -mv.z) * vTwinkle;
  }
`;

export const starfieldFragment = `
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = 1.0 - smoothstep(0.0, 0.5, d);
    a *= vTwinkle;
    gl_FragColor = vec4(vColor, a * 0.9);
  }
`;
