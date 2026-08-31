// AST → formula text, precedence-aware (minimal parentheses).
// Inverse of parser.js: parse(print(ast)) must be structurally equal.

const BP = { '==': 2, '<': 3, '>': 3, '+': 4, '-': 4, '*': 5, '/': 5, '^': 7 };
const RIGHT_ASSOC = new Set(['^']);
const NEG_BP = 6;
const ATOM_BP = 100;

export function print(node) {
  return p(node, 0);
}

function bpOf(node) {
  if (node.type === 'bin') return BP[node.op];
  if (node.type === 'neg') return NEG_BP;
  return ATOM_BP;
}

function p(node, minBp) {
  const wrap = (s) => (bpOf(node) < minBp ? `(${s})` : s);
  switch (node.type) {
    case 'num':
      return formatNum(node.value);
    case 'var':
      return node.name;
    case 'param':
      throw new Error(`Cannot print param node '${node.name}' — substitute values first`);
    case 'neg':
      return wrap(`-${p(node.arg, NEG_BP)}`);
    case 'bin': {
      const bp = BP[node.op];
      const right = RIGHT_ASSOC.has(node.op);
      const l = p(node.left, right ? bp + 1 : bp);
      const r = p(node.right, right ? bp : bp + 1);
      return wrap(`${l} ${node.op} ${r}`);
    }
    case 'call':
      return `${node.name}(${node.args.map((a) => p(a, 0)).join(', ')})`;
    default:
      throw new Error(`Unknown node type '${node.type}'`);
  }
}

/**
 * Trim float noise (1.7000000000000002 → 1.7) while keeping 9 significant
 * digits, enough for every hand-typed constant; parser accepts bare ints
 * and e-notation.
 */
function formatNum(value) {
  if (value < 0) {
    // negative literals don't exist in the grammar — the caller should have
    // normalized to neg(num); printing '-x' here would still re-parse, but
    // param extraction would silently flip sign semantics. Fail loudly.
    throw new Error(`Cannot print negative literal ${value} — normalize to neg(num) first`);
  }
  return String(Number(value.toPrecision(9)));
}
