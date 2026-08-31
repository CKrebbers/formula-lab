import { describe, it, expect } from 'vitest';
import { parse } from '../src/core/parser.js';
import { print } from '../src/core/print.js';
import { extractParams, substituteParams } from '../src/core/constants.js';
import { FAMILIES } from '../src/families/index.js';

const ROUND_TRIP_CASES = [
  '1 + 2 * 3',
  '(1 + 2) * 3',
  '2 ^ 3 ^ 2',
  '(2 ^ 3) ^ 2',
  '-x ^ 2',
  '(-x) ^ 2',
  'x - -3',
  '-(x + y)',
  'x - (y - t)',
  'x / (y / t)',
  'sin(x * y + t) + cos(1.7 * x)',
  'x < y == 1',
  'vec3(fract(x), fract(y), 0.5)',
  'mix(abs(fract(x * 4) + fract(y * 4) - 1), abs(fract(x * 4) - fract(y * 4)), step(0.5, hash(floor(x * 4), floor(y * 4))))',
];

describe('print: round-trips through the parser', () => {
  for (const src of ROUND_TRIP_CASES) {
    it(src, () => {
      const ast = parse(src);
      expect(parse(print(ast))).toEqual(ast);
    });
  }

  it('round-trips every family source', () => {
    for (const family of FAMILIES) {
      const ast = parse(family.source);
      expect(parse(print(ast)), family.id).toEqual(ast);
    }
  });

  it('trims float noise', () => {
    expect(print({ type: 'num', value: 1.7000000000000002 })).toBe('1.7');
  });

  it('refuses param nodes and negative literals', () => {
    expect(() => print({ type: 'param', name: 'a' })).toThrow(/substitute/);
    expect(() => print({ type: 'num', value: -2 })).toThrow(/normalize/);
  });
});

describe('substituteParams', () => {
  it('puts current values back as literals', () => {
    const { ast } = extractParams(parse('sin(1.7 * x)'));
    const raw = substituteParams(ast, { a: 2.5 });
    expect(print(raw)).toBe('sin(2.5 * x)');
  });

  it('wraps negative values in neg (grammar has no negative literals)', () => {
    const { ast } = extractParams(parse('x + 1.0'));
    const raw = substituteParams(ast, { a: -3.25 });
    expect(print(raw)).toBe('x + -3.25');
    expect(parse(print(raw))).toEqual(raw);
  });
});
