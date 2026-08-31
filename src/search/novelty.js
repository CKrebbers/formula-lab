// Novelty-lite (§7): a candidate's novelty = min L2 distance between its
// luminance histogram and those of all archived thumbs. Pure, no DOM.

import { luminance } from './filter.js';

export const NOVELTY_BINS = 64;

/** RGBA pixels → normalized luminance histogram (sums to 1). */
export function luminanceHistogram(pixels, w, h, bins = NOVELTY_BINS) {
  const lum = luminance(pixels, w, h);
  const hist = new Float64Array(bins);
  for (const v of lum) hist[Math.min(bins - 1, Math.floor(v * bins))]++;
  for (let i = 0; i < bins; i++) hist[i] /= lum.length;
  return hist;
}

/** Euclidean distance between two histograms. */
export function histogramDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Min distance to the archive; an empty archive means everything is novel (1).
 * @param {Float64Array} hist
 * @param {Float64Array[]} archiveHists
 */
export function noveltyOf(hist, archiveHists) {
  if (!archiveHists.length) return 1;
  let min = Infinity;
  for (const other of archiveHists) {
    const d = histogramDistance(hist, other);
    if (d < min) min = d;
  }
  return min;
}
