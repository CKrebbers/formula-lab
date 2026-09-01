// s_ent / s_sym — a formula reading its own previous-frame §7 stats (ADR #43).
// The GPU side (probe pass, 8-bit feedback) is covered by tests/browser/self.spec.js;
// here: whitelist, both emitters, the stats function, the mutation pool, and a
// CPU simulation of the closed loop proving the Homeostat family lives on it.

import { describe, it, expect, afterEach } from 'vitest';
import { VARIABLES, SELF_VARS, validate } from '../src/core/ast.js';
import { parse } from '../src/core/parser.js';
import { transpile, usesSelf } from '../src/core/glsl.js';
import { compileFormula, isParametric } from '../src/core/js.js';
import { evaluate } from '../src/core/interp.js';
import { FL } from '../src/core/jsruntime.js';
import { computeStats, computeSelfStats } from '../src/search/filter.js';
import { varSwap } from '../src/search/mutate.js';
import { getFamily, autonomousFamilies } from '../src/families/index.js';

describe('s_ent / s_sym: whitelist', () => {
  it('are variables with black-frame defaults', () => {
    expect(VARIABLES).toContain('s_ent');
    expect(VARIABLES).toContain('s_sym');
    expect(SELF_VARS).toEqual({ s_ent: 0, s_sym: 1 });
  });

  it('parse and validate like any other variable', () => {
    const ast = parse('sin(x * (4.0 + 40.0 * (0.7 - s_ent))) * s_sym');
    expect(validate(ast).ok).toBe(true);
    expect(usesSelf(ast)).toBe(true);
    expect(usesSelf(parse('sin(x * y + t)'))).toBe(false);
    expect(() => parse('s_edge')).toThrow(/Unknown name 's_edge'/);
  });
});

describe('s_ent / s_sym: GLSL', () => {
  it('declares the two uniforms and locals only when either is read', () => {
    const plain = transpile(parse('sin(x * y + t)'));
    expect(plain.usesSelf).toBe(false);
    expect(plain.fragmentSource).not.toContain('s_ent');
    expect(plain.fragmentSource).not.toContain('s_sym');

    const one = transpile(parse('sin(x * 8.0 * s_ent + t)'));
    expect(one.usesSelf).toBe(true);
    expect(one.fragmentSource).toContain('uniform float u_s_ent;');
    expect(one.fragmentSource).toContain('uniform float u_s_sym;'); // declared together
    expect(one.fragmentSource).toContain('float s_ent = u_s_ent;');
    expect(one.fragmentSource).toContain('float s_sym = u_s_sym;');
    expect(one.fragmentSource).not.toContain('u_prev'); // no feedback buffer without prev()
  });

  it('leaves every family without the vars byte-identical (no trace of the feature)', () => {
    for (const f of autonomousFamilies()) {
      const src = transpile(parse(f.source)).fragmentSource;
      if (!usesSelf(parse(f.source))) expect(src).not.toMatch(/s_ent|s_sym/);
    }
  });
});

describe('s_ent / s_sym: audio twin and reference', () => {
  it('are heard, with the black-frame defaults when nothing was fed', () => {
    const { fn, silent } = compileFormula(parse('s_ent + s_sym * 10.0'));
    expect(silent).toEqual([]); // fed by the renderer through the params message
    const env = { x: 0, y: 0, t: 0, r: 0, th: 0, mx: 0, my: 0, i: 0, dx: 0, dy: 0, params: {} };
    expect(fn(FL, env, [0, 0, 0])).toBe(10);
    expect(fn(FL, { ...env, s_ent: 0.5, s_sym: 0.25 }, [0, 0, 0])).toBe(3);
    expect(evaluate(parse('s_ent + s_sym * 10.0'), env)).toBe(10);
    expect(evaluate(parse('s_ent + s_sym * 10.0'), { ...env, s_ent: 0.5, s_sym: 0.25 })).toBe(3);
  });

  it('do not make a formula a field', () => {
    expect(isParametric(parse('sin(t * (200.0 + 400.0 * s_ent))'))).toBe(true);
  });
});

describe('computeSelfStats', () => {
  it('is the entropy and symmetry of computeStats, nothing else', () => {
    const w = 32, h = 32;
    const pixels = new Uint8Array(w * h * 4);
    let seed = 7;
    for (let k = 0; k < pixels.length; k += 4) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const v = seed % 256;
      pixels[k] = v; pixels[k + 1] = v; pixels[k + 2] = v; pixels[k + 3] = 255;
    }
    const full = computeStats(pixels, w, h);
    const self = computeSelfStats(pixels, w, h);
    expect(self).toEqual({ entropy: full.entropy, symmetry: full.symmetry });
  });
});

