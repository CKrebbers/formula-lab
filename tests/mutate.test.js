import { describe, it, expect } from 'vitest';
import { gaussian, constTweak } from '../src/search/mutate.js';

/** Deterministic rng from a fixed sequence (repeats when exhausted). */
function seqRng(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('mutate: gaussian', () => {
  it('is roughly standard normal', () => {
    let sum = 0, sumSq = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      const g = gaussian(Math.random);
      sum += g;
      sumSq += g * g;
    }
    expect(sum / n).toBeGreaterThan(-0.15);
    expect(sum / n).toBeLessThan(0.15);
    expect(sumSq / n).toBeGreaterThan(0.7);
    expect(sumSq / n).toBeLessThan(1.3);
  });
});

describe('mutate: constTweak', () => {
  const params = { a: 1.7, b: -1.3, c: 40 };

  it('returns a new object and leaves the input untouched', () => {
    const out = constTweak(params, Math.random);
    expect(out).not.toBe(params);
    expect(params).toEqual({ a: 1.7, b: -1.3, c: 40 });
  });

  it('perturbs every unlocked param', () => {
    const out = constTweak(params, Math.random, { sigma: 0.5 });
    // gaussian returning exactly 0 for all three is practically impossible
    expect(Object.values(out)).not.toEqual(Object.values(params));
    expect(Object.keys(out)).toEqual(['a', 'b', 'c']);
  });

  it('respects locks', () => {
    const out = constTweak(params, Math.random, { locks: { b: true } });
    expect(out.b).toBe(-1.3);
  });

  it('scales sigma with the magnitude of the value', () => {
    // with a pinned rng, both params get the same gaussian draw
    const draws = [0.3, 0.3];
    const rng = seqRng(draws);
    const g = gaussian(seqRng(draws));
    const out = constTweak({ small: 1, big: 100 }, rng, { sigma: 0.25 });
    expect(out.small - 1).toBeCloseTo(g * 0.25 * 1, 10);
    expect(out.big - 100).toBeCloseTo(g * 0.25 * 100, 10);
  });

  it('is deterministic with an injected rng', () => {
    const a = constTweak(params, seqRng([0.2, 0.8, 0.4, 0.6, 0.3, 0.7]));
    const b = constTweak(params, seqRng([0.2, 0.8, 0.4, 0.6, 0.3, 0.7]));
    expect(a).toEqual(b);
  });
});

describe('func_swap never swaps cam() in (ADR #41)', () => {
  it('over many swaps of an arity-2 call, cam is never chosen', async () => {
    const { funcSwap } = await import('../src/search/mutate.js');
    const { parse } = await import('../src/core/parser.js');
    const { print } = await import('../src/core/print.js');
    let seed = 7;
    const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let i = 0; i < 300; i++) {
      const out = funcSwap(parse('noise(x, y) * 0.5 + t'), rng);
      if (out) expect(print(out)).not.toContain('cam(');
    }
  });
});
