export default {
  id: 'field.interference',
  name: 'Wave interference',
  source: 'sin(12.0 * length(x - 0.5, y - 0.3) - t * 2.0) + sin(11.0 * length(x + 0.6, y - 0.2) - t * 1.7) + sin(13.0 * length(x - 0.1, y + 0.6) - t * 2.3)',
  params: {},
  coords: 'cartesian',
  notes: 'Three circular waves with different centers, frequencies and speeds. Every center is a slider — drag them around.',
  ref: '',
};
