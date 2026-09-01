// Performance budget (ADR 001): a 128-frame block must process in under 1 ms
// on average, with ZERO blocks over the real-time deadline (128/48000 s)
// across a 30-second run — measured on the same SynthCore the worklet runs.
//
// This is a SUPPLEMENT, not the dropout proof: it measures the DSP in
// isolation, off the audio thread. "No dropouts in 30 s of real time" is
// proven by tests/browser/dropouts.spec.js against the real worklet, with a
// negative control (ADR #33).
//
// The measurement runs in a CHILD node process (vitest workers contend for
// cores) and uses CPU time, not wall time: a real AudioWorklet thread runs at
// near-realtime priority and is not preempted by a busy desktop the way a
// Node test process is. In-thread costs (the DSP itself, V8 GC) still count;
// another app stealing the core does not.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SCRIPT = `
import { parse } from './src/core/parser.js';
import { extractParams } from './src/core/constants.js';
import { compileFormula } from './src/core/js.js';
import { FL } from './src/core/jsruntime.js';
import { SynthCore } from './src/audio/dsp.js';

// deliberately heavy: an iterated map + fbm + audio-rate sine per sample,
// plus the feedback grid read AND written every sample (ADR #43)
const HEAVY = 'prev(x + dx, y) * 0.5 + julia(sin(t * 0.11), cos(t * 0.13), 0.355, 0.355, 24.0) '
  + '* sin(440.0 * 6.283 * t) + fbm(t * 0.5, 0.0, 4.0) * 0.3';
const { ast, params } = extractParams(parse(HEAVY));
const core = new SynthCore(48000, { FL });
core.setFormula(compileFormula(ast), true); // a field: the scan drives x/y
core.setParams(params);
const l = new Float32Array(128), r = new Float32Array(128);
for (let b = 0; b < 400; b++) core.process(l, r); // JIT warmup

const blocks = Math.ceil((30 * 48000) / 128);
const deadlineMs = (128 / 48000) * 1000;
let total = 0, worst = 0, dropouts = 0;
for (let b = 0; b < blocks; b++) {
  const c0 = process.cpuUsage();
  core.process(l, r);
  const c1 = process.cpuUsage(c0);
  const ms = (c1.user + c1.system) / 1000;
  total += ms;
  if (ms > worst) worst = ms;
  if (ms > deadlineMs) dropouts++;
}
console.log(JSON.stringify({ avg: total / blocks, worst, dropouts, blocks }));
`;

describe('worklet budget', () => {
  it('30 s of blocks: avg < 1 ms, zero deadline misses', () => {
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', SCRIPT], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 110000,
    });
    const { avg, worst, dropouts, blocks } = JSON.parse(out.trim().split('\n').pop());
    expect(blocks).toBeGreaterThan(11000);
    expect(avg, `avg ${avg.toFixed(3)} ms, worst ${worst.toFixed(3)} ms`).toBeLessThan(1);
    expect(dropouts, `worst block ${worst.toFixed(3)} ms`).toBe(0);
  }, 120000);
});
