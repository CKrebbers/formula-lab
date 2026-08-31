// Shared AST-walking helpers for mutation operators. Pure, injectable RNG.

import { clone } from '../core/ast.js';

/**
 * Collect every node with a handle to its parent slot, so operators can pick
 * one at random and replace it in place. Root is included with parent null —
 * unless the root is a vec2/vec3 constructor (v1 top-level rule): then only
 * its descendants are eligible, so mutation can't break the output mode.
 */
export function collectSlots(root) {
  const slots = [];
  const rootIsVec = root.type === 'call' && (root.name === 'vec2' || root.name === 'vec3');
  if (!rootIsVec) slots.push({ node: root, parent: null, key: null, index: null });

  // strict depth-first, left-to-right — the same order extractParams names
  // params in, so slot order stays aligned with param naming (a, b, c…)
  function walk(node) {
    switch (node.type) {
      case 'neg':
        slots.push({ node: node.arg, parent: node, key: 'arg', index: null });
        walk(node.arg);
        break;
      case 'bin':
        slots.push({ node: node.left, parent: node, key: 'left', index: null });
        walk(node.left);
        slots.push({ node: node.right, parent: node, key: 'right', index: null });
        walk(node.right);
        break;
      case 'call':
        node.args.forEach((arg, i) => {
          slots.push({ node: arg, parent: node, key: 'args', index: i });
          walk(arg);
        });
        break;
    }
  }
  walk(root);
  return slots;
}

/**
 * All num-node slots in depth-first order, tagged with their literal index —
 * index i corresponds to param name paramName(i) for lock checks.
 */
export function collectNums(root) {
  return collectSlots(root)
    .filter((s) => s.node.type === 'num')
    .map((slot, i) => ({ ...slot, literalIndex: i }));
}

/** Replace the node in a slot. Returns the (possibly new) root. */
export function replaceInSlot(root, slot, newNode) {
  if (!slot.parent) return newNode;
  if (slot.key === 'args') slot.parent.args[slot.index] = newNode;
  else slot.parent[slot.key] = newNode;
  return root;
}

export function countNodes(node) {
  switch (node.type) {
    case 'neg': return 1 + countNodes(node.arg);
    case 'bin': return 1 + countNodes(node.left) + countNodes(node.right);
    case 'call': return 1 + node.args.reduce((sum, a) => sum + countNodes(a), 0);
    default: return 1;
  }
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/** Deep-clone the AST and hand back { root, slots } ready for mutation. */
export function prepare(ast) {
  const root = clone(ast);
  return { root, slots: collectSlots(root) };
}

/**
 * Normalize after value mutations: num < 0 → neg(num), neg(neg(x)) → x.
 * Keeps the AST printable (the grammar has no negative literals).
 */
export function normalize(node) {
  switch (node.type) {
    case 'num':
      return node.value < 0
        ? { type: 'neg', arg: { type: 'num', value: -node.value } }
        : node;
    case 'neg': {
      const arg = normalize(node.arg);
      return arg.type === 'neg' ? arg.arg : { type: 'neg', arg };
    }
    case 'bin':
      return { ...node, left: normalize(node.left), right: normalize(node.right) };
    case 'call':
      return { ...node, args: node.args.map(normalize) };
    default:
      return node;
  }
}
