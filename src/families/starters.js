// Cold-start examples: the first minute must never require typing.
// Five one-click starting points, deliberately different in kind — a wave,
// a feedback toy, integer glitch, a fractal and a domain warp — so the first
// thing a new session sees is the range of the instrument, not a blank lab.
// Sources are self-contained (no family lookup) so this list cannot rot.

export const STARTERS = [
  {
    id: 'ripple',
    label: 'Ripple',
    source: 'sin(t * 2.0 - length(x - 0.0, y - 0.0) * 8.0)',
    coords: 'cartesian',
    palette: 0,
    smooth: false,
    tone: 0,
  },
  {
    id: 'trails',
    label: 'Trails',
    source: 'prev(x + 0.004 * sin(t * 0.7), y + 0.003) * 0.97 + 0.06 * sin(length(x, y) * 14.0 - t * 2.0)',
    coords: 'cartesian',
    palette: 4,
    smooth: true,
    tone: 0,
  },
  {
    id: 'bytebeat',
    label: 'Bytebeat',
    source: 'band(i * bor(shr(i + floor(t * 90.0), 8.0), shr(i, 9.0)), 46.0) * 0.043 - 1.0',
    coords: 'cartesian',
    palette: 2,
    smooth: false,
    tone: 0,
  },
  {
    id: 'kaliset',
    label: 'Kaliset',
    source: 'kali(x * 1.2, y * 1.2, 0.55 + sin(t * 0.1) * 0.05, 0.4, 12.0) * 2.0 - 1.0',
    coords: 'cartesian',
    palette: 1,
    smooth: true,
    tone: 1,
  },
  {
    id: 'warp',
    label: 'Warp',
    source: 'fbm(x + 1.5 * fbm(x + t * 0.1, y, 4.0), y + 1.5 * fbm(x, y + t * 0.1, 4.0), 4.0) * 2.0 - 1.0',
    coords: 'cartesian',
    palette: 3,
    smooth: false,
    tone: 2,
  },
];
