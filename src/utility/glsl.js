// Shared GLSL snippets.

// Polynomial fit of matplotlib's magma colormap; same coefficients as spectrogramColors.js (CC0,
// https://www.shadertoy.com/view/WlfXRN), so 2D and 3D views use identical colours.
export const MAGMA_GLSL = /* glsl */ `
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
`;

// Anti-aliased grid line intensity (0..1) for coordinates `p` with line spacing `step`.
export const GRID_GLSL = /* glsl */ `
float gridLine(vec2 p, vec2 step) {
  vec2 g = abs(fract(p / step - 0.5) - 0.5) / fwidth(p / step);
  return 1.0 - min(min(g.x, g.y), 1.0);
}
`;
