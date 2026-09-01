// WebGL2 context, shader compile, uniforms, fullscreen quad.
// Target: WebGL2 only (2014 Radeon R9 M295X must cope). No WebGPU.

import { FeedbackBuffer } from './feedback.js';

const VERTEX_SOURCE = `#version 300 es
void main() {
  // Single oversized triangle covering the viewport — no vertex buffer needed.
  vec2 pos = vec2(
    gl_VertexID == 1 ? 3.0 : -1.0,
    gl_VertexID == 2 ? 3.0 : -1.0
  );
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

export class GLError extends Error {}

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{width?: number, height?: number}} opts — pass a fixed size for
   *   offscreen use (tiles); otherwise the buffer tracks CSS size × DPR.
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.fixedSize = !!(opts.width && opts.height);
    if (this.fixedSize) {
      canvas.width = opts.width;
      canvas.height = opts.height;
    }
    // alpha: false — the feedback path writes the formula's continuous scalar
    // into outColor.a, which must never reach compositing (see feedback.js)
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      preserveDrawingBuffer: false,
      alpha: false,
    });
    if (!gl) throw new GLError('WebGL2 is not available in this browser');
    this.gl = gl;
    this.program = null;
    this.uniforms = {};
    this.vao = gl.createVertexArray();
    this.usesPrev = false;
    this.feedback = null; // allocated lazily, only for formulas that use prev()
    this.camSource = null;   // <video> from input/camera.js, or null
    this.camTexture = null;  // lazily: 1×1 mid-gray until a frame is uploaded
    this.camUploadedTime = -1;
  }

  /** Point cam() at a playing <video> (null = camera off → mid-gray). */
  setCameraSource(video) {
    this.camSource = video;
    this.camUploadedTime = -1;
    if (!video && this.camTexture) this.fillCamGray();
  }

  /**
   * Compile and activate a fragment shader. On failure the previous program
   * stays active and a GLError with the shader log is thrown.
   * @param {string} fragmentSource
   * @param {string[]} paramNames — extracted constants, bound as u_<name> float uniforms
   * @param {boolean} usesPrev — formula samples the previous frame (transpile())
   */
  setFragmentShader(fragmentSource, paramNames = [], usesPrev = false) {
    const gl = this.gl;
    const program = linkProgram(gl, VERTEX_SOURCE, fragmentSource);
    if (this.program) gl.deleteProgram(this.program);
    this.program = program;
    this.usesPrev = usesPrev;
    this.resetFeedback(); // a new formula never inherits the old image
    this.uniforms = {
      time: gl.getUniformLocation(program, 'u_time'),
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      mouse: gl.getUniformLocation(program, 'u_mouse'),
      coords: gl.getUniformLocation(program, 'u_coords'),
      raw: gl.getUniformLocation(program, 'u_raw'),
      palette: gl.getUniformLocation(program, 'u_palette'),
      smooth: gl.getUniformLocation(program, 'u_smooth'),
      tone: gl.getUniformLocation(program, 'u_tone'),
      prev: gl.getUniformLocation(program, 'u_prev'),
      cam: gl.getUniformLocation(program, 'u_cam'),
      camFit: gl.getUniformLocation(program, 'u_cam_fit'),
      mot: gl.getUniformLocation(program, 'u_mot'),
    };
    this.paramLocations = {};
    for (const name of paramNames) {
      this.paramLocations[name] = gl.getUniformLocation(program, `u_${name}`);
    }
  }

  /** Wipe the previous-frame buffer to black (formula change, crossfade start). */
  resetFeedback() {
    this.feedback?.reset();
  }

  /** Resize the drawing buffer to match CSS size × devicePixelRatio (capped for the 2014 GPU). */
  resize() {
    if (this.fixedSize) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.floor(this.canvas.clientWidth * dpr);
    const height = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  /**
   * Draw one frame.
   * @param {{ time: number, mouse: [number, number], params?: Record<string, number>, coords?: number }} state
   */
  render(state) {
    const gl = this.gl;
    if (!this.program) return;
    this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    gl.uniform1f(this.uniforms.time, state.time);
    gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.uniforms.mouse, state.mouse[0], state.mouse[1]);
    gl.uniform1i(this.uniforms.coords, state.coords ?? 0);
    gl.uniform1i(this.uniforms.raw, state.raw ? 1 : 0);
    gl.uniform1i(this.uniforms.palette, state.palette ?? 0);
    gl.uniform1i(this.uniforms.smooth, state.smooth ? 1 : 0);
    gl.uniform1i(this.uniforms.tone, state.tone ?? 0);
    if (this.uniforms.mot) gl.uniform1f(this.uniforms.mot, state.mot ?? 0);
    if (this.uniforms.cam) this.bindCamera();
    if (state.params) {
      for (const [name, loc] of Object.entries(this.paramLocations || {})) {
        gl.uniform1f(loc, state.params[name] ?? 0);
      }
    }
    gl.bindVertexArray(this.vao);

    if (!this.usesPrev) {
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return;
    }
    // feedback path: draw offscreen while sampling the previous frame, then
    // blit to the canvas and swap. A size change reallocates = implicit reset.
    this.feedback ??= new FeedbackBuffer(gl);
    this.feedback.ensureSize(this.canvas.width, this.canvas.height);
    this.feedback.bindPrevious(0);
    gl.uniform1i(this.uniforms.prev, 0);
    this.feedback.bindWrite();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.feedback.present();
  }

  /**
   * Bind the camera texture on unit 1 (unit 0 belongs to the feedback pass),
   * uploading the current video frame once per new frame. Without a source
   * the texture is 1×1 mid-gray, so cam() reads 0 everywhere (ADR #41).
   */
  bindCamera() {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    if (!this.camTexture) {
      this.camTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.camTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.fillCamGray();
    } else {
      gl.bindTexture(gl.TEXTURE_2D, this.camTexture);
    }
    const v = this.camSource;
    let fit = [1, 1];
    if (v && v.readyState >= 2 && v.videoWidth > 0) {
      if (v.currentTime !== this.camUploadedTime) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
        this.camUploadedTime = v.currentTime;
      }
      // cover-fit: crop the camera to the canvas aspect instead of stretching
      const ca = this.canvas.width / this.canvas.height;
      const va = v.videoWidth / v.videoHeight;
      fit = va > ca ? [ca / va, 1] : [1, va / ca];
    }
    gl.uniform1i(this.uniforms.cam, 1);
    gl.uniform2f(this.uniforms.camFit, fit[0], fit[1]);
    gl.activeTexture(gl.TEXTURE0);
  }

  fillCamGray() {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.camTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([128, 128, 128, 255]));
    gl.activeTexture(gl.TEXTURE0);
  }

  /** Read the just-rendered frame back (call in the same task as render()). */
  readPixels() {
    const gl = this.gl;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return { pixels, width, height };
  }
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new GLError(`Shader compile failed:\n${log}`);
  }
  return shader;
}

function linkProgram(gl, vertexSource, fragmentSource) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new GLError(`Program link failed:\n${log}`);
  }
  return program;
}
