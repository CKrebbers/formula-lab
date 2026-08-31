// Minimal iterative radix-2 FFT + 2D power spectrum — just enough for
// spectral flatness (§7). Pure, no DOM.

/** In-place complex FFT; re/im length must be a power of two. */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = i + k + len / 2;
        const vRe = re[b] * curRe - im[b] * curIm;
        const vIm = re[b] * curIm + im[b] * curRe;
        re[b] = re[a] - vRe;
        im[b] = im[a] - vIm;
        re[a] += vRe;
        im[a] += vIm;
        const nRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nRe;
      }
    }
  }
}

/**
 * 2D power spectrum of a w×h (powers of two) scalar field:
 * FFT rows, then columns; returns |F|² as Float64Array(w*h).
 */
export function powerSpectrum2d(field, w, h) {
  const re = Float64Array.from(field);
  const im = new Float64Array(w * h);

  const rowRe = new Float64Array(w);
  const rowIm = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    rowRe.set(re.subarray(y * w, y * w + w));
    rowIm.set(im.subarray(y * w, y * w + w));
    fft(rowRe, rowIm);
    re.set(rowRe, y * w);
    im.set(rowIm, y * w);
  }

  const colRe = new Float64Array(h);
  const colIm = new Float64Array(h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      colRe[y] = re[y * w + x];
      colIm[y] = im[y * w + x];
    }
    fft(colRe, colIm);
    for (let y = 0; y < h; y++) {
      re[y * w + x] = colRe[y];
      im[y * w + x] = colIm[y];
    }
  }

  const power = new Float64Array(w * h);
  for (let i = 0; i < power.length; i++) power[i] = re[i] * re[i] + im[i] * im[i];
  return power;
}
