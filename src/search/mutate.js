// Mutation operators (§6). Pure functions, injectable RNG — testable in Node.
// v1 ships const_tweak (needed for the contact sheet); the rest lands in v2.

/** Standard normal via Box–Muller. */
export function gaussian(rng = Math.random) {
  let u = 0;
  while (u === 0) u = rng(); // avoid log(0)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/**
 * Gaussian-perturb every unlocked param. Sigma scales with the magnitude of
 * each value (min 1) so small and large constants drift proportionally.
 * Returns a new params object; the input is untouched.
 *
 * @param {Record<string, number>} params
 * @param {() => number} rng
 * @param {{ sigma?: number, locks?: Record<string, boolean> }} opts
 */
export function constTweak(params, rng = Math.random, opts = {}) {
  const { sigma = 0.25, locks = {} } = opts;
  const out = { ...params };
  for (const [name, value] of Object.entries(out)) {
    if (locks[name]) continue;
    out[name] = value + gaussian(rng) * sigma * Math.max(1, Math.abs(value));
  }
  return out;
}
