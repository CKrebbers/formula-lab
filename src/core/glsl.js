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

// 4-color pixel-art LUT (DECISIONS.md #1): dark → light, quantized.
vec3 fl_palette(float s) {
  s = clamp(s * 0.5 + 0.5, 0.0, 1.0); // formula range -1..1 → 0..1
  float idx = floor(s * 3.999);
  if (idx < 1.0) return vec3(0.059, 0.059, 0.106); // #0f0f1b
  if (idx < 2.0) return vec3(0.337, 0.353, 0.459); // #565a75
  if (idx < 3.0) return vec3(0.776, 0.718, 0.745); // #c6b7be
  return vec3(0.980, 0.984, 0.965);                // #fafbf6
}
`;

/**
 * Transpile a validated AST into a complete fragment shader.
 * Returns { fragmentSource, mode, expression, paramNames }.
 */
export function transpile(ast) {
  const check = validate(ast);
  if (!check.ok) throw new TranspileError(check.error);

  const mode = outputMode(ast);
  const expression = emit(ast, true);
  const paramNames = collectParams(ast);
  const paramUniforms = paramNames.map((n) => `uniform float u_${n};`).join('\n');

  let body;
  if (mode === 'vec3') {
    body = `  vec3 color = clamp(${expression}, 0.0, 1.0);`;
  } else if (mode === 'vec2') {
    body = [
      `  vec2 warp = ${expression};`,
      `  float v = fl_fbm(vec2(x + warp.x, y + warp.y), 4.0) * 2.0 - 1.0;`,
      `  vec3 color = fl_palette(v);`,
    ].join('\n');
  } else {
    body = [
      `  float v = ${expression};`,
      `  vec3 color = fl_palette(v);`,
    ].join('\n');
  }

  const fragmentSource = `#version 300 es
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform int u_coords; // 0 = cartesian, 1 = polar, 2 = toroidal
${paramUniforms}
out vec4 outColor;
${HELPERS}
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
  float t = u_time;
  float r = length(uv);
  float th = atan(uv.y, uv.x);
  float mx = u_mouse.x;
  float my = u_mouse.y;
  float i = gl_FragCoord.x + gl_FragCoord.y * u_resolution.x;

${body}
  outColor = vec4(color, 1.0);
}
`;

  return { fragmentSource, mode, expression, paramNames };
}
