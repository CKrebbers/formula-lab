// Regression: golden hashes of the first 1024 audio samples per preset
// formula (starters + families + the parametric corpus). A hash change means
// the audio path changed audibly — bump the goldens ONLY on purpose:
//   UPDATE_GOLDEN=1 npx vitest run tests/golden.test.js
// Samples are quantized to 1e-6 before hashing (float64 determinism on V8).

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse } from '../src/core/parser.js';
import { extractParams } from '../src/core/constants.js';
import { compileFormula } from '../src/core/js.js';
import { FL } from '../src/core/jsruntime.js';
import { SynthCore } from '../src/audio/dsp.js';
import { STARTERS } from '../src/families/starters.js';
import { FAMILIES } from '../src/families/index.js';

const GOLDEN_PATH = join(dirname(fileURLToPath(import.meta.url)), 'golden-av.json');
const SR = 48000;

const PARAMETRIC_CORPUS = [
  'sin(440.0 * 6.283 * t) * 0.5',
  'vec2(sin(440.0 * 6.283 * t), sin(662.0 * 6.283 * t))',
  'fract(t * 220.0) * 2.0 - 1.0',
  'band(i, 255.0) * 0.007 - 0.9',
];

function hashOf(source) {
  const { ast, params } = extractParams(parse(source));
  const core = new SynthCore(SR, { FL });
  core.setFormula(compileFormula(ast));
  core.setParams(params);
  const l = new Float32Array(128);
  const r = new Float32Array(128);
  const samples = [];
  while (samples.length < 1024) {
    core.process(l, r);
    for (let i = 0; i < 128 && samples.length < 1024; i++) {
      samples.push(Math.round(l[i] * 1e6) / 1e6, Math.round(r[i] * 1e6) / 1e6);
    }
  }
  return createHash('sha1').update(samples.join(',')).digest('hex');
}

describe('golden audio hashes (first 1024 samples per preset)', () => {
  const sources = [...new Set([
    ...PARAMETRIC_CORPUS,
    ...STARTERS.map((s) => s.source),
    ...FAMILIES.map((f) => f.source),
  ])];

  if (process.env.UPDATE_GOLDEN) {
    it('regenerates golden-av.json', () => {
      const golden = {};
      for (const source of sources) golden[source] = hashOf(source);
      writeFileSync(GOLDEN_PATH, JSON.stringify(golden, null, 2) + '\n');
      expect(Object.keys(golden).length).toBe(sources.length);
    });
    return;
  }

  it('golden file exists (generate with UPDATE_GOLDEN=1)', () => {
    expect(existsSync(GOLDEN_PATH)).toBe(true);
  });

  if (existsSync(GOLDEN_PATH)) {
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
    for (const source of sources) {
      it(source, () => {
        expect(golden[source], 'missing golden — regenerate').toBeDefined();
        expect(hashOf(source)).toBe(golden[source]);
      });
    }
  }
});
