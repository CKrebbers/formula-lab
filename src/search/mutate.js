// Mutation operators (§6). Pure functions (ast, rng, opts) → ast | null,
// operating on raw ASTs (literals substituted back in — see substituteParams).
// null = operator not applicable to this AST; caller picks another.

import { FUNCTIONS, validate } from '../core/ast.js';
import { paramName, inferRange } from '../core/constants.js';
import { prepare, replaceInSlot, collectNums, pick, countNodes, normalize } from './walk.js';
import { randomExpr } from './sample.js';

const MAX_NODES = 100; // growth guard for insert/replace/crossover

/** Standard normal via Box–Muller. */
export function gaussian(rng = Math.random) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/**
 * Params-level tweak (used by the 3×3 sheet): gaussian-perturb every unlocked
 * param. Returns a new params object.
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

function unlockedNums(root, locks) {
  return collectNums(root).filter((s) => !locks[paramName(s.literalIndex)]);
}

// --- §6 operators ---------------------------------------------------------

/** 1. const_tweak — gaussian perturb one constant. */
export function astConstTweak(ast, rng, { sigma = 0.35, locks = {} } = {}) {
  const { root } = prepare(ast);
  const nums = unlockedNums(root, locks);
  if (!nums.length) return null;
  const slot = pick(rng, nums);
  slot.node.value += gaussian(rng) * sigma * Math.max(1, Math.abs(slot.node.value));
  return normalize(root);
}

/** 2. const_reroll — one constant gets a fresh sample in its inferred range. */
export function constReroll(ast, rng, { locks = {} } = {}) {
  const { root } = prepare(ast);
  const nums = unlockedNums(root, locks);
  if (!nums.length) return null;
  const slot = pick(rng, nums);
  const { min, max } = inferRange(slot.node.value);
  slot.node.value = min + rng() * (max - min);
  return normalize(root);
}

const OP_SWAPS = { '+': '*', '*': '+', '-': '/', '/': '-', '<': '>', '>': '<' };

/** 3. op_swap — swap a binary operator (+↔*, -↔/, <↔>). */
export function opSwap(ast, rng) {
  const { root, slots } = prepare(ast);
  const bins = slots.filter((s) => s.node.type === 'bin' && OP_SWAPS[s.node.op]);
  if (!bins.length) return null;
  const slot = pick(rng, bins);
  slot.node.op = OP_SWAPS[slot.node.op];
  return root;
}

/** 4. func_swap — replace a function with another of the same arity. */
export function funcSwap(ast, rng) {
  const { root, slots } = prepare(ast);
  const calls = slots.filter(
    (s) => s.node.type === 'call' && s.node.name !== 'vec2' && s.node.name !== 'vec3'
  );
  if (!calls.length) return null;
  const slot = pick(rng, calls);
  const arity = slot.node.args.length;
  const candidates = Object.entries(FUNCTIONS)
    .filter(([name, arities]) =>
      arities.includes(arity) && name !== slot.node.name && name !== 'vec2' && name !== 'vec3')
    .map(([name]) => name);
  if (!candidates.length) return null;
  slot.node.name = pick(rng, candidates);
  return root;
}

/** 5. node_insert — wrap a random subtree in abs / fract / sin / fold. */
export function nodeInsert(ast, rng) {
  if (countNodes(ast) >= MAX_NODES) return null;
  const { root, slots } = prepare(ast);
  if (!slots.length) return null;
  const slot = pick(rng, slots);
  const wrappers = [
    (x) => ({ type: 'call', name: 'abs', args: [x] }),
    (x) => ({ type: 'call', name: 'fract', args: [x] }),
    (x) => ({ type: 'call', name: 'sin', args: [x] }),
    (x) => ({ type: 'call', name: 'fold', args: [x] }), // real since the iteration update
  ];
  return replaceInSlot(root, slot, pick(rng, wrappers)(slot.node));
}

/** 6. node_delete — replace a subtree with one of its children. */
export function nodeDelete(ast, rng) {
  const { root, slots } = prepare(ast);
  const parents = slots.filter((s) =>
    s.node.type === 'bin' || s.node.type === 'neg' ||
    (s.node.type === 'call' && s.node.args.length > 0 &&
      s.node.name !== 'vec2' && s.node.name !== 'vec3'));
  if (!parents.length) return null;
  const slot = pick(rng, parents);
  const n = slot.node;
  const child =
    n.type === 'bin' ? (rng() < 0.5 ? n.left : n.right) :
    n.type === 'neg' ? n.arg :
    pick(rng, n.args);
  return replaceInSlot(root, slot, child);
}

/** 7. subtree_replace — replace a subtree with a random small expression. */
export function subtreeReplace(ast, rng) {
  if (countNodes(ast) >= MAX_NODES) return null;
  const { root, slots } = prepare(ast);
  if (!slots.length) return null;
  const slot = pick(rng, slots);
  return replaceInSlot(root, slot, randomExpr(rng, 2));
}

const SWAP_VARS = ['x', 'y', 't', 'r', 'th'];

/** 8. var_swap — swap one variable for another (x↔y, x↔t, x↔r, …). */
export function varSwap(ast, rng) {
  const { root, slots } = prepare(ast);
  const vars = slots.filter((s) => s.node.type === 'var');
  if (!vars.length) return null;
  const slot = pick(rng, vars);
  const others = SWAP_VARS.filter((v) => v !== slot.node.name);
  slot.node.name = pick(rng, others);
  return root;
}

/** 9. coords_flip — cycle cartesian → polar → toroidal (not an AST op). */
export function coordsFlip(coordsIndex) {
  return (coordsIndex + 1) % 3;
}

// --- registry -------------------------------------------------------------

export const OPERATORS = [
  { name: 'const_tweak', mask: 'constants', fn: astConstTweak },
  { name: 'const_reroll', mask: 'constants', fn: constReroll },
  { name: 'op_swap', mask: 'structure', fn: opSwap },
  { name: 'func_swap', mask: 'structure', fn: funcSwap },
  { name: 'node_insert', mask: 'structure', fn: nodeInsert },
  { name: 'node_delete', mask: 'structure', fn: nodeDelete },
  { name: 'subtree_replace', mask: 'structure', fn: subtreeReplace },
  { name: 'var_swap', mask: 'structure', fn: varSwap },
];

export function operatorsForMask(mask = 'all') {
  return mask === 'all' ? OPERATORS : OPERATORS.filter((o) => o.mask === mask);
}

/**
 * Apply one random operator under a mask. Retries with other operators until
 * one produces a valid AST. Returns { ast, operator } or null.
 */
export function mutateOnce(ast, rng = Math.random, { mask = 'all', locks = {}, attempts = 12 } = {}) {
  const ops = operatorsForMask(mask);
  if (!ops.length) return null;
  for (let i = 0; i < attempts; i++) {
    const op = pick(rng, ops);
    const child = op.fn(ast, rng, { locks });
    if (child && validate(child).ok && countNodes(child) <= MAX_NODES) {
      return { ast: child, operator: op.name };
    }
  }
  return null;
}
