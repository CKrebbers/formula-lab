// Algorithmic parameter modulators — the glitch idea generalized. Each
// modulator is a toggleable render-time overlay (base params never move) with
// two knobs: amount (0..1) and rate (0..2). Smooth modulators fade in/out
// over an envelope so toggling never jumps; glitch alone is allowed to tear.
// Pure + injectable rng — testable in Node.

import { GlitchEngine } from './glitch.js';

const ENV_SECONDS = 0.8; // toggle fade for smooth modulators

/** Layered incommensurate sines: smooth, non-repeating, deterministic. */
function drift1(x) {
  return 0.5 * Math.sin(x * 2 * Math.PI)
    + 0.35 * Math.sin(x * 2 * Math.PI * 2.618 + 1.7)
    + 0.15 * Math.sin(x * 2 * Math.PI * 5.236 + 4.2);
}

const span = (r) => r.max - r.min;

// Each tick(mod, t, dt, base, ranges, rng) returns {name: offset}.

function driftTick(mod, t, dt, base, ranges) {
  const offsets = {};
  Object.keys(base).forEach((name, i) => {
    if (!ranges[name]) return;
    offsets[name] = mod.amount * span(ranges[name]) * 0.3
      * drift1(t * (0.05 + mod.rate * 0.15) + i * 0.618);
  });
  return offsets;
}

function chaseTick(mod, t, dt, base, ranges, rng) {
  const s = mod.state;
  const period = 6 / (0.5 + mod.rate * 1.5);
  if (s.nextAt === undefined || t >= s.nextAt) {
    s.targets = {};
    for (const name of Object.keys(base)) {
      if (!ranges[name]) continue;
      s.targets[name] = (rng() * 2 - 1) * mod.amount * span(ranges[name]) * 0.45;
    }
    s.nextAt = t + period;
  }
  s.cur = s.cur ?? {};
  const k = 1 - Math.exp(-dt / (period / 3)); // exponential glide toward targets
  const offsets = {};
  for (const [name, target] of Object.entries(s.targets)) {
    s.cur[name] = (s.cur[name] ?? 0) + (target - (s.cur[name] ?? 0)) * k;
    offsets[name] = s.cur[name];
  }
  return offsets;
}

function pulseTick(mod, t, dt, base, ranges) {
  const offsets = {};
  Object.keys(base).forEach((name, i) => {
    if (!ranges[name]) return;
    offsets[name] = mod.amount * span(ranges[name]) * 0.25
      * Math.sin(2 * Math.PI * (0.1 + mod.rate * 0.5) * t + i * 0.25);
  });
  return offsets;
}

function shuffleTick(mod, t, dt, base, ranges, rng) {
  const names = Object.keys(base).filter((n) => ranges[n]);
  if (names.length < 2) return {};
  const s = mod.state;
  const period = 5 / (0.5 + mod.rate * 1.5);
  if (s.until === undefined || t >= s.until) {
    const i = Math.floor(rng() * names.length);
    let j = Math.floor(rng() * (names.length - 1));
    if (j >= i) j++;
    s.pair = [names[i], names[j]];
    s.start = t;
    s.until = t + period;
  }
  const [p, q] = s.pair;
  if (!(p in base) || !(q in base)) return {};
  const k = (t - s.start) / (s.until - s.start);
  const e = Math.sin(Math.PI * Math.min(1, Math.max(0, k))); // in → hold → out
  return {
    [p]: (base[q] - base[p]) * e * mod.amount,
    [q]: (base[p] - base[q]) * e * mod.amount,
  };
}

export class ModStack {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.glitch = new GlitchEngine(rng);
    this.lastT = 0;
    this.mods = [
      { id: 'drift', name: 'drift', hint: 'slow living wander around every center', active: false, env: 0, amount: 0.3, rate: 0.5, state: {}, fn: driftTick },
      { id: 'chase', name: 'chase', hint: 'glides to fresh random targets — smooth sibling of glitch', active: false, env: 0, amount: 0.4, rate: 0.5, state: {}, fn: chaseTick },
      { id: 'pulse', name: 'pulse', hint: 'everything breathes on one rhythm', active: false, env: 0, amount: 0.3, rate: 0.5, state: {}, fn: pulseTick },
      { id: 'shuffle', name: 'shuffle', hint: 'two params smoothly trade values, then return', active: false, env: 0, amount: 0.6, rate: 0.5, state: {}, fn: shuffleTick },
      { id: 'glitch', name: 'gl!tch', hint: 'random bursts that tear and snap back', active: false, env: 0, amount: 0.3, rate: 1, state: {}, fn: null },
    ];
  }

  get(id) {
    return this.mods.find((m) => m.id === id);
  }

  toggle(id, on) {
    const mod = this.get(id);
    if (!mod) return;
    mod.active = on ?? !mod.active;
    if (mod.id === 'glitch') {
      if (mod.active) this.glitch.start();
      else this.glitch.stop();
    }
    if (!mod.active) mod.state = {}; // fresh targets next time it wakes
  }

  set(id, key, value) {
    const mod = this.get(id);
    if (!mod) return;
    mod[key] = value;
    if (mod.id === 'glitch' && key === 'amount') this.glitch.setChaos(value);
    if (mod.id === 'glitch' && key === 'rate') this.glitch.setRate(value);
  }

  /** Render-time overlay: offsets from all smooth mods, then glitch on top. */
  tick(t, baseParams, ranges) {
    const dt = Math.min(0.1, Math.max(0.001, t - this.lastT));
    this.lastT = t;

    let anySmooth = false;
    for (const mod of this.mods) {
      if (mod.id === 'glitch') continue;
      const target = mod.active ? 1 : 0;
      mod.env = Math.min(1, Math.max(0, mod.env + (target === 1 ? dt : -dt) / ENV_SECONDS));
      if (mod.env > 0) anySmooth = true;
    }

    let params = baseParams;
    if (anySmooth) {
      params = { ...baseParams };
      for (const mod of this.mods) {
        if (mod.id === 'glitch' || mod.env <= 0) continue;
        const offsets = mod.fn(mod, t, dt, baseParams, ranges, this.rng);
        for (const [name, offset] of Object.entries(offsets)) {
          params[name] += offset * mod.env;
        }
      }
      for (const [name, range] of Object.entries(ranges)) {
        if (name in params) params[name] = Math.min(range.max, Math.max(range.min, params[name]));
      }
    }

    const g = this.glitch.tick(t, params, ranges);
    return {
      params: g.glitching ? g.params : params,
      coords: g.coords,
      modulating: anySmooth || g.glitching,
    };
  }
}
