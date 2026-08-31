export default {
  id: 'field.moire',
  name: 'Moiré grids',
  source: 'sin(20.0 * x) * sin(20.0 * (x * cos(0.35 + t * 0.02) + y * sin(0.35 + t * 0.02)))',
  params: {},
  coords: 'cartesian',
  notes: 'Two grids, one slowly rotating — moiré bands emerge from the mismatch. Raise a/b for finer, angrier interference.',
  ref: '',
};
