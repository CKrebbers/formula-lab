// 3×3 contact sheet: the current formula in the center, 8 const_tweak
// variants around it. Click a tile to promote its params to the main view.

import { constTweak } from '../search/mutate.js';

const GRID = 9;
const CENTER = 4;

export class ContactSheet {
  /**
   * @param {HTMLElement} container
   * @param {(params: Record<string, number>) => void} onPromote
   */
  constructor(container, onPromote) {
    this.container = container;
    this.onPromote = onPromote;
  }

  clear() {
    this.container.textContent = '';
  }

  /**
   * @param {import('../render/tile.js').TileRenderer} tileRenderer
   * @param {Record<string, number>} baseParams
   * @param {Record<string, boolean>} locks
   * @param {{ time: number, mouse: [number, number], coords?: number }} state
   */
  generate(tileRenderer, baseParams, locks, state) {
    this.clear();
    for (let i = 0; i < GRID; i++) {
      const isOriginal = i === CENTER;
      const params = isOriginal
        ? { ...baseParams }
        : constTweak(baseParams, Math.random, { locks });

      const canvas = document.createElement('canvas');
      canvas.width = tileRenderer.size;
      canvas.height = tileRenderer.size;
      canvas.className = isOriginal ? 'tile original' : 'tile';
      canvas.title = isOriginal ? 'original' : 'click to promote';

      const ctx = canvas.getContext('2d');
      tileRenderer.drawTo(ctx, { ...state, params });

      if (!isOriginal) {
        canvas.addEventListener('click', () => this.onPromote(params));
      }
      this.container.appendChild(canvas);
    }
  }
}
