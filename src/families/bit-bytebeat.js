export default {
  id: 'bit.bytebeat_pixel',
  name: 'Bytebeat pixels',
  source: 'band(i * bor(shr(i + floor(t * 90.0), 8.0), shr(i, 9.0)), 46.0) * 0.043 - 1.0',
  params: {},
  coords: 'cartesian',
  notes: 'Viznut-style bytebeat on the pixel index: bands of self-similar interference with hard integer edges. The shift amounts (8, 9) set the band structure, the mask (46) selects which bits survive — both are the interesting sliders.',
  ref: 'http://viznut.fi/texts-en/bytebeat_algorithmic_symphonies.html',
};
