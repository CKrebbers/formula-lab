import { describe, it, expect } from 'vitest';
import { MODES, nextMode, createAutomation, evaluate } from '../src/core/automate.js';

const RANGE = { min: -2, max: 6 };

function auto(overrides) {
  return { ...createAutomation(2, 0), ...overrides };
}

describe('automate: modes', () => {
  it('cycles off → sine → tri → walk → off', () => {
    let mode = 'off';
    const seen = [];
    for (let i = 0; i < 4; i++) {
      mode = nextMode(mode);
      seen.push(mode);
    }
    expect(seen).toEqual(['sine', 'tri', 'walk', 'off']);
    expect(MODES).toContain('walk');
  });

  it('de-syncs phases per param index', () => {
    expect(createAutomation(0, 0).phase).not.toBe(createAutomation(0, 1).phase);
  });
});

describe('automate: evaluate', () => {
  it('returns center when off', () => {
    expect(evaluate(auto({ mode: 'off' }), RANGE, 123.4)).toBe(2);
  });

  it('returns center when depth is 0', () => {
    for (const mode of ['sine', 'tri', 'walk']) {
      expect(evaluate(auto({ mode, depth: 0 }), RANGE, 7.7)).toBeCloseTo(2, 10);
    }
  });

  it('stays inside the range for all modes over time', () => {
    for (const mode of ['sine', 'tri', 'walk']) {
      const a = auto({ mode, depth: 1, center: 5.5 }); // center near max → clamp must kick in
      for (let t = 0; t < 30; t += 0.13) {
        const v = evaluate(a, RANGE, t);
        expect(v).toBeGreaterThanOrEqual(RANGE.min);
        expect(v).toBeLessThanOrEqual(RANGE.max);
      }
    }
  });

  it('sine has the requested period (1/rate)', () => {
    const a = auto({ mode: 'sine', rate: 0.5, phase: 0, depth: 0.5 });
    const v1 = evaluate(a, RANGE, 0.3);
    const v2 = evaluate(a, RANGE, 0.3 + 2); // one full period at 0.5 Hz
    expect(v2).toBeCloseTo(v1, 8);
  });

  it('actually moves when active', () => {
    const a = auto({ mode: 'sine', depth: 0.5 });
    const values = new Set();
    for (let t = 0; t < 5; t += 0.5) values.add(evaluate(a, RANGE, t).toFixed(4));
    expect(values.size).toBeGreaterThan(3);
  });

  it('walk is deterministic', () => {
    const a = auto({ mode: 'walk' });
    expect(evaluate(a, RANGE, 3.21)).toBe(evaluate({ ...a }, RANGE, 3.21));
  });
});
