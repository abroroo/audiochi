import { GRID_GLSL, MAGMA_GLSL } from "./glsl";

// Colour: the same magma colormap as the 2D spectrogram (polynomial fit, see spectrogramColors.js).
// Shape: surface normals come from screen-space derivatives of the position, so the moving terrain
// is lit correctly without recomputing normals on the CPU every frame. Loud peaks also glow a
// little, and distant parts fade into the background for depth.
export default /* glsl */ `
uniform vec3 uBackground;
uniform vec3 uLightDirection; // view space, normalized
uniform float uFogNear;
uniform float uFogFar;
uniform vec2 uGridStep; // world units between grid lines: (time, frequency)
varying float vLevel;
varying vec3 vViewPosition;
varying vec2 vGrid;

${GRID_GLSL}
${MAGMA_GLSL}
void main() {
  vec3 base = magma(0.1 + 0.9 * vLevel);

  vec3 normal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
  float diffuse = max(dot(normal, uLightDirection), 0.0);
  vec3 viewDir = normalize(-vViewPosition);
  float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);

  vec3 color = base * (0.35 + 0.8 * diffuse)  // shaded body
             + base * vLevel * 0.45           // loud peaks glow
             + vec3(0.9, 0.5, 0.7) * rim * 0.12 * (0.3 + vLevel);
  // Faint grid on the quiet floor gives the surface scale; it fades out where sound rises.
  color += vec3(0.55, 0.35, 0.8) * gridLine(vGrid, uGridStep) * 0.18 * (1.0 - smoothstep(0.15, 0.45, vLevel));

  float fog = smoothstep(uFogNear, uFogFar, length(vViewPosition));
  gl_FragColor = vec4(mix(color, uBackground, fog), 1.0);
}
`;
