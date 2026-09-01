// Aliasing (ADR 001): a hard-edged formula rendered WITH 4× oversampling must
// drop the energy in the mirrored bands by at least 20 dB compared to naive
// sample-rate evaluation. Uses the existing radix-2 FFT from search/fft.js.

import { describe, it, expect } from 'vitest';
import { parse } from '../src/core/parser.js';
import { compileFormula } from '../src/core/js.js';
import { FL } from '../src/core/jsruntime.js';
import { SynthCore } from '../src/audio/dsp.js';
import { fft } from '../src/search/fft.js';

const SR = 48000;
const N = 65536;
const F0 = 5001; // odd harmonics at 15003 (legit), 25005 → 22995, 35007 → 12993

function renderSpectrum(oversample) {
  const core = new SynthCore(SR, { FL, oversample });
  core.setFormula(compileFormula(parse(`sign(sin(${(F0 * 2 * Math.PI).toFixed(4)} * t))`)));
  const block = new Float32Array(128);
  const r = new Float32Array(128);
  // warm up: normalizer and filters settle
  for (let b = 0; b < Math.ceil((0.5 * SR) / 128); b++) core.process(block, r);
  const signal = new Float64Array(N);
  for (let b = 0; b < N / 128; b++) {
    core.process(block, r);
    signal.set(block, b * 128);
  }
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)); // Hann
    re[i] = signal[i] * w;
  }
  fft(re, im);
  return { re, im };
}

function bandEnergy({ re, im }, freq, halfWidth = 60) {
  const binHz = SR / N;
  const lo = Math.max(1, Math.floor((freq - halfWidth) / binHz));
  const hi = Math.min(N / 2 - 1, Math.ceil((freq + halfWidth) / binHz));
  let e = 0;
  for (let k = lo; k <= hi; k++) e += re[k] * re[k] + im[k] * im[k];
  return e;
}

describe('4× oversampling vs naive evaluation', () => {
  it('mirrored-band energy drops by at least 20 dB', () => {
    const naive = renderSpectrum(1);
    const os4 = renderSpectrum(4);

    // normalize against each run's own fundamental, so chain gain cancels out
    const fundNaive = bandEnergy(naive, F0);
    const fundOs4 = bandEnergy(os4, F0);
    expect(fundNaive).toBeGreaterThan(0);
    expect(fundOs4).toBeGreaterThan(0);

    const aliasBands = [22995, 12993]; // 25005 and 35007 folded around Nyquist
    let ratioNaive = 0;
    let ratioOs4 = 0;
    for (const f of aliasBands) {
      ratioNaive += bandEnergy(naive, f) / fundNaive;
      ratioOs4 += bandEnergy(os4, f) / fundOs4;
    }
    const dropDb = 10 * Math.log10(ratioNaive / ratioOs4);
    expect(dropDb).toBeGreaterThanOrEqual(20);
  });

  it('the legitimate harmonic at 15 kHz survives oversampling', () => {
    const os4 = renderSpectrum(4);
    const fund = bandEnergy(os4, F0);
    const h3 = bandEnergy(os4, 3 * F0);
    // square wave: 3rd harmonic ≈ fund/9; allow generous slack for the chain
    expect(h3 / fund).toBeGreaterThan(0.01);
  });
});
