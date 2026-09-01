// AST → JS function body — the audio twin of core/glsl.js (ADR 001).
// The emitted body runs against the FL helper library (core/jsruntime.js),
// on the main thread (scope plot, tests) and inside the AudioWorklet
// (posted as a string, compiled there with new Function).
//
// new Function here never sees user text: only code generated from an AST
// that already passed the parser/validator whitelist — the "never eval"
// rule from §5 holds.

import { validate } from './ast.js';
import { outputMode } from './glsl.js';

export class JsEmitError extends Error {}

function emit(node, isTopLevel = false) {
  switch (node.type) {
    case 'num': {
      if (!Number.isFinite(node.value)) throw new JsEmitError(`Cannot emit non-finite number ${node.value}`);
      return `(${String(node.value)})`;
    }
    case 'var':
      // live inputs are optional in env: an older caller without them hears 0
      return node.name === 'mot' ? '(env.mot || 0)' : `env.${node.name}`;
    case 'param':
      return `(P.${node.name} ?? 0)`;
    case 'neg':
      return `(-${emit(node.arg)})`;
    case 'bin':
      return emitBin(node);
    case 'call':
      return emitCall(node, isTopLevel);
    default:
      throw new JsEmitError(`Unknown node type '${node.type}'`);
  }
}

function emitBin(node) {
  const l = emit(node.left);
  const r = emit(node.right);
  switch (node.op) {
    case '^':
      return `FL.pow(${l}, ${r})`;
    case '<':
    case '>':
    case '==':
      return `((${l} ${node.op === '==' ? '===' : node.op} ${r}) ? 1 : 0)`;
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
        throw new JsEmitError(`${node.name}() is only allowed at the top level of a formula (v1)`);
      }
      return args; // handled by the body builder below
    case 'length':
      return args.length === 1 ? `FL.length1(${args[0]})` : `FL.length2(${args[0]}, ${args[1]})`;
    default:
      return `FL.${node.name}(${args.join(', ')})`;
  }
}

/**
 * Terms that exist in the shader but evaluate to 0 in the audio backend
 * (ADR #38): there is no frame buffer at 48 kHz and no screen pixel to step
 * by. The same formula therefore does something different in the two
 * backends — an acceptable limit, but not a silent one, so the emitter
 * reports it and the UI and the saved measurement carry it.
 */
const AUDIO_SILENT_VARS = ['dx', 'dy'];
const AUDIO_SILENT_CALLS = ['prev', 'cam']; // no frame buffer, no camera texture at audio rate

/** @returns {string[]} sorted names of this formula's audio-silent terms. */
export function audioSilentTerms(node, found = new Set()) {
  switch (node?.type) {
    case 'var':
      if (AUDIO_SILENT_VARS.includes(node.name)) found.add(node.name);
      break;
    case 'neg':
      audioSilentTerms(node.arg, found);
      break;
    case 'bin':
      audioSilentTerms(node.left, found);
      audioSilentTerms(node.right, found);
      break;
    case 'call':
      if (AUDIO_SILENT_CALLS.includes(node.name)) found.add(`${node.name}()`);
      node.args.forEach((a) => audioSilentTerms(a, found));
      break;
  }
  return [...found].sort();
}

/**
 * Emit a JS function body for a validated AST.
 * Returns { body, mode, isParametric, silent }.
 *
 * The compiled function's contract: fn(FL, env, out)
 *   env: { x, y, t, r, th, mx, my, i, dx, dy, params }
 *   scalar → returns a number; vec2/vec3 → fills out[0..] and returns out.
 */
export function emitJS(ast) {
  const check = validate(ast);
  if (!check.ok) throw new JsEmitError(check.error);

  const mode = outputMode(ast);
  const emitted = emit(ast, true);
  let ret;
  if (mode === 'scalar') {
    ret = `return ${emitted};`;
  } else {
    ret = emitted.map((e, k) => `out[${k}] = ${e};`).join('\n') + '\nreturn out;';
  }
  const body = `"use strict";\nconst P = env.params;\n${ret}`;
  return {
    body, mode,
    isParametric: isParametric(ast),
    silent: audioSilentTerms(ast),
  };
}

/** Compile to a callable: fn(FL, env, out). */
export function compileFormula(ast) {
  const { body, mode, isParametric: parametric, silent } = emitJS(ast);
  // eslint-disable-next-line no-new-func
  const fn = new Function('FL', 'env', 'out', body);
  return { fn, body, mode, isParametric: parametric, silent };
}

/**
 * Spatial variables make a formula a FIELD; without them it is PARAMETRIC:
 * pure f(t) (plus i/mx/my, which exist at audio rate too). prev() needs the
 * frame buffer, so it forces field as well.
 */
const SPATIAL_VARS = ['x', 'y', 'r', 'th', 'dx', 'dy'];

export function isParametric(node) {
  switch (node.type) {
    case 'var':
      return !SPATIAL_VARS.includes(node.name);
    case 'neg':
      return isParametric(node.arg);
    case 'bin':
      return isParametric(node.left) && isParametric(node.right);
    case 'call':
      return node.name !== 'prev' && node.args.every(isParametric);
    default:
      return true;
  }
}
