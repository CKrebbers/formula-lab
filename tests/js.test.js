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
import { CORPUS, envAt } from './fixtures/av-corpus.js';

export { CORPUS };

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

describe('audio-silent terms (ADR #38, narrowed by ADR #43)', () => {
  const silentOf = (src) => compileFormula(parse(src)).silent;

  it('names the terms that are 0 in the audio backend: cam() only', () => {
    expect(silentOf('cam(x, y) * (0.5 + mot)')).toEqual(['cam()']); // mot is heard, cam is not
    expect(silentOf('cam(x, y) + prev(x, y)')).toEqual(['cam()']);
  });

  it('prev(), dx and dy are heard since the synth core has a feedback grid (ADR #43)', () => {
    expect(silentOf('prev(x, y) * 0.97 + sin(t)')).toEqual([]);
    expect(silentOf('prev(x + dx, y) - prev(x - dx, y)')).toEqual([]);
    expect(silentOf('sin(x + dx) + cos(y + dy)')).toEqual([]);
  });

  it('reports whether a formula feeds back, so the core knows to write', () => {
    const feedbackOf = (src) => compileFormula(parse(src)).feedback;
    expect(feedbackOf('prev(x, y) * 0.97 + sin(t)')).toBe(true);
    expect(feedbackOf('sin(x + dx)')).toBe(false);
    expect(feedbackOf('sin(440.0 * 6.283 * t)')).toBe(false);
  });

  it('says nothing about a formula that is fully audible', () => {
    expect(silentOf('sin(440.0 * 6.283 * t)')).toEqual([]);
    expect(silentOf('worley(x * 4.0, y * 4.0)')).toEqual([]);
    expect(silentOf('band(i, 255.0) * 0.007')).toEqual([]);
  });

  it('every starter reports its own silent terms — and Trails no longer has one', () => {
    let trails = 0;
    for (const { id, source } of STARTERS) {
      const silent = silentOf(source);
      expect(Array.isArray(silent), `${id}`).toBe(true);
      expect(silent, `${id}`).not.toContain('prev()');
      if (source.includes('prev(')) {
        trails++;
        expect(silent, `${id}`).toEqual([]);
      }
    }
    expect(trails).toBeGreaterThan(0); // the prev() starter still exists
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
