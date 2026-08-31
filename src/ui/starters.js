// Starters strip: labelled thumbnails that load a working image in one click.
// Thumbnails are rendered after boot (never on the critical path) through the
// shared tile renderer, which is restored to the panel's shader afterwards.

import { STARTERS } from '../families/starters.js';
import { parse } from '../core/parser.js';
import { transpile } from '../core/glsl.js';
import { extractParams } from '../core/constants.js';

const COORD_NAMES = ['cartesian', 'polar', 'toroidal'];

export class StartersStrip {
  /**
   * @param {HTMLElement} container
   * @param {(starter: object) => void} onPick
   */
  constructor(container, onPick) {
    this.container = container;
    this.onPick = onPick;
    this.cells = [];
    this.build();
  }

  build() {
    this.container.textContent = '';
    for (const starter of STARTERS) {
      const button = document.createElement('button');
      button.className = 'starter';
      button.title = starter.source;

      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;

      const label = document.createElement('span');
      label.textContent = starter.label;

      button.append(canvas, label);
      button.addEventListener('click', () => this.onPick(starter));
      this.container.appendChild(button);
      this.cells.push({ starter, canvas });
    }
  }

  /**
   * Draw the thumbnails. Call once after the first paint — it compiles a
   * shader per starter, which is not something to do while booting.
   * @param {import('../render/tile.js').TileRenderer} tileRenderer
   * @param {{fragmentSource: string, paramNames: string[], usesPrev: boolean}|null} restoreShader
   */
  renderThumbs(tileRenderer, restoreShader) {
    for (const { starter, canvas } of this.cells) {
      try {
        const { ast, params } = extractParams(parse(starter.source));
        const compiled = transpile(ast);
        tileRenderer.setShader(compiled.fragmentSource, compiled.paramNames, compiled.usesPrev);
        tileRenderer.drawTo(canvas.getContext('2d'), {
          time: 1.2,
          mouse: [0, 0],
          params,
          coords: Math.max(0, COORD_NAMES.indexOf(starter.coords)),
          palette: starter.palette,
          smooth: starter.smooth,
          tone: starter.tone,
        });
      } catch {
        continue; // a broken starter just stays blank; never break boot
      }
    }
    if (restoreShader) {
      tileRenderer.setShader(
        restoreShader.fragmentSource, restoreShader.paramNames, restoreShader.usesPrev);
    }
  }
}
