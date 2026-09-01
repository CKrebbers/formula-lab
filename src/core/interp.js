// Reference AST evaluator — the third leg of the parity harness (ADR 001).
// A plain tree walk, no code generation: emitJS() is proven against THIS,
// and the GLSL renders are proven against this in the browser suite.
// Slow on purpose; never used in the render or audio path.

import { validate, SELF_VARS } from './ast.js';
import { FL } from './jsruntime.js';

export class InterpError extends Error {}

/**
 * Evaluate an AST at one point.
 * env: { x, y, t, r, th, mx, my, i, dx, dy, params }
 * Returns a number (scalar) or an array (top-level vec2/vec3).
 */
export function evaluate(ast, env) {
  const check = validate(ast);
  if (!check.ok) throw new InterpError(check.error);
  return evalNode(ast, env, true);
}

function evalNode(node, env, isTopLevel = false) {
  switch (node.type) {
    case 'num':
      return node.value;
    case 'var':
      return env[node.name] ?? SELF_VARS[node.name] ?? 0;
    case 'param':
      return env.params?.[node.name] ?? 0;
    case 'neg':
      return -evalNode(node.arg, env);
    case 'bin': {
      const l = evalNode(node.left, env);
      const r = evalNode(node.right, env);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return l / r;
        case '^': return Math.pow(l, r);
        case '<': return l < r ? 1 : 0;
        case '>': return l > r ? 1 : 0;
        case '==': return l === r ? 1 : 0;
        default: throw new InterpError(`Unknown operator '${node.op}'`);
      }
    }
    case 'call': {
      const args = node.args.map((a) => evalNode(a, env));
      if (node.name === 'vec2' || node.name === 'vec3') {
        if (!isTopLevel) throw new InterpError(`${node.name}() only at top level`);
        return args;
      }
      if (node.name === 'length') {
        return args.length === 1 ? FL.length1(args[0]) : FL.length2(args[0], args[1]);
      }
      const fn = FL[node.name];
      if (!fn) throw new InterpError(`Unknown function '${node.name}'`);
      return fn(...args);
    }
    default:
      throw new InterpError(`Unknown node type '${node.type}'`);
  }
}
