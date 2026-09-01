export default {
  id: 'self.homeostat',
  name: 'Homeostat',
  source: 'prev(x, y) * 0.9 + 0.3 * sin(length(x, y) * (4.0 + 40.0 * (0.7 - s_ent)) - t) + 0.8 * (s_sym - 0.6) * sin(x * 5.0 + y * 2.0 - t)',
  params: {},
  coords: 'cartesian',
  notes: 'Two loops through the image\'s own previous-frame stats (s_ent, s_sym): ring frequency chases an entropy target (0.7 — the b/e sliders), a diagonal wave grows while the frame is more mirrored than 0.6 (the g/h sliders). Neither loop settles: the image hunts, even with t held. Replace s_ent and s_sym by constants and it is a static ring field within 30 frames.',
  ref: 'docs/DECISIONS.md #43',
};
