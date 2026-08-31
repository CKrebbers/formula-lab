// Extract numeric literals from an AST into named params (a, b, c…) so the UI
// can generate sliders and the renderer can drive them as uniforms — no
// shader recompile on slider moves.

import { clone } from './ast.js';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/** Param name for the nth extracted literal: a…z, then p26, p27… */
export function paramName(index) {
  return index < LETTERS.length ? LETTERS[index] : `p${index}`;
}

/**
 * Replace every 'num' node with a 'param' node, in order of appearance
 * (depth-first, left-to-right — matches source order).
 * Returns { ast, params } and leaves the input AST untouched.
 */
export function extractParams(ast) {
  const params = {};
  let count = 0;

  function transform(node) {
    switch (node.type) {
      case 'num': {
        const name = paramName(count++);
        params[name] = node.value;
        return { type: 'param', name };
      }
      case 'neg':
        node.arg = transform(node.arg);
        return node;
      case 'bin':
        node.left = transform(node.left);
        node.right = transform(node.right);
        return node;
      case 'call':
        node.args = node.args.map(transform);
        return node;
      default:
        return node;
    }
  }

  return { ast: transform(clone(ast)), params };
}

/**
 * Slider range for a constant, centered on its current value.
 * Wide enough to explore, tight enough to stay controllable.
 */
export function inferRange(value) {
  const span = Math.max(1, Math.abs(value)) * 2.5;
  const min = value - span;
  const max = value + span;
  return { min, max, step: (max - min) / 400 };
}

/** Fresh uniform sample inside a param's inferred range (for reroll). */
export function reroll(value, rng = Math.random) {
  const { min, max } = inferRange(value);
  return min + rng() * (max - min);
}
