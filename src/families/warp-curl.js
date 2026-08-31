export default {
  id: 'warp.curl',
  name: 'Curl warp',
  source: 'vec2(40.0 * (fbm(x, y + 0.01, 4.0) - fbm(x, y - 0.01, 4.0)), 40.0 * (fbm(x - 0.01 + t * 0.05, y, 4.0) - fbm(x + 0.01 + t * 0.05, y, 4.0)))',
  params: {},
  coords: 'cartesian',
  notes: 'Curl of fbm (finite differences) as a displacement field — divergence-free swirls warping the base pattern. vec2 output mode.',
  ref: 'https://iquilezles.org/articles/warp/',
};
