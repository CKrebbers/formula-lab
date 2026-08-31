// Text → AST. Pratt parser over a whitelisted grammar (§5).
// Rejects anything outside the whitelist with a readable error at the exact column.
// Never eval.

import { VARIABLES, FUNCTIONS, num, variable, neg, bin, call } from './ast.js';

export class ParseError extends Error {
  constructor(message, column) {
    super(`${message} (column ${column})`);
    this.column = column;
  }
}

// --- Tokenizer ------------------------------------------------------------

const OPERATORS = ['==', '+', '-', '*', '/', '^', '<', '>', '(', ')', ','];

function tokenize(source) {
  const tokens = [];
  let pos = 0;
  while (pos < source.length) {
    const ch = source[pos];
    const column = pos + 1;

    if (/\s/.test(ch)) { pos++; continue; }

    if (/[0-9.]/.test(ch)) {
      const match = /^[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?/.exec(source.slice(pos));
      if (!match || match[0] === '.') throw new ParseError(`Invalid number`, column);
      tokens.push({ kind: 'num', value: parseFloat(match[0]), column });
      pos += match[0].length;
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      const match = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(source.slice(pos));
      tokens.push({ kind: 'ident', value: match[0], column });
      pos += match[0].length;
      continue;
    }

    const op = OPERATORS.find((o) => source.startsWith(o, pos));
    if (op) {
      if (ch === '=' && op !== '==') {
        throw new ParseError(`Single '=' is not allowed; use '==' for comparison`, column);
      }
      tokens.push({ kind: 'op', value: op, column });
      pos += op.length;
      continue;
    }
    if (ch === '=') {
      throw new ParseError(`Single '=' is not allowed; use '==' for comparison`, column);
    }
    throw new ParseError(`Unexpected character '${ch}'`, column);
  }
  tokens.push({ kind: 'eof', value: null, column: source.length + 1 });
  return tokens;
}

// --- Pratt parser ---------------------------------------------------------

// Left binding powers. '^' is right-associative (handled via rbp = lbp - 1).
const BINDING = { '==': 2, '<': 3, '>': 3, '+': 4, '-': 4, '*': 5, '/': 5, '^': 7 };
const UNARY_BP = 6; // binds tighter than * /, looser than ^ so -x^2 == -(x^2)

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() { return this.tokens[this.pos]; }
  next() { return this.tokens[this.pos++]; }

  expect(value) {
    const tok = this.next();
    if (tok.kind === 'eof') throw new ParseError(`Expected '${value}' but reached end of formula`, tok.column);
    if (tok.value !== value) throw new ParseError(`Expected '${value}' but found '${tok.value}'`, tok.column);
    return tok;
  }

  parseExpression(minBp = 0) {
    let left = this.parsePrefix();
    for (;;) {
      const tok = this.peek();
      if (tok.kind !== 'op') break;
      const lbp = BINDING[tok.value];
      if (lbp === undefined || lbp <= minBp) break;
      this.next();
      const rbp = tok.value === '^' ? lbp - 1 : lbp;
      const right = this.parseExpression(rbp);
      left = bin(tok.value, left, right);
    }
    return left;
  }

  parsePrefix() {
    const tok = this.next();

    if (tok.kind === 'num') return num(tok.value);

    if (tok.kind === 'op' && tok.value === '-') {
      return neg(this.parseExpression(UNARY_BP));
    }
    if (tok.kind === 'op' && tok.value === '+') {
      return this.parseExpression(UNARY_BP);
    }
    if (tok.kind === 'op' && tok.value === '(') {
      const inner = this.parseExpression(0);
      this.expect(')');
      return inner;
    }

    if (tok.kind === 'ident') {
      if (this.peek().value === '(') {
        return this.parseCall(tok);
      }
      if (VARIABLES.includes(tok.value)) return variable(tok.value);
      if (FUNCTIONS[tok.value]) {
        throw new ParseError(`'${tok.value}' is a function and needs arguments, e.g. ${tok.value}(...)`, tok.column);
      }
      throw new ParseError(
        `Unknown name '${tok.value}'. Available variables: ${VARIABLES.join(', ')}`, tok.column);
    }

    if (tok.kind === 'eof') throw new ParseError('Unexpected end of formula', tok.column);
    throw new ParseError(`Unexpected '${tok.value}'`, tok.column);
  }

  parseCall(nameTok) {
    const arities = FUNCTIONS[nameTok.value];
    if (!arities) {
      throw new ParseError(
        `Unknown function '${nameTok.value}'. Allowed: ${Object.keys(FUNCTIONS).join(', ')}`, nameTok.column);
    }
    this.expect('(');
    const args = [];
    if (this.peek().value !== ')') {
      args.push(this.parseExpression(0));
      while (this.peek().value === ',') {
        this.next();
        args.push(this.parseExpression(0));
      }
    }
    this.expect(')');
    if (!arities.includes(args.length)) {
      throw new ParseError(
        `'${nameTok.value}' expects ${arities.join(' or ')} argument(s), got ${args.length}`, nameTok.column);
    }
    return call(nameTok.value, args);
  }
}

/**
 * Parse a formula string into an AST.
 * Throws ParseError with a 1-based `column` property on invalid input.
 */
export function parse(source) {
  if (typeof source !== 'string' || source.trim() === '') {
    throw new ParseError('Formula is empty', 1);
  }
  const parser = new Parser(tokenize(source));
  const ast = parser.parseExpression(0);
  const trailing = parser.peek();
  if (trailing.kind !== 'eof') {
    throw new ParseError(`Unexpected '${trailing.value}' after end of expression`, trailing.column);
  }
  return ast;
}
