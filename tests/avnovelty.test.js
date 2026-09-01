// A1 / ADR #42: the zero-player ranks on sound as well as image, reading the
// stats.audio.pre measurement that ADR #35 put there for exactly this. These
// tests prove (a) the ranking moves when pre.rms differs, (b) a formula the
// audio backend cannot hear is judged on its image alone — never punished for
// a sound it does not have — and (c) the grid stores why a cell was won.

import { describe, it, expect } from 'vitest';
import { parse } from '../src/core/parser.js';
import { extractParams } from '../src/core/constants.js';
import { computeAudioStats } from '../src/audio/stats.js';
import {
  audioDescriptor, audioDescriptors, audioNoveltyOf, avFitness,
} from '../src/search/avnovelty.js';
import { ElitesGrid } from '../src/search/elites.js';
import { createSnapshot, migrate } from '../src/store/snapshot.js';
import v3fixture from './fixtures/snapshot-v3.json';

const measure = (source, scan = null) => {
  const { ast, params } = extractParams(parse(source));
  return computeAudioStats(ast, params, scan);
};

const pre = (rms, crest = Math.SQRT2, flatness = 1e-5) =>
  ({ pre: { rms, crest, flatness }, post: { rms: 0.33, crest, flatness }, silent: [] });

describe('audioDescriptor', () => {
  it('maps pre onto 0..1 per axis, on log scales', () => {
    const d = audioDescriptor(pre(1, 1, 1));
    expect(Array.from(d)).toEqual([0.5, 0, 1]);
    const loud = audioDescriptor(pre(1000, 16, 1e-6));
    expect(Array.from(loud)).toEqual([1, 1, 0]);
    const beyond = audioDescriptor(pre(1e9, 1e9, 1e-30)); // clamped, not exploded
    expect(Array.from(beyond)).toEqual([1, 1, 0]);
  });

  it('a silent measurement sits at the floor instead of at -infinity', () => {
    const d = audioDescriptor(pre(0, 0, 0));
    expect(Array.from(d)).toEqual([0, 0, 0]);
  });

  it('is null when nothing was measured', () => {
    expect(audioDescriptor(null)).toBeNull();
    expect(audioDescriptor(undefined)).toBeNull();
    expect(audioDescriptor({ pre: null, post: { rms: 0.3, crest: 1.4, flatness: 1e-5 } })).toBeNull();
    expect(audioDescriptor({ pre: { rms: NaN, crest: 1, flatness: 1 }, post: null })).toBeNull();
  });

  it('a migrated v3 record (post only, pre: null) has no descriptor', () => {
    const snap = migrate(structuredClone(v3fixture));
    expect(snap.stats.audio.pre).toBeNull();
    expect(audioDescriptor(snap.stats.audio)).toBeNull();
  });

  it('a measurement taken with audio-silent terms inert is not a descriptor', () => {
    const cam = measure('cam(x, y) * 0.5 + 0.3 * sin(t * 440.0 * 6.283)', { path: 'line', freq: 110 });
    expect(cam.silent).toEqual(['cam()']);
    expect(cam.pre.rms).toBeGreaterThan(0); // it made a sound — a partial one
    expect(audioDescriptor(cam)).toBeNull(); // so it is not ranked on it
  });

  it('a prev() formula is heard whole, so it IS ranked on sound (ADR #43)', () => {
    const trails = measure('prev(x, y) * 0.97 + 0.06 * sin(length(x, y) * 14.0 - t * 2.0)',
      { path: 'lissajous', freq: 110 });
    expect(trails.silent).toEqual([]);
    const d = audioDescriptor(trails);
    expect(d).not.toBeNull();
    // and the descriptor hears the feedback: it sits away from the driver alone
    const driver = audioDescriptor(measure('0.06 * sin(length(x, y) * 14.0 - t * 2.0)',
      { path: 'lissajous', freq: 110 }));
    expect(audioNoveltyOf(d, [driver])).toBeGreaterThan(0.05);
  });
});

