// AST node types, validation, clone, serialize.
// No DOM dependency — must run in Node (tests) and browser alike.

/**
 * Node shapes (plain JSON-serializable objects):
 *   { type: 'num',  value: number }
 *   { type: 'var',  name: string }                     // x, y, t, r, th, mx, my, i, dx, dy
 *   { type: 'param', name: string }                    // extracted constant (a, b, c…), driven as uniform
 *   { type: 'neg',  arg: node }                        // unary minus
 *   { type: 'bin',  op: string, left: node, right: node }
 *   { type: 'call', name: string, args: node[] }
 */

// dx/dy are the size of one screen pixel in the pre-remap uv space that x/y
// are built from — the step you need for neighbour sampling and derivatives.
// mot is the camera's motion amount (0..1), 0 while no camera runs (ADR #41).
export const VARIABLES = ['x', 'y', 't', 'r', 'th', 'mx', 'my', 'i', 'dx', 'dy', 'mot'];

export const BINARY_OPS = ['+', '-', '*', '/', '^', '<', '>', '=='];

/**
 * Whitelisted functions with accepted arities.
 * vec2/vec3 are output constructors — only valid at the top level (v1),
 * enforced by the transpiler, not here.
 */
export const FUNCTIONS = {
  sin: [1], cos: [1], tan: [1], atan: [1], atan2: [2],
  abs: [1], floor: [1], fract: [1], mod: [2], pow: [2],
  sqrt: [1], exp: [1], log: [1],
  min: [2], max: [2], clamp: [3], mix: [3],
  step: [2], smoothstep: [3],
  length: [1, 2], sign: [1],
  // noise helpers (implemented in GLSL)
  noise: [2], fbm: [3], worley: [2], hash: [2],
  // iterated maps (GLSL helpers, capped loops; n = iterations like fbm octaves)
  julia: [5], ship: [5], kali: [5], orbit: [5],
  // previous frame (feedback buffer) — luminance at formula coords
  prev: [2],
  // camera luminance at formula coords, mirrored, -1..1; 0 while no camera runs
  cam: [2],
  // bitwise on integers (floats in, floats out) — bytebeat / pixel logic.
  // '^' stays pow(), so xor is spelled bxor.
  band: [2], bor: [2], bxor: [2], shl: [2], shr: [2], bnot: [1],
  // fold(v) = abs(mod(v,2)-1) — was reserved in §5, now real
  fold: [1],
  // output constructors
  vec2: [2], vec3: [3],
};

export function num(value) { return { type: 'num', value }; }
export function param(name) { return { type: 'param', name }; }
export function variable(name) { return { type: 'var', name }; }
export function neg(arg) { return { type: 'neg', arg }; }
export function bin(op, left, right) { return { type: 'bin', op, left, right }; }
export function call(name, args) { return { type: 'call', name, args }; }

/**
 * Validate an AST. Returns { ok: true } or { ok: false, error: string }.
 * Used after deserialization and after mutation, before transpiling.
 */
export function validate(node) {
  try {
    walk(node);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function walk(node) {
  if (!node || typeof node !== 'object') throw new Error('Invalid node: not an object');
  switch (node.type) {
    case 'num':
      if (typeof node.value !== 'number' || !Number.isFinite(node.value)) {
        throw new Error('Invalid num node: value must be a finite number');
      }
      return;
    case 'var':
      if (!VARIABLES.includes(node.name)) {
        throw new Error(`Unknown variable '${node.name}'`);
      }
      return;
    case 'param':
      if (typeof node.name !== 'string' || !/^[a-z][0-9]*$|^p[0-9]+$/.test(node.name)) {
        throw new Error(`Invalid param name '${node.name}'`);
      }
      return;
    case 'neg':
      walk(node.arg);
      return;
    case 'bin':
      if (!BINARY_OPS.includes(node.op)) {
        throw new Error(`Unknown operator '${node.op}'`);
      }
      walk(node.left);
      walk(node.right);
      return;
    case 'call': {
      const arities = FUNCTIONS[node.name];
      if (!arities) throw new Error(`Unknown function '${node.name}'`);
      if (!Array.isArray(node.args) || !arities.includes(node.args.length)) {
        throw new Error(
          `Function '${node.name}' expects ${arities.join(' or ')} argument(s), got ${node.args?.length ?? 0}`
        );
      }
      node.args.forEach(walk);
      return;
    }
    default:
      throw new Error(`Unknown node type '${node.type}'`);
  }
}

/** Deep clone (AST is plain JSON). */
export function clone(node) {
  return JSON.parse(JSON.stringify(node));
}

/** Serialize to a JSON string (stable, for snapshots). */
export function serialize(node) {
  return JSON.stringify(node);
}

/** Deserialize and validate. Throws on invalid input. */
export function deserialize(json) {
  const node = JSON.parse(json);
  const result = validate(node);
  if (!result.ok) throw new Error(result.error);
  return node;
}
