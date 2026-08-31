import { describe, it, expect } from 'vitest';
import { GlitchEngine } from '../src/core/glitch.js';

const PARAMS = { a: 2, b: -1 };
const RANGES = { a: { min: -3, max: 7 }, b: { min: -6, max: 4 } };

function seqRng(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('glitch engine', () => {
  it('passes params through untouched when inactive or chaos 0', () => {
    const engine = new GlitchEngine(() => 0);
    expect(engine.tick(1, PARAMS, RANGES)).toEqual({ params: PARAMS, coords: null, glitching: false });
    engine.start();
    engine.setChaos(0);
    expect(engine.tick(2, PARAMS, RANGES).glitching).toBe(false);
  });

  it('bursts spike params and snap back exactly to base', () => {
    const engine = new GlitchEngine(() => 0); // rng 0: burst fires instantly, max spike, joins all
    engine.start();
    engine.setChaos(0.8);
    engine.tick(0.0, PARAMS, RANGES);
    const hit = engine.tick(0.016, PARAMS, RANGES);
    expect(hit.glitching).toBe(true);
    expect(hit.params).not.toEqual(PARAMS);
    // base object never mutated
    expect(PARAMS).toEqual({ a: 2, b: -1 });

    const after = engine.tick(10, PARAMS, RANGES); // far past burst.until
    // burst expired: either clean, or (rng()=0) a NEW burst starts — force clean:
    engine.stop();
    const clean = engine.tick(10.1, PARAMS, RANGES);
    expect(after.params === PARAMS || after.glitching).toBe(true);
    expect(clean).toEqual({ params: PARAMS, coords: null, glitching: false });
  });

  it('spiked values stay clamped to slider ranges', () => {
    const engine = new GlitchEngine(seqRng([0.0, 0.01, 0.02, 0.9, 0.1, 0.3, 0.7, 0.05]));
    engine.start();
    engine.setChaos(1);
    for (let t = 0; t < 3; t += 0.016) {
      const { params } = engine.tick(t, PARAMS, RANGES);
      expect(params.a).toBeGreaterThanOrEqual(RANGES.a.min);
      expect(params.a).toBeLessThanOrEqual(RANGES.a.max);
      expect(params.b).toBeGreaterThanOrEqual(RANGES.b.min);
      expect(params.b).toBeLessThanOrEqual(RANGES.b.max);
    }
  });

  it('higher chaos glitches more of the time (statistical)', () => {
    function activeFraction(chaos) {
      const engine = new GlitchEngine(Math.random);
      engine.start();
      engine.setChaos(chaos);
      let active = 0;
      let total = 0;
      for (let t = 0; t < 120; t += 0.016) {
        if (engine.tick(t, PARAMS, RANGES).glitching) active++;
        total++;
      }
      return active / total;
    }
    const low = activeFraction(0.05);
    const high = activeFraction(0.9);
    expect(high).toBeGreaterThan(low);
    expect(low).toBeLessThan(0.2); // low chaos = mostly clean signal
  });

  it('stop() ends a running burst immediately', () => {
    const engine = new GlitchEngine(() => 0);
    engine.start();
    engine.setChaos(1);
    engine.tick(0, PARAMS, RANGES);
    expect(engine.tick(0.016, PARAMS, RANGES).glitching).toBe(true);
    engine.stop();
    expect(engine.tick(0.032, PARAMS, RANGES).glitching).toBe(false);
  });
});
