// The dropout meter's own logic (ADR #33), driven with synthetic quanta so
// each failure mode is exercised deterministically. The realtime proof lives
// in tests/browser/dropouts.spec.js — this is the unit-level negative control:
// a meter that never reads non-zero is not a meter.

import { describe, it, expect } from 'vitest';
import { DropoutMeter, METER_WINDOW_QUANTA, GAP_TOLERANCE_MS } from '../src/audio/dsp.js';

const SR = 48000;
const QUANTUM = 128;
const QUANTUM_MS = (QUANTUM * 1000) / SR; // 2.667 ms

/**
 * Feed `quanta` render quanta.
 * @param wallPerQuantumMs how much wall clock passes per quantum (the device's
 *        pace: == QUANTUM_MS means real time is being kept)
 * @param processMs how long our processing takes inside each quantum
 */
function run(meter, quanta, wallPerQuantumMs, processMs) {
  let now = 1000;
  let frame = 4096;
  for (let q = 0; q < quanta; q++) {
    now += wallPerQuantumMs;
    frame += QUANTUM;
    meter.quantum_(now, frame, processMs);
  }
  return meter.report();
}

describe('DropoutMeter', () => {
  it('keeping real time: no gaps, load = the fraction of the budget used', () => {
    const meter = new DropoutMeter(SR, QUANTUM);
    const r = run(meter, 4000, QUANTUM_MS, 0.3);
    expect(r.gaps).toBe(0);
    expect(r.gapFrames).toBe(0);
    expect(r.overruns).toBe(0);
    expect(r.load).toBeCloseTo(0.3 / QUANTUM_MS, 2);
    expect(r.worstLagMs).toBeLessThanOrEqual(GAP_TOLERANCE_MS);
  });

  it('rendering ahead of the clock (a device buffer) is not a gap', () => {
    const meter = new DropoutMeter(SR, QUANTUM);
    // the render thread produces faster than the device consumes
    const r = run(meter, 2000, QUANTUM_MS * 0.9, 0.3);
    expect(r.gaps).toBe(0);
  });

  it('NEGATIVE CONTROL: losing real time is counted, in gaps and in frames', () => {
    const meter = new DropoutMeter(SR, QUANTUM);
    // wall clock runs at double the rendered pace: half of real time is lost
    const r = run(meter, 2000, QUANTUM_MS * 2, 0.3);
    expect(r.gaps).toBeGreaterThan(0);
    expect(r.gapFrames).toBeGreaterThan(0);
    // ~2000 quanta × 2.667 ms lost ≈ 5.3 s ≈ 5.3 s / 25 ms tolerance ≈ 213 gaps
    expect(r.gaps).toBeGreaterThan(100);
    expect(r.worstLagMs).toBeGreaterThan(1000);
  });

  it('NEGATIVE CONTROL: processing over budget counts as an overrun', () => {
    const meter = new DropoutMeter(SR, QUANTUM);
    const r = run(meter, METER_WINDOW_QUANTA * 10, QUANTUM_MS, QUANTUM_MS * 1.5);
    expect(r.overruns).toBeGreaterThan(0);
    expect(r.load).toBeGreaterThan(1);
    expect(r.peakLoad).toBeGreaterThan(1);
  });

  it('a single 25 ms stall is one gap; a clean run after it adds none', () => {
    const meter = new DropoutMeter(SR, QUANTUM);
    run(meter, 200, QUANTUM_MS, 0.3);
    expect(meter.report().gaps).toBe(0);
    // one stall: 60 ms of wall clock with only one quantum rendered
    let now = 1000 + 200 * QUANTUM_MS + 60;
    let frame = 4096 + 201 * QUANTUM;
    meter.quantum_(now, frame, 0.3);
    expect(meter.report().gaps).toBe(1);
    for (let q = 0; q < 500; q++) {
      now += QUANTUM_MS;
      frame += QUANTUM;
      meter.quantum_(now, frame, 0.3);
    }
    expect(meter.report().gaps).toBe(1); // lost ground is counted once, not forever
  });

  it('reset clears everything (a pause is not a dropout)', () => {
    const meter = new DropoutMeter(SR, QUANTUM);
    run(meter, 500, QUANTUM_MS * 2, 0.3);
    expect(meter.report().gaps).toBeGreaterThan(0);
    meter.reset();
    const r = run(meter, 500, QUANTUM_MS, 0.3);
    expect(r.gaps).toBe(0);
    expect(r.overruns).toBe(0);
  });

  it('warmup quanta establish the baseline instead of reporting a gap', () => {
    const meter = new DropoutMeter(SR, QUANTUM);
    // a slow first few quanta (worklet startup) must not count
    let now = 1000;
    let frame = 0;
    for (let q = 0; q < 16; q++) {
      now += 50; // 50 ms per quantum during startup
      frame += QUANTUM;
      meter.quantum_(now, frame, 0.3);
    }
    for (let q = 0; q < 200; q++) {
      now += QUANTUM_MS;
      frame += QUANTUM;
      meter.quantum_(now, frame, 0.3);
    }
    expect(meter.report().gaps).toBe(0);
  });
});
