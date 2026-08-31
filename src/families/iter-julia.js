export default {
  id: 'iter.julia',
  name: 'Julia set',
  source: 'julia(x * 1.5, y * 1.5, -0.79 + sin(t * 0.3) * 0.05, 0.15, 32.0) * 2.0 - 1.0',
  params: {},
  coords: 'cartesian',
  notes: 'Escape-time julia; c drifts slowly. Drag c (c/e sliders) through the plane — every value is a different universe.',
  ref: '',
};
