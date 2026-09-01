// Audio safety (ADR 001): every formula — including deliberately hostile
// ones — must come out of the chain finite, DC-free, and inside [-1, 1].
// SynthCore is the exact code the AudioWorklet runs (same file, embedded).

import { describe, it, expect } from 'vitest';
import { parse } from '../src/core/parser.js';
import { extractParams } from '../src/core/constants.js';
import { compileFormula } from '../src/core/js.js';
import { FL } from '../src/core/jsruntime.js';
import { SynthCore, DCBlocker, Decimator, RunningMeanRemover } from '../src/audio/dsp.js';
import { STARTERS } from '../src/families/starters.js';
import { FAMILIES } from '../src/families/index.js';

const SR = 48000;

export function renderSeconds(core, seconds, blockSize = 128) {
  const blocks = Math.ceil((seconds * SR) / blockSize);
  const outL = new Float32Array(blocks * blockSize);
  const outR = new Float32Array(blocks * blockSize);
  const l = new Float32Array(blockSize);
  const r = new Float32Array(blockSize);
  for (let b = 0; b < blocks; b++) {
    core.process(l, r);
    outL.set(l, b * blockSize);
    outR.set(r, b * blockSize);
  }
  return { outL, outR };
}

function makeCore(source, params = null) {
  const { ast, params: extracted } = extractParams(parse(source));
  const core = new SynthCore(SR, { FL });
  core.setFormula(compileFormula(ast));
  core.setParams(params ?? extracted);
  return core;
}

const SAFETY_CORPUS = [
  // honest signals
  'sin(440.0 * 6.283 * t) * 0.5',
  'vec2(sin(440.0 * 6.283 * t), sin(662.0 * 6.283 * t))',
  'fract(t * 220.0) * 2.0 - 1.0',
  'band(i, 255.0) * 0.007 - 0.9',
  // hostile: division through zero, NaN, Inf, huge DC, silence, huge gain
  '1.0 / sin(t * 2.0)',
  'sqrt(0.0 - abs(sin(t * 440.0)))',
  'log(abs(sin(t)) - 1.0)',
  'sin(t * 100.0) * 0.001 + 5.0',
  '0.0 * t',
  'sin(220.0 * 6.283 * t) * 1000.0',
  'pow(0.0 - 1.0, t)',
  't * 8000.0',
];

describe('output chain safety (2 s renders)', () => {
  for (const source of SAFETY_CORPUS) {
    it(source, () => {
      const core = makeCore(source);
      const { outL, outR } = renderSeconds(core, 2);
      let sumL = 0, sumR = 0, peak = 0;
      for (let i = 0; i < outL.length; i++) {
        expect(Number.isFinite(outL[i]), `L[${i}] finite`).toBe(true);
        expect(Number.isFinite(outR[i]), `R[${i}] finite`).toBe(true);
        expect(Math.abs(outL[i])).toBeLessThanOrEqual(1);
        expect(Math.abs(outR[i])).toBeLessThanOrEqual(1);
        sumL += outL[i];
        sumR += outR[i];
        peak = Math.max(peak, Math.abs(outL[i]), Math.abs(outR[i]));
      }
      expect(Math.abs(sumL / outL.length), 'DC left').toBeLessThan(0.01);
      expect(Math.abs(sumR / outR.length), 'DC right').toBeLessThan(0.01);
      expect(peak).toBeLessThanOrEqual(1.0);
    });
  }

  it('every starter and family survives the chain too', () => {
    for (const { source } of [...STARTERS, ...FAMILIES]) {
      const core = makeCore(source);
      const { outL } = renderSeconds(core, 0.5);
      for (let i = 0; i < outL.length; i++) {
        expect(Number.isFinite(outL[i])).toBe(true);
        expect(Math.abs(outL[i])).toBeLessThanOrEqual(1);
      }
    }
  });

  it('a formula swap crossfades without a discontinuity or NaN', () => {
    const core = makeCore('sin(440.0 * 6.283 * t) * 0.5');
    renderSeconds(core, 0.5); // settle
    const { ast } = extractParams(parse('sin(297.0 * 6.283 * t) * 0.5'));
    core.setFormula(compileFormula(ast));
    const { outL } = renderSeconds(core, 0.2);
    let maxJump = 0;
    for (let i = 1; i < outL.length; i++) {
      expect(Number.isFinite(outL[i])).toBe(true);
      maxJump = Math.max(maxJump, Math.abs(outL[i] - outL[i - 1]));
    }
    // a 440 Hz sine at 0.5 moves ≤ ~0.03 per sample; a hard swap would jump ~1
    expect(maxJump).toBeLessThan(0.1);
  });

  it('normalizer lifts a quiet formula toward the target level', () => {
    const core = makeCore('sin(330.0 * 6.283 * t) * 0.001');
    renderSeconds(core, 3); // give the slow gain time to arrive
    const { outL } = renderSeconds(core, 0.5);
    let peak = 0;
    for (const v of outL) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeGreaterThan(0.2);
    expect(peak).toBeLessThanOrEqual(1.0);
  });
});

