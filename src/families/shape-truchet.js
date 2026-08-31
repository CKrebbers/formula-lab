export default {
  id: 'shape.truchet',
  name: 'Truchet tiles',
  source: 'mix(abs(fract(x * 4.0) + fract(y * 4.0) - 1.0), abs(fract(x * 4.0) - fract(y * 4.0)), step(0.5, hash(floor(x * 4.0), floor(y * 4.0)))) * 4.0 - 1.0',
  params: {},
  coords: 'cartesian',
  notes: 'Diagonal-line truchet: each cell picks an orientation from hash. All the 4.0 grid scales are separate sliders — desync them for glitch tiling.',
  ref: '',
};
