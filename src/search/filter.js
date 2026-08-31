// Interestingness stats + reject thresholds (§7). Pure pixel math, no DOM.
// Input: RGBA Uint8 pixels from a PALETTE-FREE render (u_raw) — the LUT would
// cap entropy at log2(4)/log2(64).

import { powerSpectrum2d } from './fft.js';

/** All §7 thresholds in one place; surfaced in a debug panel later. */
export const THRESHOLDS = {
  entropyMin: 0.15,     // below → flat
  entropyMax: 0.97,     // above AND edgy → pure noise
  edgeMax: 0.6,
  colorVarianceMin: 0.005,
  sobelThreshold: 0.35, // gradient magnitude (0..1 luminance units)
  histogramBins: 64,
};

/** RGBA pixels → luminance in 0..1. */
export function luminance(pixels, w, h) {
  const lum = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = (0.2126 * pixels[i * 4] + 0.7152 * pixels[i * 4 + 1] + 0.0722 * pixels[i * 4 + 2]) / 255;
  }
  return lum;
}

function entropyOf(lum, bins) {
  const hist = new Float64Array(bins);
  for (const v of lum) hist[Math.min(bins - 1, Math.floor(v * bins))]++;
  let h = 0;
  for (const count of hist) {
    if (count === 0) continue;
    const p = count / lum.length;
    h -= p * Math.log2(p);
  }
  return h / Math.log2(bins); // normalized 0..1
}

function edgeDensityOf(lum, w, h, threshold) {
  let edges = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -lum[i - w - 1] + lum[i - w + 1] - 2 * lum[i - 1] + 2 * lum[i + 1] - lum[i + w - 1] + lum[i + w + 1];
      const gy =
        -lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1] + lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1];
      if (Math.sqrt(gx * gx + gy * gy) > threshold) edges++;
    }
  }
  return edges / ((w - 2) * (h - 2));
}

function colorVarianceOf(pixels, w, h) {
  const n = w * h;
  let total = 0;
  for (let c = 0; c < 3; c++) {
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const v = pixels[i * 4 + c] / 255;
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / n;
    total += sumSq / n - mean * mean;
  }
  return total / 3;
}

function symmetryOf(lum, w, h) {
  let diffH = 0;
  let diffV = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      diffH += Math.abs(lum[y * w + x] - lum[y * w + (w - 1 - x)]);
      diffV += Math.abs(lum[y * w + x] - lum[(h - 1 - y) * w + x]);
    }
  }
  const n = w * h;
  return 1 - (diffH / n + diffV / n) / 2;
}

function spectralFlatnessOf(lum, w, h) {
  const power = powerSpectrum2d(lum, w, h);
  let logSum = 0;
  let sum = 0;
  let count = 0;
  for (let i = 1; i < power.length; i++) { // skip DC
    const p = power[i] + 1e-12;
    logSum += Math.log(p);
    sum += p;
    count++;
  }
  return Math.exp(logSum / count) / (sum / count);
}

/**
 * The five §4/§7 stats from one RGBA frame.
 * @param {Uint8Array|Uint8ClampedArray} pixels
 */
export function computeStats(pixels, w, h, thresholds = THRESHOLDS) {
  const lum = luminance(pixels, w, h);
  return {
    entropy: entropyOf(lum, thresholds.histogramBins),
    edge_density: edgeDensityOf(lum, w, h, thresholds.sobelThreshold),
    color_variance: colorVarianceOf(pixels, w, h),
    symmetry: symmetryOf(lum, w, h),
    spectral_flatness: spectralFlatnessOf(lum, w, h),
  };
}

/** §4: stats are the average of the t=0 and t=1 renders. */
export function averageStats(a, b) {
  const out = {};
  for (const key of Object.keys(a)) out[key] = (a[key] + b[key]) / 2;
  return out;
}

/**
 * §7 reject rules. Returns { rejected, reason }.
 * NaN shaders render flat black → caught by the entropy/variance floors
 * (uint8 readback can't see NaN directly).
 */
export function shouldReject(stats, thresholds = THRESHOLDS) {
  if (stats.entropy < thresholds.entropyMin) {
    return { rejected: true, reason: 'flat' };
  }
  if (stats.entropy > thresholds.entropyMax && stats.edge_density > thresholds.edgeMax) {
    return { rejected: true, reason: 'noise' };
  }
  if (stats.color_variance < thresholds.colorVarianceMin) {
    return { rejected: true, reason: 'no color variance' };
  }
  return { rejected: false, reason: null };
}
