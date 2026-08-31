export default {
  id: 'shape.superformula',
  name: 'Superformula',
  source: 'pow(pow(abs(cos(6.0 * (th + t * 0.1) / 4.0)), 12.0) + pow(abs(sin(6.0 * (th + t * 0.1) / 4.0)), 12.0), -0.16) - r * 1.4',
  params: {},
  coords: 'cartesian',
  notes: 'Gielis superformula as a signed field: positive inside the shape. a = symmetry count m, the exponents shape the petals. Uses th/r directly, so keep coords on cart.',
  ref: '',
};
