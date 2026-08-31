export default {
  id: 'noise.worley',
  name: 'Worley cells',
  source: '1.0 - worley(x * 4.0 + t * 0.2, y * 4.0) * 2.5',
  params: {},
  coords: 'cartesian',
  notes: 'Cellular noise (distance to nearest feature point), drifting. Inverted so cell centers glow.',
  ref: '',
};
