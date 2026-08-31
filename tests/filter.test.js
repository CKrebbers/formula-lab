import { describe, it, expect } from 'vitest';
import { fft, powerSpectrum2d } from '../src/search/fft.js';
import { computeStats, shouldReject, averageStats, THRESHOLDS } from '../src/search/filter.js';
import { luminanceHistogram, histogramDistance, noveltyOf } from '../src/search/novelty.js';

const W = 32;
const H = 32;

/** Build RGBA pixels from a per-pixel gray function (0..1). */
function grayImage(fn) {
  const pixels = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = Math.round(Math.min(1, Math.max(0, fn(x, y))) * 255);
      const i = (y * W + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = v;
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

describe('fft', () => {
  it('impulse has a flat spectrum', () => {
    const re = new Float64Array(16);
    const im = new Float64Array(16);
    re[0] = 1;
    fft(re, im);
    for (let i = 0; i < 16; i++) expect(re[i]).toBeCloseTo(1, 10);
  });

  it('pure sine concentrates power in one bin pair', () => {
    const n = 64;
    const re = Float64Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 4 * i) / n));
    const im = new Float64Array(n);
    fft(re, im);
    const mags = [...re].map((r, i) => Math.hypot(r, im[i]));
    const sorted = [...mags].sort((a, b) => b - a);
    expect(mags[4]).toBeCloseTo(sorted[0], 6); // bin 4 (and its mirror) dominate
    expect(sorted[2]).toBeLessThan(1e-6);
  });

  it('powerSpectrum2d puts a constant image entirely in DC', () => {
    const power = powerSpectrum2d(new Float64Array(16 * 16).fill(0.5), 16, 16);
    expect(power[0]).toBeGreaterThan(0);
    expect(Math.max(...power.slice(1))).toBeLessThan(1e-12);
  });
});

describe('filter: stats + rejection', () => {
  it('rejects a flat image', () => {
    const stats = computeStats(grayImage(() => 0.5), W, H);
    expect(stats.entropy).toBeLessThan(0.1);
    expect(stats.symmetry).toBeCloseTo(1, 6);
    expect(shouldReject(stats)).toEqual({ rejected: true, reason: 'flat' });
  });

  it('rejects pure noise', () => {
    let seed = 1;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const stats = computeStats(grayImage(() => rnd()), W, H);
    expect(stats.entropy).toBeGreaterThan(THRESHOLDS.entropyMax);
    expect(stats.edge_density).toBeGreaterThan(THRESHOLDS.edgeMax);
    expect(shouldReject(stats).reason).toBe('noise');
  });

  it('accepts a structured image (soft rings)', () => {
    const stats = computeStats(
      grayImage((x, y) => 0.5 + 0.5 * Math.sin(Math.hypot(x - W / 2, y - H / 2) * 0.6)),
      W, H
    );
    expect(shouldReject(stats).rejected).toBe(false);
    expect(stats.entropy).toBeGreaterThan(0.15);
    expect(stats.edge_density).toBeGreaterThan(0);
  });

  it('mirror-symmetric images score near 1 on symmetry, asymmetric lower', () => {
    const symmetric = computeStats(grayImage((x) => Math.abs(x - W / 2 + 0.5) / W), W, H);
    const asymmetric = computeStats(grayImage((x, y) => ((x * 7 + y * 13) % 32) / 32), W, H);
    expect(symmetric.symmetry).toBeGreaterThan(0.95);
    expect(asymmetric.symmetry).toBeLessThan(symmetric.symmetry);
  });

  it('noise is spectrally flatter than a sine grating', () => {
    let seed = 9;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const noise = computeStats(grayImage(() => rnd()), W, H);
    const grating = computeStats(grayImage((x) => 0.5 + 0.5 * Math.sin(x * 1.2)), W, H);
    expect(noise.spectral_flatness).toBeGreaterThan(grating.spectral_flatness);
  });

  it('averageStats averages every key', () => {
    expect(averageStats({ entropy: 0.2, symmetry: 1 }, { entropy: 0.4, symmetry: 0 }))
      .toEqual({ entropy: 0.30000000000000004, symmetry: 0.5 });
  });
});

describe('novelty', () => {
  const flat = grayImage(() => 0.5);
  const gradient = grayImage((x) => x / W);

  it('identical images have zero distance', () => {
    const a = luminanceHistogram(flat, W, H);
    expect(histogramDistance(a, luminanceHistogram(flat, W, H))).toBe(0);
  });

  it('different images have positive distance', () => {
    const a = luminanceHistogram(flat, W, H);
    const b = luminanceHistogram(gradient, W, H);
    expect(histogramDistance(a, b)).toBeGreaterThan(0.1);
  });

  it('noveltyOf = min distance to archive; empty archive = 1', () => {
    const a = luminanceHistogram(flat, W, H);
    const b = luminanceHistogram(gradient, W, H);
    expect(noveltyOf(a, [])).toBe(1);
    expect(noveltyOf(a, [b, a])).toBe(0);
    expect(noveltyOf(a, [b])).toBeGreaterThan(0);
  });
});
