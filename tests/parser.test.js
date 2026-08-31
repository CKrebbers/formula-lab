import { describe, it, expect } from 'vitest';
import { parse, ParseError } from '../src/core/parser.js';
import { validate, serialize, deserialize, clone } from '../src/core/ast.js';

describe('parser: valid formulas', () => {
  it('parses a number', () => {
    expect(parse('42')).toEqual({ type: 'num', value: 42 });
  });

  it('parses variables', () => {
    expect(parse('x')).toEqual({ type: 'var', name: 'x' });
    expect(parse('th')).toEqual({ type: 'var', name: 'th' });
  });

  it('parses the pixel-step variables dx and dy', () => {
    expect(parse('dx')).toEqual({ type: 'var', name: 'dx' });
    expect(parse('dy')).toEqual({ type: 'var', name: 'dy' });
    const ast = parse('prev(x + dx, y) - prev(x - dx, y)');
    expect(validate(ast).ok).toBe(true);
    expect(ast.left.args[0].right).toEqual({ type: 'var', name: 'dx' });
  });

  it('parses binary operators with precedence', () => {
    // 1 + 2 * 3 → 1 + (2 * 3)
    const ast = parse('1 + 2 * 3');
    expect(ast.op).toBe('+');
    expect(ast.right.op).toBe('*');
  });

  it('makes ^ bind tighter than * and right-associative', () => {
    const ast = parse('2 * x ^ 2');
    expect(ast.op).toBe('*');
    expect(ast.right.op).toBe('^');

    // 2 ^ 3 ^ 2 → 2 ^ (3 ^ 2)
    const rightAssoc = parse('2 ^ 3 ^ 2');
    expect(rightAssoc.left).toEqual({ type: 'num', value: 2 });
    expect(rightAssoc.right.op).toBe('^');
  });

  it('binds unary minus looser than ^ (-x^2 == -(x^2))', () => {
    const ast = parse('-x^2');
    expect(ast.type).toBe('neg');
    expect(ast.arg.op).toBe('^');
  });

  it('parses parentheses', () => {
    const ast = parse('(1 + 2) * 3');
    expect(ast.op).toBe('*');
    expect(ast.left.op).toBe('+');
  });

  it('parses function calls with the right arity', () => {
    const ast = parse('clamp(x, 0, 1)');
    expect(ast).toEqual({
      type: 'call',
      name: 'clamp',
      args: [
        { type: 'var', name: 'x' },
        { type: 'num', value: 0 },
        { type: 'num', value: 1 },
      ],
    });
  });

  it('parses comparisons', () => {
    const ast = parse('x < y == 1');
    expect(ast.op).toBe('==');
    expect(ast.left.op).toBe('<');
  });

  it('parses the brief example formula', () => {
    const ast = parse('sin(x*y + t) + cos(1.7*x)');
    expect(validate(ast).ok).toBe(true);
  });

  it('parses prev(x, y) — the previous-frame sampler', () => {
    const ast = parse('mix(sin(x * y + t), prev(x, y), 0.85)');
    expect(validate(ast).ok).toBe(true);
    expect(ast.args[1]).toEqual({
      type: 'call',
      name: 'prev',
      args: [{ type: 'var', name: 'x' }, { type: 'var', name: 'y' }],
    });
  });

  it('parses the bitwise helpers', () => {
    const ast = parse('band(i * bor(shr(i, 8.0), shr(i, 9.0)), 46.0)');
    expect(validate(ast).ok).toBe(true);
    expect(ast.name).toBe('band');
    expect(parse('bxor(i, 255.0)').name).toBe('bxor');
    expect(parse('bnot(i)').args).toHaveLength(1);
    expect(parse('shl(i, 3.0)').name).toBe('shl');
  });

  it('parses length with 1 or 2 args', () => {
    expect(parse('length(x)').args).toHaveLength(1);
    expect(parse('length(x, y)').args).toHaveLength(2);
  });

  it('parses vec3 output mode', () => {
    const ast = parse('vec3(fract(x), fract(y), fract(t))');
    expect(ast.name).toBe('vec3');
    expect(validate(ast).ok).toBe(true);
  });

  it('parses scientific notation', () => {
    expect(parse('1.5e-3')).toEqual({ type: 'num', value: 0.0015 });
  });
});

describe('parser: invalid formulas report exact columns', () => {
  function errorAt(source) {
    try {
      parse(source);
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      return e;
    }
    throw new Error(`Expected '${source}' to fail`);
  }

  it('rejects unknown variables', () => {
    const e = errorAt('x + foo');
    expect(e.message).toContain("Unknown name 'foo'");
    expect(e.column).toBe(5);
  });

  it('rejects unknown functions', () => {
    const e = errorAt('sin(x) + eval(y)');
    expect(e.message).toContain("Unknown function 'eval'");
    expect(e.column).toBe(10);
  });

  it('rejects wrong arity', () => {
    const e = errorAt('clamp(x, 0)');
    expect(e.message).toContain("expects 3 argument(s), got 2");
    expect(e.column).toBe(1);
  });

  it('rejects prev with the wrong arity, at its column', () => {
    const e = errorAt('sin(x) + prev(x)');
    expect(e.message).toContain("'prev' expects 2 argument(s), got 1");
    expect(e.column).toBe(10);
    expect(errorAt('prev(x, y, t)').message).toContain('got 3');
  });

  it('rejects bitwise helpers with the wrong arity, at their column', () => {
    const e = errorAt('sin(x) + band(i)');
    expect(e.message).toContain("'band' expects 2 argument(s), got 1");
    expect(e.column).toBe(10);
    expect(errorAt('bnot(x, y)').message).toContain("'bnot' expects 1 argument(s), got 2");
    expect(errorAt('shr(i)').message).toContain('got 1');
  });

  it('rejects unbalanced parens', () => {
    const e = errorAt('sin(x');
    expect(e.message).toContain("Expected ')'");
  });

  it('rejects trailing garbage', () => {
    const e = errorAt('x + y )');
    expect(e.column).toBe(7);
  });

  it('rejects single =', () => {
    const e = errorAt('x = y');
    expect(e.message).toContain("use '=='");
    expect(e.column).toBe(3);
  });

  it('rejects unexpected characters', () => {
    const e = errorAt('x + y; alert(1)');
    expect(e.message).toContain("Unexpected character ';'");
    expect(e.column).toBe(6);
  });

  it('rejects a bare function name', () => {
    const e = errorAt('sin + 1');
    expect(e.message).toContain('needs arguments');
  });

  it('rejects empty input', () => {
    const e = errorAt('   ');
    expect(e.message).toContain('empty');
  });
});

describe('ast: serialize / clone', () => {
  it('round-trips through serialize/deserialize', () => {
    const ast = parse('sin(x*y + t) + fbm(x, y, 4)');
    expect(deserialize(serialize(ast))).toEqual(ast);
  });

  it('clone is deep', () => {
    const ast = parse('x + 1');
    const copy = clone(ast);
    copy.right.value = 99;
    expect(ast.right.value).toBe(1);
  });

  it('deserialize rejects invalid ASTs', () => {
    expect(() => deserialize('{"type":"call","name":"eval","args":[]}')).toThrow(/Unknown function/);
  });
});
