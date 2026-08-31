export default {
  id: 'field.tixy',
  name: 'Tixy ripple',
  source: 'sin(t * 2.0 - length(x - 0.0, y - 0.0) * 8.0)',
  params: {},
  coords: 'cartesian',
  notes: 'Expanding circular wave from a movable center (a, b). length() instead of ^2 — pow on negative bases is undefined in GLSL.',
  ref: 'https://tixy.land/',
};
