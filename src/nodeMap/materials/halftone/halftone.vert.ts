/** Vertex shader for halftone plane/edge; export plain string so factory imports it. */
export const HALFTONE_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
