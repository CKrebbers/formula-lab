// Realtime dropout proof (ADR #33). The child-process CPU-time budget test
// (tests/perf.test.js) measures the DSP in isolation; it cannot prove "zero
// dropouts in 30 s of real time". This can: a real AudioContext, the real
// worklet, the real preset corpus, and the meter that runs on the audio
// thread. The negative control in the second test is what makes the first
// test's zero mean anything.

import { test, expect } from '@playwright/test';

const RUN_SECONDS = 30;

/** Drive AVSound in the page for `seconds`, cycling `sources`. */
async function measure(page, { sources, seconds, scan }) {
  return page.evaluate(async ({ sources, seconds, scan }) => {
    const { AVSound } = await import('/src/audio/synth.js');
    const { parse } = await import('/src/core/parser.js');
    const { extractParams } = await import('/src/core/constants.js');

    const sound = new AVSound();
    const compiled = sources.map((source) => {
      const { ast, params } = extractParams(parse(source));
      return { source, ast, params };
    });
    sound.setFormula(compiled[0].ast);
    if (scan) sound.setScan(scan.path, scan.freq);
    await sound.start(0);
    sound.setParams(compiled[0].params);

    // Chrome's own instrument, when present: corroboration, not the assertion
    let underrunRatio = null;
    const cap = sound.ctx.renderCapacity;
    if (cap) {
      cap.onupdate = (e) => {
        underrunRatio = Math.max(underrunRatio ?? 0, e.underrunRatio ?? 0);
      };
      cap.start({ updateInterval: 1 });
    }

    const t0 = performance.now();
    const stepMs = (seconds * 1000) / compiled.length;
    for (let k = 0; k < compiled.length; k++) {
      const c = compiled[k];
      sound.setFormula(c.ast);
      sound.setParams(c.params);
      const until = t0 + stepMs * (k + 1);
      // params stream at ~30 Hz like the panel's frame loop does
      while (performance.now() < until) {
        await new Promise((r) => setTimeout(r, 33));
        sound.setParams(c.params, [0, 0]);
      }
    }
    const wallSeconds = (performance.now() - t0) / 1000;
    cap?.stop?.();
    // exact reading, not the last window that happened to arrive
    const meter = await sound.flushMeter();
    sound.stop();
    await sound.ctx.close();
    return { meter, wallSeconds, underrunRatio, presets: compiled.length };
  }, { sources, seconds, scan });
}

test('30 s realtime on the preset corpus: zero dropouts', async ({ page }) => {
  await page.goto('/');
  const sources = await page.evaluate(async () => {
    const { STARTERS } = await import('/src/families/starters.js');
    const { FAMILIES } = await import('/src/families/index.js');
    return [
      'vec2(sin(440.0 * 6.283 * t), sin(662.0 * 6.283 * t))',
      'sin(440.0 * 6.283 * t) * 0.5',
      'fract(t * 220.0) * 2.0 - 1.0',
      'band(i, 255.0) * 0.007 - 0.9',
      ...STARTERS.map((s) => s.source),
      ...FAMILIES.map((f) => f.source),
    ];
  });

  const { meter, wallSeconds, underrunRatio, presets } =
    await measure(page, { sources, seconds: RUN_SECONDS });

  console.log(`corpus run: ${presets} presets over ${wallSeconds.toFixed(1)} s — ` +
    `${JSON.stringify(meter)} underrunRatio=${underrunRatio}`);

  expect(meter.stale, 'the audio thread did not answer the meter flush').toBeUndefined();
  // the meter must have watched the whole run, in real time: audio produced
  // has to account for the wall clock it was produced in. Use the context's
  // OWN rate — this Mac's device runs at 44.1 kHz.
  const audioSeconds = (meter.quanta * 128) / meter.sampleRate;
  expect(meter.skipped, 'the context rendered quanta this node never saw').toBe(0);
  expect(audioSeconds, `only ${audioSeconds.toFixed(1)} s rendered in ${wallSeconds.toFixed(1)} s`)
    .toBeGreaterThan(wallSeconds * 0.97);
  expect(meter.gaps, `gapFrames=${meter.gapFrames} worstLagMs=${meter.worstLagMs}`).toBe(0);
  expect(meter.overruns, `load=${meter.load} peakLoad=${meter.peakLoad}`).toBe(0);
  expect(meter.load).toBeLessThan(1);
  if (underrunRatio !== null) expect(underrunRatio).toBe(0);
});

test('NEGATIVE CONTROL: a deliberately heavy formula is seen by the meter', async ({ page }) => {
  await page.goto('/');
  // Measured, not guessed: ONE block of iterated maps + 8-octave fbm runs at
  // load 0.84 on this machine — heavy, but inside the budget. Four blocks put
  // it around 3×, which no machine sustains at 4× oversampling / 48 kHz.
  const block = (k) =>
    `julia(x + ${k}.0, y, 0.355, 0.355, 48.0) + ship(y, x + ${k}.0, 0.0 - 0.6, 0.0 - 0.4, 48.0)`
    + ` + orbit(x, y + ${k}.0, 0.3, 0.5, 48.0) + kali(x + ${k}.0, y, 0.55, 0.4, 24.0)`
    + ` + fbm(x * 2.0 + ${k}.0, y * 2.0, 8.0) + worley(x * 4.0, y * 4.0 + ${k}.0)`;
  const heavy = [1, 2, 3, 4].map(block).join(' + ');

  const { meter, underrunRatio } = await measure(page, {
    sources: [heavy], seconds: 8, scan: { path: 'spiral', freq: 220 },
  });

  console.log(`heavy run: ${JSON.stringify(meter)} underrunRatio=${underrunRatio}`);

  expect(meter.gaps, 'the gap counter must see a formula that cannot run in real time')
    .toBeGreaterThan(0);
  expect(meter.gapFrames).toBeGreaterThan(0);
  expect(meter.overruns, 'the load counter must see it too').toBeGreaterThan(0);
  expect(meter.peakLoad).toBeGreaterThan(1);
});
