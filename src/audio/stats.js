// Audio interestingness stats for a snapshot (ADR 001 phase 3) — the sound
// twin of search/filter.js's visual stats, so a preset records how
// interesting image and sound are independently of each other.
// Renders 1 s offline through the SAME SynthCore the worklet runs. Pure JS,
// no DOM — testable in Node, callable at save time in the browser.

import { compileFormula, isParametric } from '../core/js.js';
import { FL } from '../core/jsruntime.js';
import { SynthCore } from './dsp.js';
import { fft } from '../search/fft.js';

const SR = 48000;
const N = 32768; // FFT size; analysis window after a 0.25 s settle

/**
 * @param {object} paramAst — AST with param nodes (extractParams output)
 * @param {Record<string, number>} params
 * @param {{path: string, freq: number}|null} scan — field-mode scan settings
 * @returns {{ rms: number, crest: number, flatness: number }}
 *   rms: loudness of the normalized signal (≈0 = the formula is silence/DC),
 *   crest: peak/rms (1 ≈ static tone, high = spiky/eventful),
 *   flatness: spectral geometric/arithmetic mean (0 = pure tones, 1 = noise).
 */
export function computeAudioStats(paramAst, params, scan = null) {
  const core = new SynthCore(SR, { FL });
  const compiled = compileFormula(paramAst);
  core.setFormula(compiled, !compiled.isParametric);
  core.setParams(params);
  if (scan) core.setScan(scan.path, scan.freq);

  const block = new Float32Array(128);
  const r = new Float32Array(128);
  for (let b = 0; b < Math.ceil((0.25 * SR) / 128); b++) core.process(block, r); // settle
  const signal = new Float64Array(N);
  for (let b = 0; b < N / 128; b++) {
    core.process(block, r);
    signal.set(block, b * 128);
  }

  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < N; i++) {
    sumSq += signal[i] * signal[i];
    peak = Math.max(peak, Math.abs(signal[i]));
  }
  const rms = Math.sqrt(sumSq / N);

  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    re[i] = signal[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1))); // Hann
  }
  fft(re, im);
  let logSum = 0;
  let linSum = 0;
  const bins = N / 2 - 1;
  for (let k = 1; k <= bins; k++) {
    const p = re[k] * re[k] + im[k] * im[k] + 1e-12;
    logSum += Math.log(p);
    linSum += p;
  }
  const flatness = Math.exp(logSum / bins) / (linSum / bins);

  return {
    rms: round(rms, 1e4),
    crest: round(rms > 1e-6 ? peak / rms : 0, 1e4),
    // tonal signals sit at ~1e-5: flatness needs more digits than the rest
    flatness: round(flatness, 1e8),
  };
}

export { isParametric };

function round(v, scale) {
  return Math.round(v * scale) / scale;
}
