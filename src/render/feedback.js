// Previous-frame buffer for prev(x, y) — the feedback path.
//
// Ping-pong: the scene is drawn into an offscreen texture (reading the other
// one as u_prev), then blitted to the canvas, then the two swap. Two textures
// are needed because a texture cannot be read and written in the same pass.
//
// The textures carry the formula's CONTINUOUS scalar in the alpha channel, not
// just the visible color: feeding back the palette-mapped RGB would put the
// signal through a 4-color quantizer, which collapses to a fixed point within
// two frames and makes trails impossible. See DECISIONS.md ADR #22/#23.

export class FeedbackBuffer {
  /** @param {WebGL2RenderingContext} gl */
  constructor(gl) {
    this.gl = gl;
    this.fbo = null;
    this.textures = [null, null];
    this.read = 0; // index of the texture holding the previous frame
    this.width = 0;
    this.height = 0;
  }

  /**
   * Allocate (or reallocate) to match the drawing buffer. Reallocation zeroes
   * both textures — WebGL guarantees null-initialized storage is zero — so a
   * resize implicitly resets the feedback, which is the documented behaviour.
   * @returns {boolean} true when the storage was (re)created
   */
  ensureSize(width, height) {
    const gl = this.gl;
    if (this.fbo && this.width === width && this.height === height) return false;
    this.fbo ??= gl.createFramebuffer();
    this.width = width;
    this.height = height;
    for (let i = 0; i < 2; i++) {
      if (!this.textures[i]) {
        this.textures[i] = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.textures[i]);
        // bilinear; clamp so prev() outside the frame reads the edge texel
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      } else {
        gl.bindTexture(gl.TEXTURE_2D, this.textures[i]);
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    return true;
  }

  /** Wipe to black — first frame, formula change, display crossfade start. */
  reset() {
    if (!this.fbo) return;
    const gl = this.gl;
    for (const texture of this.textures) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0,
        gl.RGBA, gl.UNSIGNED_BYTE, null
      );
    }
  }

  /** Bind the previous frame for sampling as u_prev. */
  bindPrevious(unit = 0) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[this.read]);
  }

  /** Direct the next draw into the write texture. */
  bindWrite() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D,
      this.textures[1 - this.read], 0
    );
    gl.viewport(0, 0, this.width, this.height);
  }

  /** Blit the drawn frame to the canvas and make it the new previous frame. */
  present() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(
      0, 0, this.width, this.height,
      0, 0, this.width, this.height,
      gl.COLOR_BUFFER_BIT, gl.NEAREST
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.read = 1 - this.read;
  }

  dispose() {
    const gl = this.gl;
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    for (const texture of this.textures) if (texture) gl.deleteTexture(texture);
    this.fbo = null;
    this.textures = [null, null];
    this.width = 0;
    this.height = 0;
  }
}
