export default {
  id: 'field.chladni',
  name: 'Chladni plate',
  source: 'sin(3.0 * 3.1415927 * x) * sin(5.0 * 3.1415927 * y) - sin(5.0 * 3.1415927 * x) * sin(3.0 * 3.1415927 * y)',
  params: {},
  coords: 'cartesian',
  notes: 'Vibrating-plate nodal pattern; a/e are the classic n,m mode numbers (integers give clean plates, in-between values glitch). The pi literals are sliders too — detune them.',
  ref: '',
};
