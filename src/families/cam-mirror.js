export default {
  id: 'cam.mirror',
  name: 'Camera mirror',
  source: 'mix(sin(length(x, y) * 9.0 - t * 1.5), cam(x, y) * 1.2, 0.55 + mot * 0.4)',
  params: {},
  coords: 'cartesian',
  input: 'camera', // needs ◉ cam: excluded from random starts and the zero-player
  notes: 'Your mirror image woven into a ripple; motion (mot) pulls the mix toward the camera. Without the camera cam() reads 0 and mot 0, so this is a dim ripple.',
  ref: 'docs/DECISIONS.md #41',
};
