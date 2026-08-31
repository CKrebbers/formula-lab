export default {
  id: 'warp.fbm',
  name: 'Domain warp (fbm)',
  source: 'fbm(x + 1.5 * fbm(x + t * 0.1, y, 4.0), y + 1.5 * fbm(x, y + t * 0.1, 4.0), 4.0) * 2.0 - 1.0',
  params: {},
  coords: 'cartesian',
  notes: 'Quilez domain warp: fbm displacing the input of another fbm. b/e is warp strength; octaves are sliders too.',
  ref: 'https://iquilezles.org/articles/warp/',
};
