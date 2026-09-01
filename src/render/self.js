// Self-stats probe for s_ent / s_sym — a formula reading its own previous
// frame's §7 stats (ADR #43).
//
// Every frame the renderer draws the SAME formula with the SAME inputs once
// more at 128², palette-free (u_raw), into this probe, reads it back and
// computes entropy + symmetry with the §7 code (search/filter.js). Those two
// numbers are the uniforms of the NEXT frame: previous-frame stats, one frame
// of lag, exactly like prev(). The main draw is never read back — a 128² draw
// plus a 64 kB readPixels is what the §7 tiles already cost, and the readback
// stalls only on this tiny draw because it runs before the main one.
//
// The probe is square like the §7 tiles, so the stats are in §7 units: a
// square 128² render of the formula, prev() sampling the live feedback buffer
// through the same normalized uv as the main draw.

import { computeSelfStats } from '../search/filter.js';
import { SELF_VARS } from '../core/ast.js';

export const PROBE_SIZE = 128;

export class SelfProbe {
  /** @param {WebGL2RenderingContext} gl */
  constructor(gl) {
    this.gl = gl;
    this.size = PROBE_SIZE;
    this.pixels = new Uint8Array(this.size * this.size * 4);
    this.values = { ...SELF_VARS }; // what the next draw reads as s_ent / s_sym
    this.fbo = gl.createFramebuffer();
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.size, this.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Back to the black-frame stats — formula change, resize, crossfade start. */
  reset() {
    this.values = { ...SELF_VARS };
  }

  /**
   * Run `draw` (the caller has set u_resolution = PROBE_SIZE² and u_raw = 1)
   * into the probe, read it back and measure. Returns the new values, which
   * are also stored for the next frame's uniforms.
   */
  measure(draw) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.size, this.size);
    draw();
    gl.readPixels(0, 0, this.size, this.size, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const s = computeSelfStats(this.pixels, this.size, this.size);
    this.values = { s_ent: s.entropy, s_sym: s.symmetry };
    return this.values;
  }

  dispose() {
    const gl = this.gl;
    gl.deleteFramebuffer(this.fbo);
    gl.deleteTexture(this.texture);
    this.fbo = null;
    this.texture = null;
  }
}
