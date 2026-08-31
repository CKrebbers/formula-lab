// Small offscreen renderer for contact sheets / thumbnails.
// One GL context + one compiled shader, rendered N times with different params.

import { Renderer } from './gl.js';

// prev() formulas are single-shot here, so the feedback buffer is warmed at
// the capture's own t before reading: reset → WARM_FRAMES draws → capture.
// Deterministic (every call starts from black) and cheap at 128², and it keeps
// trail formulas visible in sheets, thumbs and the §7 stats instead of
// evaluating as flat black. See DECISIONS.md ADR #24.
const WARM_FRAMES = 6;

export class TileRenderer {
  constructor(size = 128) {
    this.size = size;
    this.canvas = document.createElement('canvas');
    this.renderer = new Renderer(this.canvas, { width: size, height: size });
  }

  setShader(fragmentSource, paramNames, usesPrev = false) {
    this.renderer.setFragmentShader(fragmentSource, paramNames, usesPrev);
  }

  /** Render once, warming the feedback buffer first when the formula needs it. */
  renderSettled(state) {
    if (this.renderer.usesPrev) {
      this.renderer.resetFeedback();
      for (let i = 0; i < WARM_FRAMES; i++) this.renderer.render(state);
    }
    this.renderer.render(state);
  }

  /**
   * Render one tile and blit it into a 2D canvas context.
   * Must draw in the same task as render() — the GL backbuffer is not preserved.
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ time: number, mouse: [number, number], params: Record<string, number>, coords?: number }} state
   */
  drawTo(ctx, state) {
    this.renderSettled(state);
    ctx.drawImage(this.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  /**
   * Render palette-free (u_raw) and read pixels back — the §7 stats input.
   * Continuous grayscale, otherwise the 4-color LUT caps entropy at 1/3.
   */
  readStats(state) {
    this.renderSettled({ ...state, raw: true });
    return this.renderer.readPixels();
  }

  /** Render and return a small PNG data URL (64×64 by default, per §4). */
  thumbnail(state, size = 64) {
    this.renderSettled(state);
    const small = document.createElement('canvas');
    small.width = size;
    small.height = size;
    small.getContext('2d').drawImage(this.canvas, 0, 0, size, size);
    return small.toDataURL('image/png');
  }
}
