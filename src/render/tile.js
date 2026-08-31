// Small offscreen renderer for contact sheets / thumbnails.
// One GL context + one compiled shader, rendered N times with different params.

import { Renderer } from './gl.js';

export class TileRenderer {
  constructor(size = 128) {
    this.size = size;
    this.canvas = document.createElement('canvas');
    this.renderer = new Renderer(this.canvas, { width: size, height: size });
  }

  setShader(fragmentSource, paramNames) {
    this.renderer.setFragmentShader(fragmentSource, paramNames);
  }

  /**
   * Render one tile and blit it into a 2D canvas context.
   * Must draw in the same task as render() — the GL backbuffer is not preserved.
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ time: number, mouse: [number, number], params: Record<string, number>, coords?: number }} state
   */
  drawTo(ctx, state) {
    this.renderer.render(state);
    ctx.drawImage(this.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  /**
   * Render palette-free (u_raw) and read pixels back — the §7 stats input.
   * Continuous grayscale, otherwise the 4-color LUT caps entropy at 1/3.
   */
  readStats(state) {
    this.renderer.render({ ...state, raw: true });
    return this.renderer.readPixels();
  }

  /** Render and return a small PNG data URL (64×64 by default, per §4). */
  thumbnail(state, size = 64) {
    this.renderer.render(state);
    const small = document.createElement('canvas');
    small.width = size;
    small.height = size;
    small.getContext('2d').drawImage(this.canvas, 0, 0, size, size);
    return small.toDataURL('image/png');
  }
}
