// Shared parity corpus: ≥ 20 formulas covering every whitelisted function and
// operator. Used by the emitJS↔interpreter parity test AND by the mutation
// test that proves that parity test can actually fail (ADR #34).
// Not a *.test.js file, so vitest does not collect it.

export const CORPUS = [
  'sin(x * y * 4.0 + t) + cos(3.0 * x + t * 0.7)',
  'tan(x * 0.4) + atan(y * 2.0) + atan2(y, x)',
  'abs(x) - floor(y * 3.0) + fract(t * 2.0)',
  'mod(x * 5.0, 2.0) - pow(abs(y) + 0.1, 2.5)',
  'sqrt(abs(x * y)) + exp(0.0 - r * 2.0) + log(abs(x) + 1.5)',
  'min(x, y) * max(x, y) + clamp(t, 0.0, 1.0)',
  'mix(x, y, 0.3) + step(0.2, x) - smoothstep(0.0, 1.0, y)',
  'length(x) + length(x, y) + sign(x - y)',
  'noise(x * 3.0, y * 3.0) * 2.0 - 1.0',
  'fbm(x * 2.0, y * 2.0, 4.0) * 2.0 - 1.0',
  'worley(x * 4.0, y * 4.0) - hash(x, y)',
  'julia(x, y, 0.355, 0.355, 24.0) * 2.0 - 1.0',
  'ship(x * 1.2, y * 1.2, 0.0 - 0.6, 0.0 - 0.4, 16.0)',
  'kali(x, y, 0.55, 0.4, 12.0) * 2.0 - 1.0',
  'orbit(x, y, 0.3, 0.5, 20.0)',
  'fold(x * 3.0 + t) - fold(y * 2.0)',
  'band(i, 255.0) * 0.01 + bor(x * 100.0, y * 100.0) * 0.001',
  'bxor(i, shl(2.0, 3.0)) * 0.001 + shr(i, 2.0) * 0.0001 + bnot(x * 10.0) * 0.01',
  '(x < y) + (x > 0.5) * 2.0 + (x == x) * 0.5',
  '-x ^ 2.0 + 3.0 / (y + 2.0) - th * r + mx * my',
  'sin(440.0 * 6.283 * t) * 0.5',
  'vec2(sin(440.0 * 6.283 * t), sin(662.0 * 6.283 * t))',
  'vec2(fbm(x, y, 3.0), worley(x, y))',
  'vec3(abs(sin(x + t)), abs(cos(y)), fract(x * y))',
  'dx * 100.0 + dy * 100.0 + i * 0.0001',
];

/** Deterministic spread of evaluation points, incl. negatives and zero. */
export function envAt(k) {
  const f = (n) => Math.sin(k * 12.9898 + n * 78.233) * 0.9;
  return {
    x: f(1), y: f(2), t: k * 0.37, r: Math.abs(f(3)) * 1.4, th: f(4) * Math.PI,
    mx: f(5), my: f(6), i: k * 137, dx: 0.002, dy: 0.002,
    params: {},
  };
}

/** The parity tolerance the suite claims: 1e-6, relative for large values. */
export function withinTolerance(got, ref) {
  if (!Number.isFinite(ref)) return !Number.isFinite(got);
  return Math.abs(got - ref) <= 1e-6 * Math.max(1, Math.abs(ref));
}
