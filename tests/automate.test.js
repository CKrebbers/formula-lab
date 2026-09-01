import { describe, it, expect } from 'vitest';
import {
  MODES, nextMode, createAutomation, evaluate, glideValue, swapAutomationSettings, shape,
  extractGesture,
} from '../src/core/automate.js';

const RANGE = { min: -2, max: 6 };

function auto(overrides) {
  return { ...createAutomation(2, 0), ...overrides };
}

describe('automate: modes', () => {
  it('cycles off → sine → tri → walk → bass → mid → high → cam → off', () => {
    let mode = 'off';
    const seen = [];
    for (let i = 0; i < 8; i++) {
      mode = nextMode(mode);
      seen.push(mode);
    }
    expect(seen).toEqual(['sine', 'tri', 'walk', 'bass', 'mid', 'high', 'cam', 'off']);
  });

  it('cam mode reads the camera frame like an audio band', () => {
    const auto = { ...createAutomation(0.5, 0), mode: 'cam', depth: 1, rate: 0, curve: 0 };
    const range = { min: 0, max: 1 };
    expect(evaluate(auto, range, 0, null)).toBe(0.5); // no camera → rests at center
    expect(evaluate(auto, range, 0, { cam: { level: 1, pulse: 0 } })).toBe(1);
  });

  it('de-syncs phases per param index', () => {
    expect(createAutomation(0, 0).phase).not.toBe(createAutomation(0, 1).phase);
  });

  it('swapAutomationSettings trades mode/rate/depth/curve, keeps center/phase', () => {
    const a = { ...createAutomation(1.5, 0), mode: 'bass', rate: 1.8, depth: 0.7, curve: 0.5 };
    const b = { ...createAutomation(-2, 1), mode: 'off', rate: 0, depth: 0, curve: -0.3 };
    swapAutomationSettings(a, b);
    expect([a.mode, a.rate, a.depth, a.curve]).toEqual(['off', 0, 0, -0.3]);
    expect([b.mode, b.rate, b.depth, b.curve]).toEqual(['bass', 1.8, 0.7, 0.5]);
    expect(a.center).toBe(1.5);
    expect(b.center).toBe(-2);
    expect(a.phase).not.toBe(b.phase);
  });
});

describe('automate: capture last take (gesture)', () => {
  /** history: still 0..4s, sine drag 4..7s, still 7..10s */
  function makeHistory() {
    const t = [];
    const v = [];
    for (let time = 0; time < 10; time += 1 / 30) {
      t.push(time);
      v.push(time >= 4 && time <= 7 ? 2 + Math.sin((time - 4) * 3) * 1.5 : time < 4 ? 2 : v[v.length - 1]);
    }
    return { t, v };
  }

  it('extracts the moving window, normalized around its mean', () => {
    const { t, v } = makeHistory();
    const g = extractGesture(t, v, { minDelta: 0.01 });
    expect(g).not.toBeNull();
    expect(g.duration).toBeGreaterThan(2.5);
    expect(g.duration).toBeLessThan(3.6);
    expect(Math.max(...g.wave.map(Math.abs))).toBeCloseTo(1, 6); // one extreme hits ±1
    expect(Math.max(...g.wave)).toBeGreaterThan(0.3);
    expect(Math.min(...g.wave)).toBeLessThan(-0.3);
    expect(g.amp).toBeGreaterThan(1);
    expect(g.wave).toHaveLength(128);
  });

  it('returns null for stillness or too-short blips', () => {
    const t = Array.from({ length: 100 }, (_, i) => i / 30);
    expect(extractGesture(t, t.map(() => 3), { minDelta: 0.01 })).toBeNull();
    const blipV = t.map((tt, i) => (i === 50 ? 4 : 3));
    expect(extractGesture(t, blipV, { minDelta: 0.01, minDuration: 0.25 })).toBeNull();
  });

  it('gesture mode loops the take; rate = speed, depth = amplitude', () => {
    const range = { min: -10, max: 10 };
    const g = { wave: [0, 1, 0, -1], duration: 2, amp: 3, mean: 1 };
    const auto = { ...createAutomation(1, 0), mode: 'gesture', gesture: g, rate: 1, depth: 1 };
    expect(evaluate(auto, range, 0)).toBeCloseTo(1, 6);      // wave[0]
    expect(evaluate(auto, range, 2 / 3)).toBeCloseTo(4, 6);  // wave[1]: 1 + 3
    expect(evaluate(auto, range, 2)).toBeCloseTo(1, 6);      // wrapped
    expect(evaluate({ ...auto, depth: 0.5 }, range, 2 / 3)).toBeCloseTo(2.5, 6);
    expect(evaluate({ ...auto, rate: 2 }, range, 1 / 3)).toBeCloseTo(4, 6); // double speed
    expect(evaluate({ ...auto, gesture: null }, range, 5)).toBe(1); // no take → center
  });

  it("nextMode includes 'gesture' only when one exists", () => {
    expect(nextMode('cam', false)).toBe('off');
    expect(nextMode('cam', true)).toBe('gesture');
    expect(nextMode('gesture', true)).toBe('off');
  });
});

