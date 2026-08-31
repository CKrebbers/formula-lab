// Random + Latin-hypercube parameter sampling (§6), and the small random
// expressions subtree_replace grafts in. Pure, injectable RNG.

import { inferRange } from '../core/constants.js';
import { pick } from './walk.js';

/**
 * Latin hypercube: n samples × dims values in [0,1). Each dimension is split
 * into n strata; every sample hits a different stratum per dimension.
 */
export function latinHypercube(n, dims, rng = Math.random) {
  const samples = Array.from({ length: n }, () => new Array(dims));
  for (let d = 0; d < dims; d++) {
    const strata = Array.from({ length: n }, (_, i) => (i + rng()) / n);
    // Fisher–Yates shuffle so strata are assigned to samples randomly
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [strata[i], strata[j]] = [strata[j], strata[i]];
    }
    for (let i = 0; i < n; i++) samples[i][d] = strata[i];
  }
  return samples;
}

/**
 * n stratified variants of a param set: every unlocked param sampled across
 * its inferred range via Latin hypercube (§6: use LHS when rerolling ≥ 3).
 * Locked params keep their value in every variant.
 */
export function lhsParamSets(params, n, rng = Math.random, { locks = {} } = {}) {
  const names = Object.keys(params).filter((name) => !locks[name]);
  const cube = latinHypercube(n, names.length, rng);
  return cube.map((row) => {
    const out = { ...params };
    names.forEach((name, d) => {
      const { min, max } = inferRange(params[name]);
      out[name] = min + row[d] * (max - min);
    });
    return out;
  });
}

const EXPR_VARS = ['x', 'y', 't', 'r', 'th'];
const EXPR_FNS = ['sin', 'cos', 'abs', 'fract', 'fold']; // no sqrt/log — negative args go NaN

/**
 * Small random expression for subtree_replace: depth ≤ 2, only NaN-safe
 * functions, constants in 0..4.
 */
export function randomExpr(rng = Math.random, depth = 2) {
  if (depth <= 0 || rng() < 0.35) {
    return rng() < 0.55
      ? { type: 'var', name: pick(rng, EXPR_VARS) }
      : { type: 'num', value: Number((rng() * 4).toFixed(3)) };
  }
  if (rng() < 0.45) {
    return {
      type: 'bin',
      op: pick(rng, ['+', '-', '*']),
      left: randomExpr(rng, depth - 1),
      right: randomExpr(rng, depth - 1),
    };
  }
  return { type: 'call', name: pick(rng, EXPR_FNS), args: [randomExpr(rng, depth - 1)] };
}
