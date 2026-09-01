// Phase 3 of the AV layer (ADR 001): scan paths turn field formulas into
// sound, and computeAudioStats records how interesting a preset SOUNDS,
// independent of how it looks. Plus the v2 → v3 snapshot migration.

import { describe, it, expect } from 'vitest';
import { parse } from '../src/core/parser.js';
import { extractParams } from '../src/core/constants.js';
import { compileFormula } from '../src/core/js.js';
import { FL } from '../src/core/jsruntime.js';
import { SynthCore, scanXY, SCAN_PATHS } from '../src/audio/dsp.js';
import { computeAudioStats } from '../src/audio/stats.js';
import { createSnapshot, validateSnapshot, SCHEMA_VERSION } from '../src/store/snapshot.js';

const SR = 48000;

function render(core, seconds) {
  const blocks = Math.ceil((seconds * SR) / 128);
  const out = new Float32Array(blocks * 128);
  const l = new Float32Array(128);
  const r = new Float32Array(128);
  for (let b = 0; b < blocks; b++) {
    core.process(l, r);
    out.set(l, b * 128);
  }
  return out;
}

describe('scan paths', () => {
  it('every path stays inside the field and is deterministic', () => {
    for (const path of SCAN_PATHS) {
      const out = [0, 0];
      for (let k = 0; k < 500; k++) {
        const phase = (k * 7919) % 1000 / 1000;
        const row = (k % 64) / 64;
        scanXY(path, phase, row, out);
        expect(Math.abs(out[0])).toBeLessThanOrEqual(1);
        expect(Math.abs(out[1])).toBeLessThanOrEqual(1);
        const again = scanXY(path, phase, row, [0, 0]);
        expect(again[0]).toBe(out[0]);
        expect(again[1]).toBe(out[1]);
      }
    }
  });

  it('a field formula produces signal through the scan, silence without', () => {
    const { ast, params } = extractParams(parse('sin(x * 8.0) * cos(y * 8.0)'));
    const spatial = new SynthCore(SR, { FL });
    spatial.setFormula(compileFormula(ast), true);
    spatial.setScan('lissajous', 220);
    spatial.setParams(params);
    const withScan = render(spatial, 1.5);
    const rmsScan = Math.sqrt(withScan.reduce((s, v) => s + v * v, 0) / withScan.length);

    const still = new SynthCore(SR, { FL });
    still.setFormula(compileFormula(ast), false); // x = y = 0: a DC point
    still.setParams(params);
    const withoutScan = render(still, 1.5);
    const rmsStill = Math.sqrt(withoutScan.reduce((s, v) => s + v * v, 0) / withoutScan.length);

    expect(rmsScan).toBeGreaterThan(0.1);
    expect(rmsStill).toBeLessThan(0.01); // DC-blocked to (near) silence
  });

  it('the scanned output is safe like everything else', () => {
    const { ast, params } = extractParams(parse('band(shl(floor(x * 64.0), 3.0), floor(y * 64.0) + 12.0) * 0.1'));
    const core = new SynthCore(SR, { FL });
    core.setFormula(compileFormula(ast), true);
    core.setScan('line', 110);
    core.setParams(params);
    const out = render(core, 2);
    let sum = 0;
    for (const v of out) {
      expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      sum += v;
    }
    expect(Math.abs(sum / out.length)).toBeLessThan(0.01);
  });
});

