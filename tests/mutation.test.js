// Mutation test on the emitter (ADR #34). 301 green tests say nothing until
// one of them can be made to fail: this deliberately breaks emitJS's code
// generation in three ways and asserts the parity harness catches each.
//
// The mutant is written next to the original so its relative imports resolve
// unchanged (vite cannot resolve a file:// URL out of the project root when
// the path contains spaces), imported once, and deleted again.

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluate } from '../src/core/interp.js';
import { FL } from '../src/core/jsruntime.js';
import { parse } from '../src/core/parser.js';
import { CORPUS, envAt, withinTolerance } from './fixtures/av-corpus.js';

const srcPath = (name) => fileURLToPath(new URL(`../src/core/${name}`, import.meta.url));
const ORIGINAL = readFileSync(srcPath('js.js'), 'utf8');
const written = [];

afterEach(() => {
  while (written.length) rmSync(written.pop(), { force: true });
});

/** Write `source` as a sibling module (so its relative imports resolve) and
 *  import it. Deleted again in afterEach. */
async function loadSibling(name, source) {
  writeFileSync(srcPath(name), source);
  written.push(srcPath(name));
  return import(/* @vite-ignore */ `../src/core/${name}`);
}

const loadEmitter = (source, tag) => loadSibling(`js.__mutant_${tag}__.js`, source);

/**
 * Run the parity harness (emitJS vs. the reference interpreter) with a given
 * emitter module. Returns the formulas whose output disagrees.
 */
function parityFailures(emitter, { fl = FL, reference = evaluate } = {}) {
  const failed = [];
  for (const source of CORPUS) {
    const ast = parse(source);
    let mismatch = false;
    try {
      const { fn, mode } = emitter.compileFormula(ast);
      for (let k = 0; k < 25 && !mismatch; k++) {
        const env = envAt(k);
        const ref = reference(ast, env);
        const out = fn(fl, env, [0, 0, 0]);
        const refArr = Array.isArray(ref) ? ref : [ref];
        const outArr = Array.isArray(out) ? out : [out];
        const width = mode === 'vec2' ? 2 : mode === 'vec3' ? 3 : 1;
        for (let c = 0; c < width; c++) {
          if (!withinTolerance(outArr[c], refArr[c])) mismatch = true;
        }
      }
    } catch {
      mismatch = true; // a mutant that cannot even compile is caught too
    }
    if (mismatch) failed.push(source);
  }
  return failed;
}

// Each mutation is a literal edit of the emitter's source. `find` must exist
// verbatim, otherwise the "mutation" is a no-op and the test would pass while
// proving nothing — that is asserted first.
const MUTATIONS = [
  {
    tag: 'sincos',
    name: 'sin → cos in the emitted call name',
    find: 'return `FL.${node.name}(${args.join(\', \')})`;',
    replace: 'return `FL.${node.name === \'sin\' ? \'cos\' : node.name}(${args.join(\', \')})`;',
  },
  {
    tag: 'offset',
    name: 'constant 1e-3 offset on the emitted output',
    find: 'ret = `return ${emitted};`;',
    replace: 'ret = `return (${emitted}) + 1e-3;`;',
  },
  {
    tag: 'opswap',
    name: "operator swap: '*' emitted as '+'",
    find: 'return `(${l} ${node.op} ${r})`;',
    replace: 'return `(${l} ${node.op === \'*\' ? \'+\' : node.op} ${r})`;',
  },
];

describe('mutation testing: the parity harness must be able to fail', () => {
  it('CONTROL: the unmutated emitter, loaded the same way, passes', async () => {
    const emitter = await loadEmitter(ORIGINAL, 'control');
    expect(parityFailures(emitter)).toEqual([]);
  });

  for (const m of MUTATIONS) {
    it(`kills the mutant: ${m.name}`, async () => {
      expect(ORIGINAL.includes(m.find), `mutation target not found in js.js: ${m.find}`).toBe(true);
      const mutated = ORIGINAL.replace(m.find, m.replace);
      expect(mutated).not.toBe(ORIGINAL);

      const emitter = await loadEmitter(mutated, m.tag);
      const failures = parityFailures(emitter);
      console.log(`  ${m.name}: caught by ${failures.length}/${CORPUS.length} formulas` +
        (failures.length ? ` (first: ${failures[0]})` : ''));
      expect(failures.length, `mutant SURVIVED — coverage gap in the corpus: ${m.name}`)
        .toBeGreaterThan(0);
    });
  }

  // The boundary of this harness, asserted rather than assumed: emitJS and the
  // reference interpreter both call into FL (core/jsruntime.js), so a mutation
  // INSIDE FL moves both sides together and cannot be caught here. That gap is
  // covered by tests/browser/parity-glsl.spec.js, where the GPU is the second,
  // genuinely independent implementation.
  it('DOCUMENTED BLIND SPOT: a mutation inside FL is invisible to this harness', async () => {
    const runtime = readFileSync(srcPath('jsruntime.js'), 'utf8');
    const mutatedRuntime = runtime.replace('sin: Math.sin,', 'sin: Math.cos,');
    expect(mutatedRuntime).not.toBe(runtime);
    const flMod = await loadSibling('jsruntime.__mutant_fl__.js', mutatedRuntime);

    const interp = readFileSync(srcPath('interp.js'), 'utf8');
    const mutatedInterp = interp.replace(
      "from './jsruntime.js'", "from './jsruntime.__mutant_fl__.js'");
    expect(mutatedInterp).not.toBe(interp);
    const interpMod = await loadSibling('interp.__mutant_fl__.js', mutatedInterp);

    const emitter = await loadEmitter(ORIGINAL, 'flboundary');
    const failures = parityFailures(emitter, {
      fl: flMod.FL, reference: interpMod.evaluate,
    });
    // sin() now computes cos() on BOTH sides — perfect agreement, wrong math
    expect(failures).toEqual([]);
  });
});
