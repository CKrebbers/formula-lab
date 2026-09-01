// Parity: emitJS() against the reference AST interpreter (ADR 001).
// Same AST, two evaluation paths, tolerance 1e-6 — this is the proof that the
// codegen does the same math as the tree, across the whole whitelist.

import { describe, it, expect } from 'vitest';
import { parse } from '../src/core/parser.js';
import { extractParams } from '../src/core/constants.js';
import { emitJS, compileFormula, isParametric } from '../src/core/js.js';
import { evaluate } from '../src/core/interp.js';
import { FL } from '../src/core/jsruntime.js';
import { FAMILIES } from '../src/families/index.js';
import { STARTERS } from '../src/families/starters.js';

// ≥ 20 formulas, covering every whitelisted function and operator
export const CORPUS = [
  'sin(x * y * 4.0 + t) + cos(3.0 * x + t * 0.7)',
  'tan(x * 0.4) + atan(y * 2.0) + atan2(y, x)',
  'abs(x) - floor(y * 3.0) + fract(t * 2.0)',
  'mod(x * 5.0, 2.0) - pow(abs(y) + 0.1, 2.5)',
  'sqrt(abs(x * y)) + exp(0.0 - r * 2.0) + log(abs(x) + 1.5)',
  'min(x, y) * max(x, y) + clamp(t, 0.0, 1.0)',
  'mix(x, y, 0.3) + step(0.2, x) - smoothstep(0.0, 1.0, y)',
  'length(x) + length(x, y) + sign(x - y)',
  'noise(x * 3.0, y * 3.0) * 2.0 - 1.0',
  'fbm(x * 2.0, y * 2.0, 4.0) * 2.0 - 1.0',
  'worley(x * 4.0, y * 4.0) - hash(x, y)',
  'julia(x, y, 0.355, 0.355, 24.0) * 2.0 - 1.0',
  'ship(x * 1.2, y * 1.2, 0.0 - 0.6, 0.0 - 0.4, 16.0)',
  'kali(x, y, 0.55, 0.4, 12.0) * 2.0 - 1.0',
  'orbit(x, y, 0.3, 0.5, 20.0)',
  'fold(x * 3.0 + t) - fold(y * 2.0)',
  'band(i, 255.0) * 0.01 + bor(x * 100.0, y * 100.0) * 0.001',
  'bxor(i, shl(2.0, 3.0)) * 0.001 + shr(i, 2.0) * 0.0001 + bnot(x * 10.0) * 0.01',
  '(x < y) + (x > 0.5) * 2.0 + (x == x) * 0.5',
  '-x ^ 2.0 + 3.0 / (y + 2.0) - th * r + mx * my',
  'sin(440.0 * 6.283 * t) * 0.5',
  'vec2(sin(440.0 * 6.283 * t), sin(662.0 * 6.283 * t))',
  'vec2(fbm(x, y, 3.0), worley(x, y))',
  'vec3(abs(sin(x + t)), abs(cos(y)), fract(x * y))',
  'dx * 100.0 + dy * 100.0 + i * 0.0001',
];

function envAt(k) {
  // deterministic spread of evaluation points, incl. negatives and zero
  const f = (n) => Math.sin(k * 12.9898 + n * 78.233) * 0.9;
  return {
    x: f(1), y: f(2), t: k * 0.37, r: Math.abs(f(3)) * 1.4, th: f(4) * Math.PI,
    mx: f(5), my: f(6), i: k * 137, dx: 0.002, dy: 0.002,
    params: {},
  };
}

describe('emitJS ↔ reference interpreter parity', () => {
  for (const source of CORPUS) {
    it(source, () => {
      const ast = parse(source);
      const { fn, mode } = compileFormula(ast);
      for (let k = 0; k < 25; k++) {
        const env = envAt(k);
        const ref = evaluate(ast, env);
        const out = fn(FL, env, [0, 0, 0]);
        const refArr = Array.isArray(ref) ? ref : [ref];
        const outArr = Array.isArray(out) ? out : [out];
        // out is the reusable 3-slot scratch; the mode says how many are live
        expect(refArr.length).toBe(mode === 'vec2' ? 2 : mode === 'vec3' ? 3 : 1);
        for (let c = 0; c < refArr.length; c++) {
          if (!Number.isFinite(refArr[c])) {
            expect(Number.isFinite(outArr[c])).toBe(false);
          } else {
            expect(Math.abs(outArr[c] - refArr[c])).toBeLessThanOrEqual(
              1e-6 * Math.max(1, Math.abs(refArr[c]))
            );
          }
        }
      }
      expect(mode).toBe(source.startsWith('vec2') ? 'vec2' : source.startsWith('vec3') ? 'vec3' : 'scalar');
    });
  }

  it('params flow through both paths identically', () => {
    const { ast } = extractParams(parse('sin(x * 4.0 + t) * 0.5 + 2.0'));
    const { fn } = compileFormula(ast);
    const env = { ...envAt(3), params: { a: 7.7, b: 0.31, c: -1.5 } };
    expect(fn(FL, env, [0, 0, 0])).toBeCloseTo(evaluate(ast, env), 9);
  });

  it('every family and starter compiles and matches the reference', () => {
    for (const { source } of [...FAMILIES, ...STARTERS]) {
      const { ast } = extractParams(parse(source));
      const { fn } = compileFormula(ast);
      const params = extractParams(parse(source)).params;
      for (let k = 0; k < 5; k++) {
        const env = { ...envAt(k), params };
        const ref = evaluate(ast, env);
        const out = fn(FL, env, [0, 0, 0]);
        const refArr = Array.isArray(ref) ? ref : [ref];
        const outArr = Array.isArray(out) ? out : [out];
        for (let c = 0; c < refArr.length; c++) {
          if (Number.isFinite(refArr[c])) {
            expect(Math.abs(outArr[c] - refArr[c])).toBeLessThanOrEqual(
              1e-6 * Math.max(1, Math.abs(refArr[c])));
          }
        }
      }
    }
  });
});

describe('isParametric', () => {
  it('pure f(t) is parametric, spatial vars and prev() are not', () => {
    expect(isParametric(parse('sin(440.0 * t) + fract(t * 220.0)'))).toBe(true);
    expect(isParametric(parse('vec2(sin(t), cos(t * 1.5))'))).toBe(true);
    expect(isParametric(parse('band(i, 255.0) * 0.01'))).toBe(true); // bytebeat: i is a clock
    expect(isParametric(parse('sin(x + t)'))).toBe(false);
    expect(isParametric(parse('worley(r, th)'))).toBe(false);
    expect(isParametric(parse('prev(0.0, 0.0) + sin(t)'))).toBe(false);
    expect(isParametric(parse('sin(t) + dx'))).toBe(false);
  });
});

describe('emitJS output shape', () => {
  it('rejects nested vec2 like the GLSL emitter', () => {
    const nested = {
      type: 'call', name: 'abs',
      args: [{ type: 'call', name: 'vec2', args: [{ type: 'num', value: 1 }, { type: 'num', value: 2 }] }],
    };
    expect(() => emitJS(nested)).toThrow();
  });
});