describe('computeAudioStats', () => {
  const statsFor = (source, scan = null) => {
    const { ast, params } = extractParams(parse(source));
    return computeAudioStats(ast, params, scan);
  };

  it('a pure tone: low flatness, crest √2; noise: far higher flatness', () => {
    const tone = statsFor('sin(440.0 * 6.283 * t)');
    expect(tone.pre.rms).toBeGreaterThan(0.1);
    expect(tone.pre.flatness).toBeLessThan(0.01);
    expect(tone.pre.crest).toBeCloseTo(Math.SQRT2, 2); // a sine, exactly

    const noise = statsFor('hash(floor(t * 8000.0), 1.0) * 2.0 - 1.0');
    expect(noise.pre.flatness).toBeGreaterThan(tone.pre.flatness * 10);
  });

  // The reason pre exists (ADR #35). Measured: pre.rms 0.000706 vs 706.2 for
  // the same formula ×1e-3 and ×1e3, while post.rms sits at 0.33 / 0.49.
  it('post erases the formula\'s level; pre keeps it', () => {
    const quiet = statsFor('sin(440.0 * 6.283 * t) * 0.001');
    const loud = statsFor('sin(440.0 * 6.283 * t) * 1000.0');

    expect(loud.pre.rms / quiet.pre.rms).toBeGreaterThan(9e5);
    expect(loud.pre.rms / quiet.pre.rms).toBeLessThan(1.1e6);
    // the normalizer pins both to the same neighbourhood
    for (const s of [quiet, loud]) {
      expect(s.post.rms).toBeGreaterThan(0.2);
      expect(s.post.rms).toBeLessThan(0.6);
    }
  });

  // The sharpest version of the same finding: post grades the limiter.
  it('pre.crest is level-invariant, post.crest is not', () => {
    const quiet = statsFor('sin(440.0 * 6.283 * t) * 0.001');
    const loud = statsFor('sin(440.0 * 6.283 * t) * 1000.0');

    // same waveform, so the same crest factor — whatever its amplitude
    expect(loud.pre.crest).toBeCloseTo(quiet.pre.crest, 4);
    // measured: 1.39 quiet vs 2.05 loud — the limiter, not the formula
    expect(Math.abs(loud.post.crest - quiet.post.crest)).toBeGreaterThan(0.3);
  });

  it('crest separates spiky from smooth', () => {
    const sine = statsFor('sin(220.0 * 6.283 * t)');
    const pulse = statsFor('pow(abs(sin(200.0 * 3.14159 * t)), 32.0)');
    expect(pulse.pre.crest).toBeGreaterThan(sine.pre.crest * 1.8);
  });

  it('a field formula gets stats through its scan settings', () => {
    const s = statsFor('worley(x * 4.0, y * 4.0) * 2.0 - 1.0', { path: 'spiral', freq: 220 });
    for (const side of [s.pre, s.post]) {
      expect(side.rms).toBeGreaterThan(0.05);
      expect(Number.isFinite(side.crest)).toBe(true);
      expect(side.flatness).toBeGreaterThan(0);
    }
  });

  it('is deterministic', () => {
    expect(statsFor('fract(t * 220.0) * 2.0 - 1.0'))
      .toEqual(statsFor('fract(t * 220.0) * 2.0 - 1.0'));
  });

  it('the tap is opt-in: the worklet path allocates nothing for it', () => {
    const { ast, params } = extractParams(parse('sin(440.0 * 6.283 * t)'));
    const core = new SynthCore(SR, { FL });
    core.setFormula(compileFormula(ast));
    core.setParams(params);
    render(core, 0.05);
    expect(core.tapL).toBeUndefined();
  });
});

describe('snapshot carries the audio measurement', () => {
  it('createSnapshot carries scan and an empty stats.audio', () => {
    const ast = parse('sin(x + t)');
    const snap = createSnapshot({ source: 'sin(x + t)', ast, scan: { path: 'line', freq: 110 } });
    expect(snap.schema).toBe(SCHEMA_VERSION);
    expect(snap.scan.path).toBe('line');
    expect(snap.stats.audio).toBeNull();
    expect(validateSnapshot(snap).ok).toBe(true);
  });

  it('a measured snapshot validates and keeps both sides', () => {
    const ast = parse('sin(440.0 * 6.283 * t)');
    const { ast: paramAst, params } = extractParams(parse('sin(440.0 * 6.283 * t)'));
    const snap = createSnapshot({ source: 'sin(440.0 * 6.283 * t)', ast });
    snap.stats.audio = computeAudioStats(paramAst, params, null);
    expect(snap.stats.audio.pre.crest).toBeCloseTo(Math.SQRT2, 2);
    expect(snap.stats.audio.post.rms).toBeGreaterThan(0);
    expect(validateSnapshot(snap).ok).toBe(true);
  });

  it('rejects a stats.audio that only records one side', () => {
    const ast = parse('sin(x + t)');
    const snap = createSnapshot({ source: 'sin(x + t)', ast });
    snap.stats.audio = { rms: 0.3, crest: 1.4, flatness: 1e-9 }; // the v3 shape
    expect(validateSnapshot(snap).ok).toBe(false);
  });
});
