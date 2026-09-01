// A2 / ADR #43: prev(x, y) has an audio story. The synth core owns a grid the
// scan path writes as it goes; prev() reads it, dx/dy are one cell of it.
// These tests prove the grid is a real feedback (not decoration), that it
// mirrors the shader's rules where it can (black reset, clamp, hold), that the
// neighbour idiom reads neighbours, and that the whole thing is deterministic.

import { describe, it, expect } from 'vitest';
import { parse } from '../src/core/parser.js';
import { extractParams } from '../src/core/constants.js';
import { compileFormula, isParametric } from '../src/core/js.js';
import { FL } from '../src/core/jsruntime.js';
import { SynthCore, ScanFeedback, FEEDBACK_CELLS, scanXY } from '../src/audio/dsp.js';
import { computeAudioStats } from '../src/audio/stats.js';

const SR = 48000;

function makeCore(source, scan = { path: 'lissajous', freq: 110 }) {
  const { ast, params } = extractParams(parse(source));
  const core = new SynthCore(SR, { FL });
  core.enableTap();
  core.setFormula(compileFormula(ast), !isParametric(ast));
  core.setScan(scan.path, scan.freq);
  core.setParams(params);
  return core;
}

/** Render `seconds`, return the pre-normalizer tap (where the formula still IS the formula). */
function tapSeconds(core, seconds) {
  const blocks = Math.ceil((seconds * SR) / 128);
  const out = new Float64Array(blocks * 128);
  const l = new Float32Array(128);
  const r = new Float32Array(128);
  for (let b = 0; b < blocks; b++) {
    core.process(l, r);
    out.set(core.tapL, b * 128);
  }
  return out;
}

const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);

describe('ScanFeedback grid', () => {
  it('starts black (-1) everywhere, like the shader buffer (ADR #25)', () => {
    const fb = new ScanFeedback();
    expect(fb.read(0, 0)).toBe(-1);
    expect(fb.read(-1, 1)).toBe(-1);
    expect(fb.read(0.37, -0.81)).toBe(-1);
  });

  it('dx/dy is one cell in formula coordinates', () => {
    const fb = new ScanFeedback();
    expect(fb.step).toBe(2 / FEEDBACK_CELLS);
    expect(fb.cellOf(-1, -1)).toBe(0);
    expect(fb.cellOf(-1 + fb.step, -1)).toBe(1);
    expect(fb.cellOf(-1, -1 + fb.step)).toBe(FEEDBACK_CELLS);
  });

  it('a cell is written once per visit, as the mean, when the scan leaves it', () => {
    const fb = new ScanFeedback();
    fb.write(0.01, 0.01, 0.2);
    fb.write(0.011, 0.011, 0.6);
    expect(fb.read(0.01, 0.01)).toBe(-1); // still the previous pass while inside
    fb.write(0.5, 0.5, 0); // the scan moved on → the visit commits
    const cell = fb.cellOf(0.01, 0.01);
    expect(fb.grid[cell]).toBeCloseTo(0.4, 6);
  });

  it('clamps to -1..1 on write, like the 8-bit texture (ADR #23)', () => {
    const fb = new ScanFeedback();
    fb.write(0, 0, 40);
    fb.commit();
    expect(fb.grid[fb.cellOf(0, 0)]).toBe(1);
    fb.write(0.9, 0.9, -7);
    fb.commit();
    expect(fb.grid[fb.cellOf(0.9, 0.9)]).toBe(-1);
  });

  it('reads bilinearly between cells and clamps to the edge', () => {
    const fb = new ScanFeedback();
    const n = fb.n;
    const row = 10;
    fb.grid[row * n + 20] = 0; // (x, y) of cell (20, row)
    fb.grid[row * n + 21] = 1;
    const x20 = -1 + 20 * fb.step;
    const y = -1 + row * fb.step;
    expect(fb.read(x20, y)).toBeCloseTo(0, 6);
    expect(fb.read(x20 + fb.step, y)).toBeCloseTo(1, 6);
    expect(fb.read(x20 + fb.step * 0.5, y)).toBeCloseTo(0.5, 6);
    // way outside the frame: the edge texel, never a wrap, never NaN
    expect(fb.read(5, 5)).toBe(-1);
    expect(fb.read(NaN, 0)).toBe(-1);
  });

  it('the neighbour idiom reads neighbours: prev(x + dx, y) - prev(x - dx, y)', () => {
    const fb = new ScanFeedback();
    const n = fb.n;
    const x = -1 + 30 * fb.step;
    const y = -1 + 30 * fb.step;
    fb.grid[30 * n + 31] = 0.75;  // x + dx
    fb.grid[30 * n + 29] = -0.25; // x - dx
    expect(fb.read(x + fb.step, y) - fb.read(x - fb.step, y)).toBeCloseTo(1, 6);
  });

  it("the line raster's 64 rows land exactly on the 64 grid rows", () => {
    const fb = new ScanFeedback();
    const n = fb.n;
    for (let k = 0; k < 64; k++) {
      fb.grid.fill(-1);
      const p = scanXY('line', 0.3, k / 64, [0, 0]);
      const row = Math.floor(fb.cellOf(p[0], p[1]) / n);
      expect(row).toBe(k);
      for (let cx = 0; cx < n; cx++) fb.grid[row * n + cx] = 0.5; // the whole row
      expect(fb.read(p[0], p[1])).toBeCloseTo(0.5, 6); // no blend with the next row
    }
  });
});

