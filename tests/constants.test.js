import { describe, it, expect } from 'vitest';
import { parse } from '../src/core/parser.js';
import { extractParams, paramName, inferRange, reroll } from '../src/core/constants.js';
import { transpile, collectParams } from '../src/core/glsl.js';
import { validate } from '../src/core/ast.js';

describe('constants: extraction', () => {
  it('names params a, b, c… in order of appearance', () => {
    const { params } = extractParams(parse('sin(1.7 * x) + cos(x * -1.3) * 0.5'));
    expect(Object.keys(params)).toEqual(['a', 'b', 'c']);
    expect(params.a).toBe(1.7);
    expect(params.b).toBe(1.3); // unary minus stays in the AST; literal is positive
    expect(params.c).toBe(0.5);
  });

  it('replaces num nodes with param nodes', () => {
    const { ast } = extractParams(parse('x + 2.0'));
    expect(ast.right).toEqual({ type: 'param', name: 'a' });
    expect(validate(ast).ok).toBe(true);
  });

  it('does not mutate the input AST', () => {
    const original = parse('x + 2.0');
    extractParams(original);
    expect(original.right).toEqual({ type: 'num', value: 2 });
  });

  it('extracts nothing from a constant-free formula', () => {
    const { params } = extractParams(parse('sin(x * y + t)'));
    expect(params).toEqual({});
  });

  it('names beyond z as p26, p27…', () => {
    expect(paramName(0)).toBe('a');
    expect(paramName(25)).toBe('z');
    expect(paramName(26)).toBe('p26');
  });
});

describe('constants: transpile with params', () => {
  it('emits params as u_<name> uniforms', () => {
    const { ast } = extractParams(parse('sin(1.7 * x + t)'));
    const { fragmentSource, expression, paramNames } = transpile(ast);
    expect(paramNames).toEqual(['a']);
    expect(expression).toBe('sin(((u_a * x) + t))');
    expect(fragmentSource).toContain('uniform float u_a;');
  });

  it('collectParams walks in order of appearance', () => {
    const { ast } = extractParams(parse('fbm(x * 2.0, y * 3.0, 4.0)'));
    expect(collectParams(ast)).toEqual(['a', 'b', 'c']);
  });
});

describe('constants: ranges and reroll', () => {
  it('inferRange contains the value and is ordered', () => {
    for (const v of [0, 1.7, -1.3, 42, -100]) {
      const { min, max, step } = inferRange(v);
      expect(min).toBeLessThan(max);
      expect(v).toBeGreaterThanOrEqual(min);
      expect(v).toBeLessThanOrEqual(max);
      expect(step).toBeGreaterThan(0);
    }
  });

  it('reroll stays inside the inferred range', () => {
    const { min, max } = inferRange(1.7);
    for (let i = 0; i < 50; i++) {
      const v = reroll(1.7);
      expect(v).toBeGreaterThanOrEqual(min);
      expect(v).toBeLessThanOrEqual(max);
    }
  });

  it('reroll is deterministic with an injected rng', () => {
    expect(reroll(1.7, () => 0.5)).toBeCloseTo(1.7, 10);
  });
});
