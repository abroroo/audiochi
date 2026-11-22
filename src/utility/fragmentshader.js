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

// Anti-aliased grid line intensity (0..1) using screen-space derivatives.
float gridLine(vec2 p, vec2 step) {
  vec2 g = abs(fract(p / step - 0.5) - 0.5) / fwidth(p / step);
  return 1.0 - min(min(g.x, g.y), 1.0);
}

vec3 magma(float t) {
  const vec3 c0 = vec3(-0.002136485053939582, -0.000749655052795221, -0.005386127855323933);
  const vec3 c1 = vec3(0.2516605407371642, 0.6775232436837668, 2.494026599312351);
  const vec3 c2 = vec3(8.353717279216625, -3.577719514958484, 0.3144679030132573);
  const vec3 c3 = vec3(-27.66873308576866, 14.26473078096533, -13.64921318813922);
  const vec3 c4 = vec3(52.17613981234068, -27.94360607168351, 12.94416944238394);
  const vec3 c5 = vec3(-50.76852536473588, 29.04658282127291, 4.23415299384598);
  const vec3 c6 = vec3(18.65570506591883, -11.48977351997711, -5.601961508734096);
  return clamp(c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6))))), 0.0, 1.0);
}

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
