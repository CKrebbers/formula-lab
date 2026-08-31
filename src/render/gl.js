// WebGL2 context, shader compile, uniforms, fullscreen quad.
// Target: WebGL2 only (2014 Radeon R9 M295X must cope). No WebGPU.

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
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false });
    if (!gl) throw new GLError('WebGL2 is not available in this browser');
    this.gl = gl;
    this.program = null;
    this.uniforms = {};
    this.vao = gl.createVertexArray();
  }

  /**
   * Compile and activate a fragment shader. On failure the previous program
   * stays active and a GLError with the shader log is thrown.
   * @param {string} fragmentSource
   * @param {string[]} paramNames — extracted constants, bound as u_<name> float uniforms
   */
  setFragmentShader(fragmentSource, paramNames = []) {
    const gl = this.gl;
    const program = linkProgram(gl, VERTEX_SOURCE, fragmentSource);
    if (this.program) gl.deleteProgram(this.program);
    this.program = program;
    this.uniforms = {
      time: gl.getUniformLocation(program, 'u_time'),
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      mouse: gl.getUniformLocation(program, 'u_mouse'),
    };
    this.paramLocations = {};
    for (const name of paramNames) {
      this.paramLocations[name] = gl.getUniformLocation(program, `u_${name}`);
    }
  }

  /** Resize the drawing buffer to match CSS size × devicePixelRatio (capped for the 2014 GPU). */
  resize() {
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
   * @param {{ time: number, mouse: [number, number], params?: Record<string, number> }} state
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
    if (state.params) {
      for (const [name, loc] of Object.entries(this.paramLocations || {})) {
        gl.uniform1f(loc, state.params[name] ?? 0);
      }
    }
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
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