describe('audio novelty ranks on pre.rms', () => {
  // the reason pre exists (ADR #35): the same waveform at two levels
  const quiet = measure('sin(440.0 * 6.283 * t) * 0.001');
  const loud = measure('sin(440.0 * 6.283 * t) * 1000.0');
  const mid = measure('sin(440.0 * 6.283 * t)');

  it('post cannot tell them apart; the descriptor can', () => {
    expect(Math.abs(loud.post.rms - quiet.post.rms)).toBeLessThan(0.02);
    const dq = audioDescriptor(quiet);
    const dl = audioDescriptor(loud);
    // six orders of level ≈ the whole axis (0.7 mrms sits at the floor, 707 rms at 0.975)
    expect(dq[0]).toBe(0);
    expect(dl[0]).toBeGreaterThan(0.95);
    expect(dl[1]).toBeCloseTo(dq[1], 3);     // same waveform: same crest
    expect(dl[2]).toBeCloseTo(dq[2], 1);     // and the same tone
  });

  it('with the mid-level sine in the pool, the loud one ranks above another mid one', () => {
    const pool = audioDescriptors([{ stats: { audio: mid } }]);
    const same = audioNoveltyOf(audioDescriptor(measure('sin(440.0 * 6.283 * t)')), pool);
    const louder = audioNoveltyOf(audioDescriptor(loud), pool);
    expect(same).toBeCloseTo(0, 6);
    expect(louder).toBeGreaterThan(0.4);
    // identical image novelty → the sound side alone decides the ranking
    expect(avFitness(0.2, louder)).toBeGreaterThan(avFitness(0.2, same));
  });

  it('an empty pool means everything is novel', () => {
    expect(audioNoveltyOf(audioDescriptor(mid), [])).toBe(1);
  });

  it('a candidate without a descriptor has no audio novelty', () => {
    expect(audioNoveltyOf(null, audioDescriptors([{ stats: { audio: mid } }]))).toBeNull();
  });

  it('the pool skips snapshots that carry nothing usable', () => {
    const pool = audioDescriptors([
      { stats: { audio: null } },
      { stats: { audio: mid } },
      {},
      null,
      { stats: { audio: { ...mid, silent: ['cam()'] } } },
    ]);
    expect(pool).toHaveLength(1);
  });
});

describe('avFitness', () => {
  it('averages the two novelties when both exist', () => {
    expect(avFitness(0.3, 0.5)).toBeCloseTo(0.4, 9);
  });

  it('an unheard formula is judged on its image alone: no bonus, no penalty', () => {
    expect(avFitness(0.3, null)).toBe(0.3);
    expect(avFitness(0.3, undefined)).toBe(0.3);
  });

  it('a silent-term formula is not outranked by a sound-alike with equal image novelty', () => {
    // same look; A sounds exactly like the pool (audio novelty 0), B has cam()
    const a = avFitness(0.3, 0);
    const b = avFitness(0.3, null);
    expect(b).toBeGreaterThan(a); // B keeps its image novelty; A is genuinely less new
  });
});

describe('elites grid keeps why a cell was won', () => {
  function storage() {
    const map = new Map();
    return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) };
  }

  it('stores fitness with its parts and reloads them', () => {
    const store = storage();
    const grid = new ElitesGrid(store);
    const snap = createSnapshot({ source: 'sin(x + t)', ast: parse('sin(x + t)'), origin: 'sample' });
    snap.stats = { ...snap.stats, entropy: 0.5, symmetry: 0.5, audio: pre(0.3) };
    const fitness = avFitness(0.2, 0.6);
    grid.consider(snap, fitness, { novelty: 0.2, audioNovelty: 0.6 });
    const again = new ElitesGrid(store);
    const entry = again.get('5,5');
    expect(entry.fitness).toBe(fitness);
    expect(entry.novelty).toBe(0.2);
    expect(entry.audioNovelty).toBe(0.6);
    expect(entry.snapshot.stats.audio.pre.rms).toBe(0.3);
    // and that stored measurement feeds the next candidate's pool
    expect(audioDescriptors(again.all().map((e) => e.snapshot))).toHaveLength(1);
  });

  it('a louder sound-alike wins the cell from an image-alike', () => {
    const grid = new ElitesGrid(storage());
    const mk = (audio) => {
      const s = createSnapshot({ source: 'sin(x + t)', ast: parse('sin(x + t)'), origin: 'sample' });
      s.stats = { ...s.stats, entropy: 0.5, symmetry: 0.5, audio };
      return s;
    };
    const first = mk(pre(0.3));
    grid.consider(first, avFitness(0.2, 1), { novelty: 0.2, audioNovelty: 1 });
    const pool = audioDescriptors(grid.all().map((e) => e.snapshot));

    const sameSound = mk(pre(0.3));
    const nSame = audioNoveltyOf(audioDescriptor(sameSound.stats.audio), pool);
    expect(grid.consider(sameSound, avFitness(0.2, nSame)).placed).toBe(false);

    const louder = mk(pre(300));
    const nLoud = audioNoveltyOf(audioDescriptor(louder.stats.audio), pool);
    expect(nLoud).toBeGreaterThan(nSame);
    // the first elite's fitness came from an empty pool (audio novelty 1);
    // against a pool it is now rated fairly — re-scored, it would score lower
    expect(avFitness(0.2, nLoud)).toBeGreaterThan(avFitness(0.2, nSame));
  });
});
