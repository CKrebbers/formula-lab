// AV novelty (ADR #42): the zero-player ranks a discovery on how new it SOUNDS
// as well as how new it looks. The sound side reads the measurement that
// already exists — stats.audio.pre (ADR #35, pre-normalizer, so level is
// still there) — and turns it into a small vector, so the same min-distance
// novelty the image side uses (search/novelty.js) applies unchanged. No second
// meter, no DOM: testable in Node.

import { noveltyOf } from './novelty.js';

/**
 * Descriptor axes, each mapped onto 0..1 on a log scale so one step means the
 * same thing anywhere along it:
 *   level     log10(rms)      -3..3   (1 mrms .. 1000 rms — pre spans this)
 *   crest     log2(crest)      0..4   (1 = square .. 16 = needle pulses)
 *   flatness  log10(flatness) -6..0   (pure tone .. white noise)
 * Measured on the 15 autonomous families (lissajous 110 Hz): level 0.40–0.51,
 * crest 0.22–0.47, flatness 0.00–0.69; median pairwise distance 0.148.
 */
const AXES = [
  { key: 'rms', log: Math.log10, lo: -3, hi: 3 },
  { key: 'crest', log: Math.log2, lo: 0, hi: 4 },
  { key: 'flatness', log: Math.log10, lo: -6, hi: 0 },
];

/**
 * stats.audio → descriptor, or null when the measurement does not describe
 * the formula: never measured (null / v3 records with `pre: null`), or taken
 * while audio-silent terms (prev, dx, dy, cam — ADR #38/#41) were inert. A
 * formula the audio backend cannot hear is judged on its image alone; it is
 * never scored against a sound it does not have.
 * @param {object|null|undefined} audio — snapshot.stats.audio
 * @returns {Float64Array|null}
 */
export function audioDescriptor(audio) {
  if (!audio || typeof audio !== 'object') return null;
  const pre = audio.pre;
  if (!pre || typeof pre !== 'object') return null;
  if (Array.isArray(audio.silent) && audio.silent.length > 0) return null;
  const d = new Float64Array(AXES.length);
  for (let i = 0; i < AXES.length; i++) {
    const { key, log, lo, hi } = AXES[i];
    const v = pre[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
    // log of 0 is -inf: clamp catches it (a silent measurement sits at the floor)
    const l = v > 0 ? log(v) : lo;
    d[i] = (Math.min(hi, Math.max(lo, l)) - lo) / (hi - lo);
  }
  return d;
}

/**
 * Descriptors of every snapshot that carries a usable measurement — the
 * audio pool, the twin of the image histogram pool.
 * @param {object[]} snapshots
 * @returns {Float64Array[]}
 */
export function audioDescriptors(snapshots) {
  const out = [];
  for (const s of snapshots) {
    const d = audioDescriptor(s?.stats?.audio);
    if (d) out.push(d);
  }
  return out;
}

/**
 * Min L2 distance to the pool; an empty pool means everything is novel (1).
 * @param {Float64Array|null} desc
 * @param {Float64Array[]} pool
 * @returns {number|null} null when the candidate has no descriptor
 */
export function audioNoveltyOf(desc, pool) {
  if (!desc) return null;
  return noveltyOf(desc, pool);
}

/**
 * The fitness the elites grid ranks on: the mean of how new it looks and how
 * new it sounds. Without a sound measurement the image novelty stands alone —
 * neither a bonus nor a penalty for what could not be measured.
 * @param {number} imageNovelty
 * @param {number|null|undefined} audioNovelty
 */
export function avFitness(imageNovelty, audioNovelty) {
  if (audioNovelty === null || audioNovelty === undefined) return imageNovelty;
  return (imageNovelty + audioNovelty) / 2;
}
