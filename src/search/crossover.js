// Subtree crossover (§6 op 10): swap a random subtree of parent A with a
// random subtree taken from parent B. Pure, injectable RNG.

import { clone, validate } from '../core/ast.js';
import { prepare, collectSlots, replaceInSlot, pick, countNodes } from './walk.js';

const MAX_NODES = 100;

/**
 * @returns {{ ast: object, operator: 'crossover' } | null}
 */
export function crossover(a, b, rng = Math.random, { attempts = 12 } = {}) {
  for (let i = 0; i < attempts; i++) {
    const { root, slots } = prepare(a);
    if (!slots.length) return null;
    const donorSlots = collectSlots(b);
    if (!donorSlots.length) return null;

    const target = pick(rng, slots);
    const donor = clone(pick(rng, donorSlots).node);
    const child = replaceInSlot(root, target, donor);

    if (validate(child).ok && countNodes(child) <= MAX_NODES) {
      return { ast: child, operator: 'crossover' };
    }
  }
  return null;
}
