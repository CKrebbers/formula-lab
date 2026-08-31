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
}
