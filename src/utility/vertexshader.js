// Raises each vertex of the flat terrain by its loudness (0–255) and passes the level and view-space
// position on, so the fragment shader can colour and light it.
export default /* glsl */ `
attribute float displacement;
uniform float uMaxHeight;
varying float vLevel;
varying vec3 vViewPosition;
varying vec2 vGrid;

void main() {
  vLevel = displacement / 255.0;
  vGrid = position.xy;
  // The plane faces +z, so loudness pushes vertices toward the viewer. The power curve keeps the
  // noise floor low and flat while loud sounds still rise to full height.
  vec3 displaced = position + vec3(0.0, 0.0, pow(vLevel, 1.6) * uMaxHeight);
  vec4 viewPosition = modelViewMatrix * vec4(displaced, 1.0);
  vViewPosition = viewPosition.xyz;
  gl_Position = projectionMatrix * viewPosition;
}
`;
