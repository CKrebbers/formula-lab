// AST → GLSL ES 3.0 fragment shader source.
// No DOM dependency — testable in Node.

import { validate } from './ast.js';

/**
 * Output mode is decided by the top-level node (v1 rule):
 *   call vec3(...) → 'vec3'  (direct color)
 *   call vec2(...) → 'vec2'  (displacement / domain warp on an fbm base)
 *   anything else  → 'scalar' (mapped through the palette LUT)
 * vec2/vec3 anywhere below the top level is rejected (v1 — see DECISIONS.md).
 */

export class TranspileError extends Error {}

/**
 * Palette LUTs — single source of truth for the shader AND the UI.
 * Index = u_palette uniform. 4 colors each, dark → light.
 */
export const PALETTES = [
  { id: 'hollow', colors: ['#0f0f1b', '#565a75', '#c6b7be', '#fafbf6'] },
  { id: 'gameboy', colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'] },
  { id: 'cga', colors: ['#000000', '#55ffff', '#ff55ff', '#ffffff'] },
  { id: 'amber', colors: ['#0d0802', '#4d2800', '#b36b00', '#ffb000'] },
  { id: 'fire', colors: ['#0a0006', '#5c0a2a', '#e33b18', '#ffd23e'] },
];

/** Tone mapping of the scalar before the palette: how out-of-range behaves. */
export const TONES = ['clamp', 'wrap', 'fold'];

function hexToVec3(hex) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => (v / 255).toFixed(4);
  return `vec3(${c(n >> 16)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}

const PALETTE_GLSL = `const vec3 FL_PAL[${PALETTES.length * 4}] = vec3[${PALETTES.length * 4}](
${PALETTES.map((p) => p.colors.map(hexToVec3).join(', ')).join(',\n')}
);`;

/** Format a JS number as a GLSL float literal. */
export function glslFloat(value) {
  if (!Number.isFinite(value)) throw new TranspileError(`Cannot emit non-finite number ${value}`);
  const s = String(value);
  return /[.eE]/.test(s) ? s : s + '.0';
}

function emit(node, isTopLevel = false) {
  switch (node.type) {
    case 'num':
      return glslFloat(node.value);
    case 'var':
      return node.name; // all variables are declared as floats in main()
    case 'param':
      return `u_${node.name}`; // extracted constant, driven as a uniform
    case 'neg':
      return `(-${emit(node.arg)})`;
    case 'bin':
      return emitBin(node);
    case 'call':
      return emitCall(node, isTopLevel);
    default:
      throw new TranspileError(`Unknown node type '${node.type}'`);
  }
}

function emitBin(node) {
  const l = emit(node.left);
  const r = emit(node.right);
  switch (node.op) {
    case '^':
      return `pow(${l}, ${r})`;
    case '<':
    case '>':
    case '==':
      return `float(${l} ${node.op} ${r})`; // comparisons return 0.0 / 1.0 (§5)
    case '/':
      return `(${l} / ${r})`;
    default:
      return `(${l} ${node.op} ${r})`;
  }
}

function emitCall(node, isTopLevel) {
  const args = node.args.map((a) => emit(a));
  switch (node.name) {
    case 'vec2':
    case 'vec3':
      if (!isTopLevel) {
        throw new TranspileError(`${node.name}() is only allowed at the top level of a formula (v1)`);
      }
      return `${node.name}(${args.join(', ')})`;
    case 'atan2':
      return `atan(${args[0]}, ${args[1]})`;
    case 'length':
      return args.length === 1 ? `abs(${args[0]})` : `length(vec2(${args[0]}, ${args[1]}))`;
    case 'noise':
      return `fl_noise(vec2(${args[0]}, ${args[1]}))`;
    case 'fbm':
      return `fl_fbm(vec2(${args[0]}, ${args[1]}), ${args[2]})`;
    case 'worley':
      return `fl_worley(vec2(${args[0]}, ${args[1]}))`;
    case 'hash':
      return `fl_hash(vec2(${args[0]}, ${args[1]}))`;
    case 'julia':
    case 'ship':
    case 'kali':
    case 'orbit':
    case 'fold':
    case 'prev':
      return `fl_${node.name}(${args.join(', ')})`;
    default:
      return `${node.name}(${args.join(', ')})`;
  }
}

/** Collect param names in order of appearance (depth-first, left-to-right). */
export function collectParams(node, out = []) {
  switch (node.type) {
    case 'param':
      if (!out.includes(node.name)) out.push(node.name);
      break;
    case 'neg':
      collectParams(node.arg, out);
      break;
    case 'bin':
      collectParams(node.left, out);
      collectParams(node.right, out);
      break;
    case 'call':
      node.args.forEach((a) => collectParams(a, out));
      break;
  }
  return out;
}

/** Does this AST sample the previous frame? Decides the feedback path. */
export function usesPrev(node) {
  switch (node.type) {
    case 'neg':
      return usesPrev(node.arg);
    case 'bin':
      return usesPrev(node.left) || usesPrev(node.right);
    case 'call':
      return node.name === 'prev' || node.args.some(usesPrev);
    default:
      return false;
  }
}

/** Detect output mode from the top-level node. */
export function outputMode(ast) {
  if (ast.type === 'call' && (ast.name === 'vec2' || ast.name === 'vec3')) return ast.name;
  return 'scalar';
}

const HELPERS = /* glsl */ `
float fl_hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float fl_noise(vec2 p) {
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  vec2 u = fp * fp * (3.0 - 2.0 * fp);
  float a = fl_hash(ip);
  float b = fl_hash(ip + vec2(1.0, 0.0));
  float c = fl_hash(ip + vec2(0.0, 1.0));
  float d = fl_hash(ip + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fl_fbm(vec2 p, float octaves) {
  float value = 0.0;
  float amplitude = 0.5;
  float total = 0.0;
  for (int o = 0; o < 8; o++) {
    if (float(o) >= octaves) break;
    value += amplitude * fl_noise(p);
    total += amplitude;
    amplitude *= 0.5;
    p = p * 2.0 + 17.0;
  }
  return total > 0.0 ? value / total : 0.0;
}

float fl_worley(vec2 p) {
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  float d = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int k = -1; k <= 1; k++) {
      vec2 cell = vec2(float(k), float(j));
      vec2 point = cell + vec2(
        fl_hash(ip + cell),
        fl_hash(ip + cell + 71.0)
      );
      d = min(d, length(point - fp));
    }
  }
  return d;
}

float fl_fold(float v) {
  return abs(mod(v, 2.0) - 1.0);
}

// Iterated maps — the pattern-breakers. n is a runtime float like fbm's
// octaves: capped loops with early break. All return roughly 0..1.

float fl_julia(float zx, float zy, float cr, float ci, float n) {
  vec2 z = vec2(zx, zy);
  vec2 c = vec2(cr, ci);
  for (int i = 0; i < 48; i++) {
    if (float(i) >= n) break;
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    if (dot(z, z) > 16.0) {
      float sl = float(i) + 1.0 - log2(max(1.0, log2(dot(z, z)) * 0.5));
      return clamp(sl / max(n, 1.0), 0.0, 1.0);
    }
  }
  return 1.0;
}

float fl_ship(float zx, float zy, float cr, float ci, float n) {
  vec2 z = vec2(zx, zy);
  vec2 c = vec2(cr, ci);
  for (int i = 0; i < 48; i++) {
    if (float(i) >= n) break;
    z = vec2(abs(z.x), abs(z.y));
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    if (dot(z, z) > 16.0) {
      float sl = float(i) + 1.0 - log2(max(1.0, log2(dot(z, z)) * 0.5));
      return clamp(sl / max(n, 1.0), 0.0, 1.0);
    }
  }
  return 1.0;
}

float fl_kali(float px, float py, float cx, float cy, float n) {
  vec2 p = vec2(px, py);
  vec2 c = vec2(cx, cy);
  float acc = 0.0;
  float count = 0.0;
  for (int i = 0; i < 24; i++) {
    if (float(i) >= n) break;
    p = abs(p) / max(dot(p, p), 1e-6) - c;
    acc += length(p);
    count += 1.0;
  }
  return count > 0.0 ? clamp(acc / (count * 2.5), 0.0, 1.0) : 0.0;
}

float fl_orbit(float zx, float zy, float cr, float ci, float n) {
  vec2 z = vec2(zx, zy);
  vec2 c = vec2(cr, ci);
  float trap = 1e9;
  for (int i = 0; i < 48; i++) {
    if (float(i) >= n) break;
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    trap = min(trap, abs(length(z) - 0.5));
    if (dot(z, z) > 16.0) break;
  }
  return 1.0 - clamp(trap * 2.0, 0.0, 1.0);
}

${PALETTE_GLSL}

// Palette mapping (DECISIONS.md #1, extended): u_tone decides how the raw
// scalar behaves outside -1..1 (clamp = plateaus, wrap = repeating bands,
// fold = mirrored bands), u_palette picks the LUT, u_smooth interpolates.
vec3 fl_palette(float v) {
  float raw = v * 0.5 + 0.5;
  float s = (u_tone == 1) ? fract(raw)
          : (u_tone == 2) ? 1.0 - abs(mod(raw, 2.0) - 1.0)
          : clamp(raw, 0.0, 1.0);
  int base = u_palette * 4;
  if (u_smooth == 1) {
    float pos = min(s * 3.0, 2.999);
    int seg = int(floor(pos));
    return mix(FL_PAL[base + seg], FL_PAL[base + seg + 1], fract(pos));
  }
  return FL_PAL[base + int(floor(min(s, 0.999) * 4.0))];
}
`;

/**
 * prev(x, y) — previous frame. Only emitted when the formula uses it, so
 * every existing formula compiles to exactly the shader it did before.
 *
 * The UV mapping inverts the `uv` line in main(), so prev() reads the same
 * aspect-corrected space the formula's x/y live in. It reads the ALPHA
 * channel, where the feedback pass stored the previous frame's continuous
 * scalar (see feedback.js / ADR #23) — sampling the visible RGB would run the
 * signal through the 4-color palette quantizer and collapse in two frames.
 * Range is the usual -1..1; an empty buffer reads -1 (black).
 */
const PREV_HELPER = /* glsl */ `
float fl_prev(float px, float py) {
  vec2 uv = (vec2(px, py) * min(u_resolution.x, u_resolution.y) + u_resolution)
          / (2.0 * u_resolution);
  return texture(u_prev, uv).a * 2.0 - 1.0;
}
`;

/**
 * Transpile a validated AST into a complete fragment shader.
 * Returns { fragmentSource, mode, expression, paramNames, usesPrev }.
 */
export function transpile(ast) {
  const check = validate(ast);
  if (!check.ok) throw new TranspileError(check.error);

  const mode = outputMode(ast);
  const expression = emit(ast, true);
  const paramNames = collectParams(ast);
  const paramUniforms = paramNames.map((n) => `uniform float u_${n};`).join('\n');
  const needsPrev = usesPrev(ast);
  const prevUniform = needsPrev ? 'uniform sampler2D u_prev;\n' : '';
  const prevHelper = needsPrev ? PREV_HELPER : '';
  // Alpha carries the continuous scalar for the next frame's prev() — clamped
  // because the buffer is 8-bit. vec3 mode has no scalar, so it feeds back its
  // own luminance. Without prev() the alpha stays 1.0 and the shader is
  // byte-for-byte what it was before feedback existed.
  const feedbackAlpha = !needsPrev
    ? '1.0'
    : mode === 'vec3'
      ? 'clamp(dot(color, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0)'
      : 'clamp(v * 0.5 + 0.5, 0.0, 1.0)';

  let body;
  if (mode === 'vec3') {
    body = `  vec3 color = clamp(${expression}, 0.0, 1.0);`;
  } else if (mode === 'vec2') {
    body = [
      `  vec2 warp = ${expression};`,
      `  float v = fl_fbm(vec2(x + warp.x, y + warp.y), 4.0) * 2.0 - 1.0;`,
      `  vec3 color = (u_raw == 1) ? vec3(clamp(v * 0.5 + 0.5, 0.0, 1.0)) : fl_palette(v);`,
    ].join('\n');
  } else {
    body = [
      `  float v = ${expression};`,
      `  vec3 color = (u_raw == 1) ? vec3(clamp(v * 0.5 + 0.5, 0.0, 1.0)) : fl_palette(v);`,
    ].join('\n');
  }

  const fragmentSource = `#version 300 es
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform int u_coords;  // 0 = cartesian, 1 = polar, 2 = toroidal
uniform int u_raw;     // 1 = skip the palette LUT (continuous grayscale, for stats)
uniform int u_palette; // LUT index (see PALETTES)
uniform int u_smooth;  // 0 = quantized pixel-art steps, 1 = interpolated
uniform int u_tone;    // 0 = clamp, 1 = wrap, 2 = fold
${prevUniform}${paramUniforms}
out vec4 outColor;
${HELPERS}${prevHelper}
void main() {
  vec2 uv = (2.0 * gl_FragCoord.xy - u_resolution) / min(u_resolution.x, u_resolution.y);
  vec2 p = uv;
  if (u_coords == 1) {
    p = vec2(length(uv), atan(uv.y, uv.x) * 0.3183098861837907); // (r, th/pi)
  } else if (u_coords == 2) {
    p = vec2(sin(3.141592653589793 * uv.x), sin(3.141592653589793 * uv.y)); // seamless wrap
  }
  float x = p.x;
  float y = p.y;
  // one screen pixel in the pre-remap uv space (see ADR #26): the step for
  // neighbour sampling — prev(x + dx, y) - prev(x - dx, y) and friends
  float dx = 2.0 / min(u_resolution.x, u_resolution.y);
  float dy = dx;
  float t = u_time;
  float r = length(uv);
  float th = atan(uv.y, uv.x);
  float mx = u_mouse.x;
  float my = u_mouse.y;
  float i = gl_FragCoord.x + gl_FragCoord.y * u_resolution.x;

${body}
  outColor = vec4(color, ${feedbackAlpha});
}
`;

  return { fragmentSource, mode, expression, paramNames, usesPrev: needsPrev };
}
