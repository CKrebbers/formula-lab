// Audio interestingness stats for a snapshot (ADR 001 phase 3, ADR #35) — the
// sound twin of search/filter.js's visual stats, so a preset records how
// interesting image and sound are independently of each other.
// Renders offline through the SAME SynthCore the worklet runs. Pure JS, no
// DOM — testable in Node, callable at save time in the browser.
//
// Measured at TWO points, because they answer different questions:
//   pre  — after the DC chain, before the normalizer and tanh: the formula's
//          own level and crest factor. This is what a search should rank on.
//   post — what actually leaves the node. tanh flattens crest and the
//          normalizer erases level, so `post` alone would grade the limiter
//          rather than the formula.

import { compileFormula, isParametric } from '../core/js.js';
import { FL } from '../core/jsruntime.js';
import { SynthCore } from './dsp.js';
import { fft } from '../search/fft.js';

const SR = 48000;
const N = 32768;        // FFT size; analysis window after a 0.25 s settle
// longer than the chain's own warmup (one mean window, ADR #37) plus its fade
const SETTLE_S = 0.5;

/**
 * @param {object} paramAst — AST with param nodes (extractParams output)
 * @param {Record<string, number>} params
 * @param {{path: string, freq: number}|null} scan — field-mode scan settings
 * @returns {{ pre: Measurement, post: Measurement }} where Measurement is
 *   rms: level (pre: the formula's own, post: after normalization),
 *   crest: peak/rms (1.41 = a sine, higher = spiky/eventful),
 *   flatness: spectral geometric/arithmetic mean (0 = pure tones, 1 = noise).
 */
export function computeAudioStats(paramAst, params, scan = null) {
  const core = new SynthCore(SR, { FL });
  const compiled = compileFormula(paramAst);
  core.enableTap();
  core.setFormula(compiled, !compiled.isParametric);
  core.setParams(params);
  if (scan) core.setScan(scan.path, scan.freq);

  const block = new Float32Array(128);
  const r = new Float32Array(128);
  for (let b = 0; b < Math.ceil((SETTLE_S * SR) / 128); b++) core.process(block, r);

  const post = new Float64Array(N);
  const pre = new Float64Array(N);
  for (let b = 0; b < N / 128; b++) {
    core.process(block, r);
    post.set(block, b * 128);
    pre.set(core.tapL, b * 128);
  }

  return { pre: measure(pre), post: measure(post) };
}

export { isParametric };

/** rms / crest / spectral flatness of one signal. */
function measure(signal) {
  const n = signal.length;
  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const v = signal[i];
    sumSq += v * v;
    const a = Math.abs(v);
    if (a > peak) peak = a;
  }
  const rms = Math.sqrt(sumSq / n);

  const re = new Float64Array(n);
  const im = new Float64Array(n);
  // normalize before the FFT so flatness never depends on absolute level
  const scale = rms > 0 ? 1 / rms : 1;
  for (let i = 0; i < n; i++) {
    re[i] = signal[i] * scale * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))); // Hann
  }
  fft(re, im);
  let logSum = 0;
  let linSum = 0;
  const bins = n / 2 - 1;
  for (let k = 1; k <= bins; k++) {
    const p = re[k] * re[k] + im[k] * im[k] + 1e-12;
    logSum += Math.log(p);
    linSum += p;
  }
  const flatness = Math.exp(logSum / bins) / (linSum / bins);

  return {
    rms: sig(rms),
    crest: sig(rms > 1e-12 ? peak / rms : 0),
    // tonal signals sit near 1e-5: flatness needs more digits than a level
    flatness: sig(flatness),
  };
}

/** 6 significant digits — pre-normalizer levels span many orders of magnitude. */
function sig(v) {
  if (!Number.isFinite(v)) return 0;
  if (v === 0) return 0;
  return Number(v.toPrecision(6));
}
