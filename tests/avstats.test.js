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
import { createSnapshot, migrate, validateSnapshot } from '../src/store/snapshot.js';

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
  it('a pure tone: low flatness, modest crest; noise: high flatness', () => {
    const tone = extractParams(parse('sin(440.0 * 6.283 * t)'));
    const sTone = computeAudioStats(tone.ast, tone.params, null);
    expect(sTone.rms).toBeGreaterThan(0.1);
    expect(sTone.flatness).toBeLessThan(0.01);
    expect(sTone.crest).toBeGreaterThan(1);
    expect(sTone.crest).toBeLessThan(2.5);

    const noisy = extractParams(parse('hash(floor(t * 8000.0), 1.0) * 2.0 - 1.0'));
    const sNoise = computeAudioStats(noisy.ast, noisy.params, null);
    expect(sNoise.flatness).toBeGreaterThan(sTone.flatness * 10);
  });

  it('a field formula gets stats through its scan settings', () => {
    const field = extractParams(parse('worley(x * 4.0, y * 4.0) * 2.0 - 1.0'));
    const s = computeAudioStats(field.ast, field.params, { path: 'spiral', freq: 220 });
    expect(s.rms).toBeGreaterThan(0.05);
    expect(Number.isFinite(s.crest)).toBe(true);
    expect(s.flatness).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const f = extractParams(parse('fract(t * 220.0) * 2.0 - 1.0'));
    expect(computeAudioStats(f.ast, f.params, null))
      .toEqual(computeAudioStats(f.ast, f.params, null));
  });
});

describe('snapshot schema v3', () => {
  it('createSnapshot carries scan and stats.audio', () => {
    const ast = parse('sin(x + t)');
    const snap = createSnapshot({ source: 'sin(x + t)', ast, scan: { path: 'line', freq: 110 } });
    expect(snap.schema).toBe(3);
    expect(snap.scan).toEqual({ path: 'line', freq: 110 });
    expect(snap.stats.audio).toBeNull();
    expect(validateSnapshot(snap).ok).toBe(true);
  });

  it('migrates v2 (and v1) snapshots forward', () => {
    const ast = parse('sin(x + t)');
    const v2 = {
      ...createSnapshot({ source: 'sin(x + t)', ast }),
      schema: 2,
    };
    delete v2.scan;
    v2.stats = { entropy: 0.5, edge_density: 0.1, color_variance: 0.02, symmetry: 0.3, spectral_flatness: 0.4 };
    const v3 = migrate(v2);
    expect(v3.schema).toBe(3);
    expect(v3.scan).toBeNull();
    expect(v3.stats.audio).toBeNull();
    expect(v3.stats.entropy).toBe(0.5);
    expect(validateSnapshot(v3).ok).toBe(true);
  });
});