describe('var_swap reaches the self vars', () => {
  it('swaps into s_ent / s_sym at the low rate, never otherwise', () => {
    const ast = parse('sin(x * 3.0 + t)');
    const rngSelf = () => 0.1;   // pick first var, rate roll below 0.15, pick first
    const rngPlain = () => 0.9;  // rate roll above 0.15
    const a = varSwap(ast, rngSelf);
    expect(validate(a).ok).toBe(true);
    expect(JSON.stringify(a)).toMatch(/s_ent|s_sym/);
    const b = varSwap(ast, rngPlain);
    expect(validate(b).ok).toBe(true);
    expect(JSON.stringify(b)).not.toMatch(/s_ent|s_sym/);
  });
});

/**
 * CPU twin of the renderer's loop: N² frame, prev() from an 8-bit alpha
 * buffer (starts at -1), s_ent/s_sym from computeSelfStats of the last frame.
 * `freeze` pins the vars — the control that shows the loop is doing the work.
 */
function simulate(ast, { size = 64, frames = 60, t = 0.8, freeze = null } = {}) {
  const N = size;
  let alpha = new Float64Array(N * N).fill(-1);
  const rgba = new Uint8Array(N * N * 4);
  let self = freeze ? { ...freeze } : { ...SELF_VARS };
  FL.prev = (px, py) => {
    const u = Math.min(N - 1, Math.max(0, Math.round((px * 0.5 + 0.5) * N - 0.5)));
    const v = Math.min(N - 1, Math.max(0, Math.round((py * 0.5 + 0.5) * N - 0.5)));
    return alpha[v * N + u];
  };
  const { fn } = compileFormula(ast); // the JS twin: 10× the tree walker
  const diffs = [];
  const ents = [];
  let last = null;
  for (let f = 0; f < frames; f++) {
    const next = new Float64Array(N * N);
    const gray = new Uint8Array(N * N);
    for (let py = 0; py < N; py++) {
      for (let px = 0; px < N; px++) {
        const ux = (2 * (px + 0.5) - N) / N;
        const uy = (2 * (py + 0.5) - N) / N;
        const env = {
          x: ux, y: uy, t, r: Math.hypot(ux, uy), th: Math.atan2(uy, ux), mx: 0, my: 0,
          i: px + 0.5 + (py + 0.5) * N, dx: 2 / N, dy: 2 / N, ...self, params: {},
        };
        const v = fn(FL, env, [0, 0, 0]);
        const q = Math.round(Math.min(1, Math.max(0, (Number.isFinite(v) ? v : 0) * 0.5 + 0.5)) * 255);
        gray[py * N + px] = q;
        next[py * N + px] = (q / 255) * 2 - 1;
        rgba[(py * N + px) * 4] = q;
        rgba[(py * N + px) * 4 + 1] = q;
        rgba[(py * N + px) * 4 + 2] = q;
        rgba[(py * N + px) * 4 + 3] = 255;
      }
    }
    if (last) {
      let d = 0;
      for (let k = 0; k < N * N; k++) d += Math.abs(gray[k] - last[k]);
      diffs.push(d / (N * N));
    }
    const s = computeSelfStats(rgba, N, N);
    ents.push(s.entropy);
    if (!freeze) self = { s_ent: s.entropy, s_sym: s.symmetry };
    alpha = next;
    last = gray;
  }
  const tail = diffs.slice(-20);
  return {
    tailDiff: tail.reduce((a, b) => a + b, 0) / tail.length,
    entRange: Math.max(...ents.slice(-30)) - Math.min(...ents.slice(-30)),
  };
}

describe('self.homeostat lives on the loop', () => {
  const origPrev = FL.prev;
  afterEach(() => { FL.prev = origPrev; });

  it('is registered, autonomous, and reads both vars', () => {
    const family = getFamily('self.homeostat');
    expect(family).not.toBeNull();
    expect(autonomousFamilies().map((f) => f.id)).toContain('self.homeostat');
    expect(family.source).toMatch(/s_ent/);
    expect(family.source).toMatch(/s_sym/);
  });

  it('keeps moving with t held, and freezes into a static field when the vars are pinned', () => {
    const ast = parse(getFamily('self.homeostat').source);
    const live = simulate(ast);
    const dead = simulate(ast, { freeze: { s_ent: 0.5, s_sym: 0.5 } });
    // alive: frames keep differing and the entropy keeps hunting
    expect(live.tailDiff).toBeGreaterThan(3);
    expect(live.entRange).toBeGreaterThan(0.05);
    // dead: prev() converged, nothing changes any more
    expect(dead.tailDiff).toBeLessThan(0.05);
    expect(dead.entRange).toBeLessThan(0.01);
  });
});