describe('automate: curve shaping', () => {
  it('curve 0 is identity, endpoints always preserved', () => {
    expect(shape(0.5, 0)).toBe(0.5);
    expect(shape(-0.7, 0)).toBe(-0.7);
    for (const c of [-1, -0.5, 0.5, 1]) {
      expect(shape(1, c)).toBeCloseTo(1, 10);
      expect(shape(-1, c)).toBeCloseTo(-1, 10);
      expect(shape(0, c)).toBe(0);
    }
  });

  it('positive curve hugs the center, negative dwells at extremes', () => {
    expect(Math.abs(shape(0.5, 1))).toBeLessThan(0.5);     // spiky
    expect(Math.abs(shape(-0.5, 1))).toBeLessThan(0.5);
    expect(Math.abs(shape(0.5, -1))).toBeGreaterThan(0.5); // blocky
    expect(shape(-0.5, -1)).toBeLessThan(-0.5);            // sign preserved
  });

  it('curve shapes both LFO and audio evaluation', () => {
    const range = { min: -2, max: 6 };
    const lfoLin = { ...createAutomation(2, 0), mode: 'sine', rate: 0.25, depth: 1, phase: 0 };
    const lfoSpiky = { ...lfoLin, curve: 1 };
    // t chosen so the sine sits at ~0.5 of its swing
    const tMid = (1 / 0.25) / 12; // 30° → sin = 0.5
    expect(Math.abs(evaluate(lfoSpiky, range, tMid) - 2))
      .toBeLessThan(Math.abs(evaluate(lfoLin, range, tMid) - 2));

    const audio = { bass: { level: 0.5, pulse: 0 }, mid: { level: 0, pulse: 0 }, high: { level: 0, pulse: 0 } };
    const aLin = { ...createAutomation(2, 0), mode: 'bass', rate: 0, depth: 1 };
    const aBlocky = { ...aLin, curve: -1 };
    expect(evaluate(aBlocky, range, 0, audio)).toBeGreaterThan(evaluate(aLin, range, 0, audio));
  });
});

describe('automate: evaluate', () => {
  it('returns center when off', () => {
    expect(evaluate(auto({ mode: 'off' }), RANGE, 123.4)).toBe(2);
  });

  it('returns center when depth is 0 (the default)', () => {
    for (const mode of ['sine', 'tri', 'walk']) {
      expect(evaluate(auto({ mode }), RANGE, 7.7)).toBeCloseTo(2, 10);
    }
  });

  it('new automations start with rate 0 and depth 0', () => {
    const a = createAutomation(1, 0);
    expect(a.rate).toBe(0);
    expect(a.depth).toBe(0);
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

  it('actually moves when active (with rate and depth raised)', () => {
    // defaults are rate 0 / depth 0 by design: enabling an LFO is silent
    const a = auto({ mode: 'sine', depth: 0.5, rate: 0.2 });
    const values = new Set();
    for (let t = 0; t < 5; t += 0.5) values.add(evaluate(a, RANGE, t).toFixed(4));
    expect(values.size).toBeGreaterThan(3);
  });

  it('walk is deterministic', () => {
    const a = auto({ mode: 'walk' });
    expect(evaluate(a, RANGE, 3.21)).toBe(evaluate({ ...a }, RANGE, 3.21));
  });
});

describe('automate: glideValue', () => {
  it('starts at from, ends at to, monotonic ease between', () => {
    expect(glideValue(1, 5, 0, 0.5)).toBe(1);
    expect(glideValue(1, 5, 0.25, 0.5)).toBeCloseTo(3, 10); // smoothstep midpoint
    expect(glideValue(1, 5, 0.5, 0.5)).toBe(5);
    expect(glideValue(1, 5, 99, 0.5)).toBe(5);
    let prev = -Infinity;
    for (let e = 0; e <= 0.5; e += 0.05) {
      const v = glideValue(1, 5, e, 0.5);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('zero duration jumps immediately', () => {
    expect(glideValue(1, 5, 0, 0)).toBe(5);
  });
});