describe('prev() in the synth core', () => {
  it('binds prev() to its own grid and dx/dy to one cell', () => {
    const core = new SynthCore(SR, { FL });
    expect(core.FL.prev(0, 0)).toBe(-1);
    expect(FL.prev(0, 0)).toBe(0); // the shared library stays pure
    expect(core.env.dx).toBe(2 / FEEDBACK_CELLS);
    expect(core.env.dy).toBe(2 / FEEDBACK_CELLS);
  });

  it('a feedback formula is louder and spikier than its driver alone (it is not silent)', () => {
    const driver = '0.1 * sin(440.0 * 6.283 * t) + 0.0 * x';
    const comb = tapSeconds(makeCore(`prev(x, y) * 0.9 + ${driver}`), 1).subarray(SR / 2);
    const plain = tapSeconds(makeCore(driver), 1).subarray(SR / 2);
    expect(rms(comb)).toBeGreaterThan(rms(plain) * 3);
  });

  it('plain prev(x, y) is a hold: black stays black, nothing runs away', () => {
    const core = makeCore('prev(x, y)');
    const tail = tapSeconds(core, 1).subarray(SR / 2);
    expect(rms(tail)).toBeLessThan(1e-6);
    for (const v of core.feedback.grid) expect(v).toBe(-1);
  });

  it('a runaway loop saturates at the clamp instead of exploding', () => {
    // (not `* 1.5 + 0.5`: black is a fixed point of that one — -1.5 + 0.5 = -1)
    const core = makeCore('prev(x, y) * 1.5 + 2.0');
    tapSeconds(core, 1);
    let max = -Infinity;
    for (const v of core.feedback.grid) {
      expect(Number.isFinite(v)).toBe(true);
      max = Math.max(max, v);
    }
    expect(max).toBe(1);
  });

  it('a formula without prev() never writes the grid', () => {
    const core = makeCore('sin(x * 9.0 + t * 440.0)');
    tapSeconds(core, 0.2);
    for (const v of core.feedback.grid) expect(v).toBe(-1);
  });

  it('a new formula starts from black (ADR #25)', () => {
    const core = makeCore('prev(x, y) * 0.9 + 0.3 * sin(x * 9.0)');
    tapSeconds(core, 0.5);
    expect(core.feedback.grid.some((v) => v !== -1)).toBe(true);
    const { ast } = extractParams(parse('sin(x + t)'));
    core.setFormula(compileFormula(ast), true);
    for (const v of core.feedback.grid) expect(v).toBe(-1);
  });

  it('dx and dy are heard: a term gated on dx > 0 sounds', () => {
    const gated = tapSeconds(makeCore('sin(t * 440.0 * 6.283) * (dx > 0.0) + 0.0 * x'), 1).subarray(SR / 2);
    expect(rms(gated)).toBeGreaterThan(0.1);
  });

  it('the scan path is part of the sound: Trails differs per path', () => {
    const trails = 'prev(x, y) * 0.97 + 0.06 * sin(length(x, y) * 14.0 - t * 2.0)';
    const { ast, params } = extractParams(parse(trails));
    const by = {};
    for (const path of ['lissajous', 'spiral', 'line']) {
      by[path] = computeAudioStats(ast, params, { path, freq: 110 }).pre.rms;
    }
    expect(by.lissajous).not.toBeCloseTo(by.spiral, 2);
    expect(by.lissajous).not.toBeCloseTo(by.line, 2);
  });

  it('is deterministic: two cores, one sound', () => {
    const src = 'prev(x + dx, y) - prev(x - dx, y) + 0.2 * sin(x * 9.0 + t)';
    const a = tapSeconds(makeCore(src), 0.5);
    const b = tapSeconds(makeCore(src), 0.5);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('the output stays inside the safety contract with feedback running', () => {
    const core = makeCore('prev(x, y) * 1.5 + 0.5 * sin(x * 30.0 + t * 100.0)');
    const l = new Float32Array(128);
    const r = new Float32Array(128);
    for (let b = 0; b < Math.ceil(SR / 128); b++) {
      core.process(l, r);
      for (let i = 0; i < 128; i++) {
        expect(Number.isFinite(l[i])).toBe(true);
        expect(Math.abs(l[i])).toBeLessThanOrEqual(1);
      }
    }
  });
});
