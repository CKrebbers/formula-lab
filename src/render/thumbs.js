// Decode snapshot thumbs (data URLs) into luminance histograms for novelty.
// DOM-dependent (Image + canvas); cached per snapshot id.

import { luminanceHistogram } from '../search/novelty.js';

const SIZE = 64;

export async function histogramFromDataURL(dataUrl) {
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('Failed to decode thumb'));
    img.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
  return luminanceHistogram(data, SIZE, SIZE);
}

export class HistCache {
  constructor() {
    this.map = new Map(); // snapshot id → Float64Array
  }

  /**
   * Histograms aligned 1:1 with the input snapshots (null where a thumb
   * fails to decode); stale cache entries are dropped.
   */
  async forSnapshots(snapshots) {
    const ids = new Set(snapshots.map((s) => s.id));
    for (const id of this.map.keys()) if (!ids.has(id)) this.map.delete(id);
    const out = [];
    for (const snap of snapshots) {
      if (!this.map.has(snap.id)) {
        try {
          this.map.set(snap.id, await histogramFromDataURL(snap.thumb));
        } catch {
          this.map.set(snap.id, null);
        }
      }
      out.push(this.map.get(snap.id));
    }
    return out;
  }
}