describe('the DC chain keeps the low end (ADR #37)', () => {
  const OS = SR * 4; // the chain runs at the oversampled rate

  /** Steady-state gain of a filter chain at `f`, in dB. */
  function responseDb(step, f, seconds = 4, settle = 1.5) {
    const n = Math.round(OS * seconds);
    const skip = Math.round(OS * settle);
    let inSq = 0;
    let outSq = 0;
    for (let i = 0; i < n; i++) {
      const x = Math.sin((2 * Math.PI * f * i) / OS);
      const y = step(x);
      if (i >= skip) {
        inSq += x * x;
        outSq += y * y;
      }
    }
    return 20 * Math.log10(Math.sqrt(outSq / inSq));
  }

  const newChain = () => {
    const mean = new RunningMeanRemover(OS);
    const dc = new DCBlocker(OS);
    return (x) => dc.step(mean.step(x));
  };

  it('a 30 Hz sine loses less than 1 dB', () => {
    const loss = responseDb(newChain(), 30);
    expect(loss, `30 Hz: ${loss.toFixed(2)} dB`).toBeGreaterThan(-1);
  });

  it('and so does everything from 20 Hz up — not just at 30 Hz', () => {
    for (const f of [20, 25, 30, 40, 60, 100, 1000]) {
      const loss = responseDb(newChain(), f);
      expect(loss, `${f} Hz: ${loss.toFixed(2)} dB`).toBeGreaterThan(-1);
      expect(loss, `${f} Hz: ${loss.toFixed(2)} dB (boost)`).toBeLessThan(1);
    }
  });

  it('NEGATIVE CONTROL: the two cascaded 20 Hz blockers this replaced fail it', () => {
    const old = () => {
      const a = new DCBlocker(OS, 20);
      const b = new DCBlocker(OS, 20);
      return (x) => b.step(a.step(x));
    };
    // measured: -3.19 dB at 30 Hz, -6.02 dB at 20 Hz
    expect(responseDb(old(), 30)).toBeLessThan(-1);
    expect(responseDb(old(), 20)).toBeLessThan(-1);
  });

  it('a ramp ends as silence, not as a stuck constant', () => {
    const core = makeCore('t * 8000.0');
    const { outL } = renderSeconds(core, 3);
    const tail = outL.subarray(outL.length / 2); // after the chain has settled
    let mean = 0;
    let peak = 0;
    for (const v of tail) {
      mean += v;
      peak = Math.max(peak, Math.abs(v));
    }
    mean /= tail.length;
    expect(Math.abs(mean), 'a ramp must not leave DC behind').toBeLessThan(0.01);
    // the failure mode being guarded: the limiter pinned at ±1 forever
    expect(peak, 'the ramp is stuck at a constant level').toBeLessThan(0.05);
  });

  it('…while formulas that do carry signal keep it', () => {
    for (const source of ['sin(220.0 * 6.283 * t)', 'band(i, 255.0) * 0.007 - 0.9',
      'fract(t * 220.0) * 2.0 - 1.0']) {
      const { outL } = renderSeconds(makeCore(source), 3);
      const tail = outL.subarray(outL.length / 2);
      let mean = 0;
      for (const v of tail) mean += v;
      mean /= tail.length;
      let variance = 0;
      for (const v of tail) variance += (v - mean) ** 2;
      const sd = Math.sqrt(variance / tail.length);
      expect(sd, `${source} was silenced`).toBeGreaterThan(0.1);
      expect(Math.abs(mean), `${source} kept DC`).toBeLessThan(0.01);
    }
  });

  it('the running mean is what handles a ramp: without it, a blocker cannot', () => {
    // one blocker alone answers a ramp with a constant — the reason the chain
    // used to need two, and the reason the mean subtraction exists
    const dc = new DCBlocker(OS);
    let y = 0;
    for (let i = 0; i < OS; i++) y = dc.step((i / OS) * 8000);
    expect(Math.abs(y), 'a lone blocker should leave a constant').toBeGreaterThan(10);

    const mean = new RunningMeanRemover(OS);
    const dc2 = new DCBlocker(OS);
    let y2 = 0;
    for (let i = 0; i < OS; i++) y2 = dc2.step(mean.step((i / OS) * 8000));
    expect(Math.abs(y2), 'mean + blocker should leave nothing').toBeLessThan(0.01);
  });
});

describe('chain pieces', () => {
  it('DC blocker removes a constant', () => {
    const dc = new DCBlocker(SR);
    let y = 0;
    for (let i = 0; i < SR; i++) y = dc.step(0.8);
    expect(Math.abs(y)).toBeLessThan(1e-3);
  });

  it('decimator passes the band and has unity DC gain', () => {
    const d = new Decimator(4);
    let last = 0;
    for (let i = 0; i < 512; i++) {
      d.push(1);
      last = d.read();
    }
    expect(last).toBeCloseTo(1, 6);
  });

  it('silence stays exactly silent (no core set)', () => {
    const core = new SynthCore(SR, { FL });
    const { outL } = renderSeconds(core, 0.1);
    expect(outL.every((v) => v === 0)).toBe(true);
  });
});
