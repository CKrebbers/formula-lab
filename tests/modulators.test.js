import { describe, it, expect } from 'vitest';
import { ModStack } from '../src/core/modulators.js';

const PARAMS = { a: 2, b: -1, c: 0.5 };
const RANGES = {
  a: { min: -3, max: 7 },
  b: { min: -6, max: 4 },
  c: { min: -2, max: 3 },
};

function run(stack, from, to, step = 1 / 60) {
  let last = null;
  for (let t = from; t < to; t += step) last = stack.tick(t, PARAMS, RANGES);
  return last;
}

describe('modulator stack', () => {
  it('passes through untouched when nothing is active', () => {
    const stack = new ModStack(() => 0.5);
    const out = stack.tick(1, PARAMS, RANGES);
    expect(out.params).toBe(PARAMS); // same reference: fast path
    expect(out.modulating).toBe(false);
  });

  it('smooth modulators fade in — no jump at enable', () => {
    const stack = new ModStack(() => 0.7);
    stack.tick(0, PARAMS, RANGES);
    stack.toggle('drift', true);
    stack.set('drift', 'amount', 1);
    const first = stack.tick(1 / 60, PARAMS, RANGES);
    // one frame into the 0.8s envelope: offset must still be tiny
    expect(Math.abs(first.params.a - PARAMS.a)).toBeLessThan(0.3);
    const later = run(stack, 2 / 60, 3);
    expect(later.modulating).toBe(true);
  });

  it('every smooth modulator stays within ranges and leaves base untouched', () => {
    for (const id of ['drift', 'chase', 'pulse', 'shuffle']) {
      const stack = new ModStack(Math.random);
      stack.toggle(id, true);
      stack.set(id, 'amount', 1);
      stack.set(id, 'rate', 1.5);
      for (let t = 0; t < 8; t += 1 / 30) {
        const { params } = stack.tick(t, PARAMS, RANGES);
        for (const [name, range] of Object.entries(RANGES)) {
          expect(params[name], `${id}:${name}`).toBeGreaterThanOrEqual(range.min);
          expect(params[name], `${id}:${name}`).toBeLessThanOrEqual(range.max);
        }
      }
      expect(PARAMS).toEqual({ a: 2, b: -1, c: 0.5 });
    }
  });

  it('chase actually moves the params over time', () => {
    const stack = new ModStack(Math.random);
    stack.toggle('chase', true);
    stack.set('chase', 'amount', 1);
    const seen = new Set();
    for (let t = 0; t < 10; t += 0.25) {
      seen.add(stack.tick(t, PARAMS, RANGES).params.a.toFixed(2));
    }
    expect(seen.size).toBeGreaterThan(5);
  });

  it('shuffle trades values between exactly two params and returns', () => {
    const stack = new ModStack(() => 0.4); // deterministic pair pick
    stack.toggle('shuffle', true);
    stack.set('shuffle', 'amount', 1);
    run(stack, 0, 1); // past the envelope
    const mid = stack.tick(1.6, PARAMS, RANGES); // mid-period: swap in effect
    const moved = Object.keys(PARAMS).filter(
      (n) => Math.abs(mid.params[n] - PARAMS[n]) > 0.05
    );
    expect(moved.length).toBe(2);
  });

  it('disabling fades out and returns to the exact base', () => {
    const stack = new ModStack(Math.random);
    stack.toggle('pulse', true);
    stack.set('pulse', 'amount', 1);
    run(stack, 0, 2);
    stack.toggle('pulse', false);
    const settled = run(stack, 2, 4);
    expect(settled.modulating).toBe(false);
    expect(settled.params).toBe(PARAMS);
  });

  it('glitch integrates through the stack (toggle + amount + rate)', () => {
    const stack = new ModStack(() => 0);
    stack.toggle('glitch', true);
    stack.set('glitch', 'amount', 0.9);
    stack.set('glitch', 'rate', 2);
    expect(stack.glitch.active).toBe(true);
    expect(stack.glitch.chaos).toBe(0.9);
    expect(stack.glitch.rate).toBe(2);
    stack.tick(0, PARAMS, RANGES);
    const hit = stack.tick(1 / 60, PARAMS, RANGES);
    expect(hit.modulating).toBe(true);
    expect(hit.params).not.toEqual(PARAMS);
    stack.toggle('glitch', false);
    expect(stack.glitch.active).toBe(false);
  });

  it('modulators combine additively', () => {
    const stack = new ModStack(Math.random);
    stack.toggle('drift', true);
    stack.toggle('pulse', true);
    stack.set('drift', 'amount', 0.5);
    stack.set('pulse', 'amount', 0.5);
    const out = run(stack, 0, 3);
    expect(out.modulating).toBe(true);
  });
});

describe('modulator stack: the global speed', () => {
  it('half speed reaches the same drift at twice the wall time, with the envelope still in wall time', () => {
    const make = (speed) => {
      const stack = new ModStack(() => 0.7);
      stack.setSpeed(speed);
      stack.tick(0, PARAMS, RANGES);
      stack.toggle('drift', true);
      stack.set('drift', 'amount', 1);
      return stack;
    };
    const fast = make(1);
    const slow = make(0.5);
    // well past the 0.8 s toggle envelope in both, so only the modulator clock differs
    let f, s;
    for (let k = 1; k <= 180; k++) f = fast.tick(k / 60, PARAMS, RANGES);
    for (let k = 1; k <= 360; k++) s = slow.tick(k / 60, PARAMS, RANGES);
    expect(slow.clock.time).toBeCloseTo(fast.clock.time, 6); // both at 3 s of automation time
    expect(s.params.a).toBeCloseTo(f.params.a, 1);
    expect(s.params.b).toBeCloseTo(f.params.b, 1);
    // the envelope is not slowed: one second after enabling, half speed is fully faded in too
    const early = make(0.5);
    const e = run(early, 1 / 60, 1);
    expect(early.get('drift').env).toBe(1);
    expect(e.modulating).toBe(true);
  });
});
