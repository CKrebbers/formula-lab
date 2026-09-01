// JS twin of the GLSL helper library (core/glsl.js HELPERS) — the audio
// backend and the reference evaluator run the SAME math as the shader.
// Mirrors fl_* line for line; float64 where the GPU is float32 (see ADR 001).
//
// ZERO imports: this file is embedded verbatim into the AudioWorklet module
// (audio/synth.js concatenates it into a Blob), so it must be self-contained.

function fract(v) { return v - Math.floor(v); }
function glmod(a, b) { return a - b * Math.floor(a / b); } // GLSL mod, not JS %
function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

function hash2(px, py) {
  px = fract(px * 123.34);
  py = fract(py * 456.21);
  const d = px * (px + 45.32) + py * (py + 45.32);
  px += d;
  py += d;
  return fract(px * py);
}

function noise2(px, py) {
  const ix = Math.floor(px), iy = Math.floor(py);
  const fx = px - ix, fy = py - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy;
}

function fbm2(px, py, octaves) {
  let value = 0, amplitude = 0.5, total = 0;
  for (let o = 0; o < 8; o++) {
    if (o >= octaves) break;
    value += amplitude * noise2(px, py);
    total += amplitude;
    amplitude *= 0.5;
    px = px * 2 + 17;
    py = py * 2 + 17;
  }
  return total > 0 ? value / total : 0;
}

function worley2(px, py) {
  const ix = Math.floor(px), iy = Math.floor(py);
  const fx = px - ix, fy = py - iy;
  let d = 8;
  for (let j = -1; j <= 1; j++) {
    for (let k = -1; k <= 1; k++) {
      const qx = k + hash2(ix + k, iy + j) - fx;
      const qy = j + hash2(ix + k + 71, iy + j + 71) - fy;
      d = Math.min(d, Math.sqrt(qx * qx + qy * qy));
    }
  }
  return d;
}

// float→int32 with bytebeat-style wrap — twin of fl_i (ADR #27)
function i32(v) {
  if (!Number.isFinite(v)) return 0;
  const w = glmod(v, 4294967296);
  return (w >= 2147483648 ? w - 4294967296 : w) | 0;
}

function julia(zx, zy, cr, ci, n) {
  for (let i = 0; i < 48; i++) {
    if (i >= n) break;
    const nx = zx * zx - zy * zy + cr;
    zy = 2 * zx * zy + ci;
    zx = nx;
    const dot = zx * zx + zy * zy;
    if (dot > 16) {
      const sl = i + 1 - Math.log2(Math.max(1, Math.log2(dot) * 0.5));
      return clamp(sl / Math.max(n, 1), 0, 1);
    }
  }
  return 1;
}

function ship(zx, zy, cr, ci, n) {
  for (let i = 0; i < 48; i++) {
    if (i >= n) break;
    const ax = Math.abs(zx), ay = Math.abs(zy);
    zx = ax * ax - ay * ay + cr;
    zy = 2 * ax * ay + ci;
    const dot = zx * zx + zy * zy;
    if (dot > 16) {
      const sl = i + 1 - Math.log2(Math.max(1, Math.log2(dot) * 0.5));
      return clamp(sl / Math.max(n, 1), 0, 1);
    }
  }
  return 1;
}

function kali(px, py, cx, cy, n) {
  let acc = 0, count = 0;
  for (let i = 0; i < 24; i++) {
    if (i >= n) break;
    const ax = Math.abs(px), ay = Math.abs(py);
    const d = Math.max(ax * ax + ay * ay, 1e-6);
    px = ax / d - cx;
    py = ay / d - cy;
    acc += Math.sqrt(px * px + py * py);
    count += 1;
  }
  return count > 0 ? clamp(acc / (count * 2.5), 0, 1) : 0;
}

function orbit(zx, zy, cr, ci, n) {
  let trap = 1e9;
  for (let i = 0; i < 48; i++) {
    if (i >= n) break;
    const nx = zx * zx - zy * zy + cr;
    zy = 2 * zx * zy + ci;
    zx = nx;
    trap = Math.min(trap, Math.abs(Math.sqrt(zx * zx + zy * zy) - 0.5));
    if (zx * zx + zy * zy > 16) break;
  }
  return 1 - clamp(trap * 2, 0, 1);
}

export const FL = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  atan: Math.atan, atan2: Math.atan2,
  abs: Math.abs, floor: Math.floor, fract,
  mod: glmod, pow: Math.pow, sqrt: Math.sqrt, exp: Math.exp, log: Math.log,
  min: Math.min, max: Math.max, clamp,
  mix: (a, b, k) => a + (b - a) * k,
  step: (edge, v) => (v < edge ? 0 : 1),
  smoothstep: (e0, e1, v) => {
    const t = clamp((v - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  },
  length1: Math.abs, // length(x) == abs(x), same as the GLSL emitter
  length2: (a, b) => Math.sqrt(a * a + b * b),
  sign: (v) => Math.sign(v),
  noise: noise2, fbm: fbm2, worley: worley2, hash: hash2,
  julia, ship, kali, orbit,
  fold: (v) => Math.abs(glmod(v, 2) - 1),
  band: (a, b) => (i32(a) & i32(b)),
  bor: (a, b) => (i32(a) | i32(b)),
  bxor: (a, b) => (i32(a) ^ i32(b)),
  bnot: (a) => ~i32(a),
  shl: (a, b) => (i32(a) << (clamp(b, 0, 31) | 0)),
  shr: (a, b) => (i32(a) >> (clamp(b, 0, 31) | 0)),
  // no frame buffer exists at audio rate — prev() is 0 in this backend (ADR 001)
  prev: () => 0,
};
