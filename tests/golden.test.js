// Regression fingerprints of the audio path, per preset formula (ADR #39).
//
// Not a byte hash any more. A sha1 over samples breaks on the last bit of any
// engine or version change, tells you nothing about how far the output moved,
// and the natural response to that is to switch the suite off. This stores the
// samples and compares with a tolerance: ULP-level differences pass, an
// audible change fails, and the failure says how big it was and where.
//
// Regenerate deliberately, never to make a red test green:
//   UPDATE_GOLDEN=1 npx vitest run tests/golden.test.js

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse } from '../src/core/parser.js';
import { extractParams } from '../src/core/constants.js';
import { compileFormula, isParametric } from '../src/core/js.js';
import { FL } from '../src/core/jsruntime.js';
import { SynthCore } from '../src/audio/dsp.js';
import { STARTERS } from '../src/families/starters.js';
import { FAMILIES } from '../src/families/index.js';

const GOLDEN_PATH = join(dirname(fileURLToPath(import.meta.url)), 'golden-av.json');
const SR = 48000;
const TOL = 1e-5;   // ≫ any ULP difference, ≪ an audible one
const FRAMES = 1024;
const STRIDE = 8;   // 128 frames × 2 channels stored per formula
// past the chain's warmup (one 250 ms mean window) plus its 20 ms fade. The
// first regeneration after that warmup landed BEFORE it and produced 20
// identical all-zero fingerprints — a green test proving nothing.
const SKIP_S = 0.4;

const PARAMETRIC_CORPUS = [
  'sin(440.0 * 6.283 * t) * 0.5',
  'vec2(sin(440.0 * 6.283 * t), sin(662.0 * 6.283 * t))',
  'fract(t * 220.0) * 2.0 - 1.0',
  'band(i, 255.0) * 0.007 - 0.9',
];

const SOURCES = [...new Set([
  ...PARAMETRIC_CORPUS,
  ...STARTERS.map((s) => s.source),
  ...FAMILIES.map((f) => f.source),
])];

function fingerprint(source) {
  const { ast, params } = extractParams(parse(source));
  const core = new SynthCore(SR, { FL });
  core.setFormula(compileFormula(ast), !isParametric(ast));
  core.setScan('lissajous', 110); // field formulas play through the default scan
  core.setParams(params);

  const l = new Float32Array(128);
  const r = new Float32Array(128);
  for (let b = 0; b < Math.ceil((SKIP_S * SR) / 128); b++) core.process(l, r);

  const left = new Float64Array(FRAMES);
  const right = new Float64Array(FRAMES);
  for (let b = 0; b < FRAMES / 128; b++) {
    core.process(l, r);
    left.set(l, b * 128);
    right.set(r, b * 128);
  }

  const samples = [];
  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < FRAMES; i++) {
    sumSq += left[i] * left[i] + right[i] * right[i];
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    if (i % STRIDE === 0) samples.push(round(left[i]), round(right[i]));
  }
  return { samples, rms: round(Math.sqrt(sumSq / (2 * FRAMES))), peak: round(peak) };
}

const round = (v) => Math.round(v * 1e7) / 1e7; // finer than TOL, compact on disk

/** Worst absolute deviation between two fingerprints. */
function compare(got, want) {
  let worst = 0;
  let at = -1;
  for (let i = 0; i < want.samples.length; i++) {
    const d = Math.abs(got.samples[i] - want.samples[i]);
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  return { worst, at, ok: worst <= TOL };
}

if (process.env.UPDATE_GOLDEN) {
  describe('golden audio fingerprints', () => {
    it('regenerates golden-av.json', () => {
      const golden = {};
      for (const source of SOURCES) golden[source] = fingerprint(source);
      writeFileSync(GOLDEN_PATH, JSON.stringify(golden, null, 1) + '\n');
      expect(Object.keys(golden)).toHaveLength(SOURCES.length);
    });
  });
} else {
  const golden = existsSync(GOLDEN_PATH)
    ? JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'))
    : null;

  describe('golden audio fingerprints', () => {
    it('the golden file exists (UPDATE_GOLDEN=1 to generate)', () => {
      expect(golden, 'no golden file').not.toBeNull();
    });

    for (const source of SOURCES) {
      it(source, () => {
        const want = golden?.[source];
        expect(want, 'missing golden — regenerate deliberately').toBeDefined();
        const got = fingerprint(source);
        const { ok, worst, at } = compare(got, want);
        expect(ok, `worst deviation ${worst.toExponential(2)} at value ${at} ` +
          `(tolerance ${TOL}); rms ${got.rms} vs ${want.rms}`).toBe(true);
      });
    }

    // Guards against the way this test died once already: after the warmup
    // was added, every fingerprint was captured during the silence and all 20
    // hashes were identical. Green, and worthless.
    it('every fingerprint is audible, not captured during the warmup', () => {
      for (const source of SOURCES) {
        expect(golden[source].rms, `${source} is silent`).toBeGreaterThan(1e-3);
      }
    });

    it('no two formulas share a fingerprint', () => {
      const seen = new Map();
      for (const source of SOURCES) {
        const key = golden[source].samples.join(',');
        expect(seen.has(key), `${source} sounds identical to ${seen.get(key)}`).toBe(false);
        seen.set(key, source);
      }
    });

    // The point of the format change, asserted in both directions.
    it('CONTROL: survives a ULP-level perturbation', () => {
      const want = golden[SOURCES[0]];
      const nudged = {
        samples: want.samples.map((v) => v + Math.sign(v || 1) * Number.EPSILON * 64 * Math.max(1, Math.abs(v))),
      };
      const { ok, worst } = compare(nudged, want);
      expect(ok, `a ${worst.toExponential(2)} nudge should not fail`).toBe(true);
    });

    it('CONTROL: fails at 1e-4', () => {
      const want = golden[SOURCES[0]];
      const shifted = { samples: want.samples.map((v) => v + 1e-4) };
      expect(compare(shifted, want).ok).toBe(false);
    });
  });
}
