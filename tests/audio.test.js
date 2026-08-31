import { describe, it, expect } from 'vitest';
import { AudioAnalysis, BANDS } from '../src/audio/analysis.js';
import { evaluate, createAutomation } from '../src/core/automate.js';

const SR = 48000;
const FFT = 2048;
const BIN_HZ = SR / FFT;

/** Byte spectrum with energy in one frequency window. */
function spectrum(loHz, hiHz, value) {
  const data = new Uint8Array(FFT / 2);
  const lo = Math.round(loHz / BIN_HZ);
  const hi = Math.round(hiHz / BIN_HZ);
  for (let i = lo; i <= hi; i++) data[i] = value;
  return data;
}

const SILENCE = new Uint8Array(FFT / 2);

describe('audio analysis', () => {
  it('silence yields ~zero everywhere', () => {
    const a = new AudioAnalysis(SR, FFT);
    let out;
    for (let t = 0; t < 1; t += 1 / 60) out = a.tick(SILENCE, t);
    expect(out.bass.level).toBeLessThan(0.01);
    expect(out.mid.level).toBeLessThan(0.01);
    expect(out.high.level).toBeLessThan(0.01);
    expect(out.bass.pulse).toBeLessThan(0.01);
  });

  it('bass energy lands in bass, not high', () => {
    const a = new AudioAnalysis(SR, FFT);
    const bassHit = spectrum(BANDS.bass[0], BANDS.bass[1], 220);
    let out;
    for (let t = 0; t < 0.5; t += 1 / 60) out = a.tick(bassHit, t);
    expect(out.bass.level).toBeGreaterThan(0.5);
    expect(out.high.level).toBeLessThan(0.05);
  });

  it('attack is fast, release is slow', () => {
    const a = new AudioAnalysis(SR, FFT);
    const loud = spectrum(BANDS.mid[0], BANDS.mid[1], 240);
    a.tick(SILENCE, 0);
    a.tick(loud, 1 / 60);
    const afterAttack = a.tick(loud, 2 / 60).mid.level;
    expect(afterAttack).toBeGreaterThan(0.3); // two frames in, already up

    let out;
    for (let t = 3 / 60; t < 0.15; t += 1 / 60) out = a.tick(SILENCE, t);
    expect(out.mid.level).toBeGreaterThan(0.2); // 100ms of silence: still ringing
    for (let t = 0.15; t < 2; t += 1 / 60) out = a.tick(SILENCE, t);
    expect(out.mid.level).toBeLessThan(0.05); // eventually lets go
  });

  it('a sudden hit spikes pulse, sustained tone does not keep it high', () => {
    const a = new AudioAnalysis(SR, FFT);
    const kick = spectrum(BANDS.bass[0], BANDS.bass[1], 250);
    for (let t = 0; t < 1; t += 1 / 60) a.tick(SILENCE, t);
    const hit = a.tick(kick, 1.0);
    expect(hit.bass.pulse).toBeGreaterThan(0.5); // onset

    let out;
    for (let t = 1.02; t < 3; t += 1 / 60) out = a.tick(kick, t); // tone sustains
    expect(out.bass.pulse).toBeLessThan(0.1); // rhythm ≠ loudness
    expect(out.bass.level).toBeGreaterThan(0.5); // hardness stays
  });
});

describe('audio automation modes', () => {
  const RANGE = { min: -2, max: 6 };
  const frame = {
    bass: { level: 0.8, pulse: 0.1 },
    mid: { level: 0.2, pulse: 0.9 },
    high: { level: 0, pulse: 0 },
    level: 0.33,
  };

  function audioAuto(mode, rate) {
    return { ...createAutomation(1, 0), mode, depth: 1, rate };
  }

  it('returns center when no audio frame is present', () => {
    expect(evaluate(audioAuto('bass', 0), RANGE, 5, null)).toBe(1);
  });

  it('focus knob morphs from hardness (level) to rhythm (pulse)', () => {
    const amp = (RANGE.max - RANGE.min) / 2; // depth 1
    const hardness = evaluate(audioAuto('mid', 0), RANGE, 5, frame); // focus 0 → level 0.2
    const rhythm = evaluate(audioAuto('mid', 2), RANGE, 5, frame);   // focus 1 → pulse 0.9
    expect(hardness).toBeCloseTo(1 + amp * 0.2, 10);
    expect(rhythm).toBeCloseTo(1 + amp * 0.9, 10);
    const mixed = evaluate(audioAuto('mid', 1), RANGE, 5, frame);    // 50/50
    expect(mixed).toBeCloseTo(1 + amp * 0.55, 10);
  });

  it('each band mode reads its own band', () => {
    expect(evaluate(audioAuto('bass', 0), RANGE, 5, frame))
      .toBeGreaterThan(evaluate(audioAuto('high', 0), RANGE, 5, frame));
  });

  it('silence sits exactly on the center', () => {
    const silent = { bass: { level: 0, pulse: 0 }, mid: { level: 0, pulse: 0 }, high: { level: 0, pulse: 0 }, level: 0 };
    expect(evaluate(audioAuto('bass', 1), RANGE, 5, silent)).toBe(1);
  });
});
