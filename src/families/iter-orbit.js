export default {
  id: 'iter.orbit_trap',
  name: 'Orbit trap',
  source: 'orbit(x * 1.4, y * 1.4, 0.285 + sin(t * 0.25) * 0.02, 0.01, 24.0) * 2.0 - 1.0',
  params: {},
  coords: 'cartesian',
  notes: 'Julia iteration colored by the closest pass to a circle — glowing filaments through the set.',
  ref: '',
};
