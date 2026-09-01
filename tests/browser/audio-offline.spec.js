// Audio safety through the REAL worklet (ADR 001): build the same Blob module
// synth.js builds, run it in an OfflineAudioContext for 2 seconds per formula,
// and assert the rendered buffer is finite, DC-free and inside [-1, 1].

import { test, expect } from '@playwright/test';

const CORPUS = [
  'sin(440.0 * 6.283 * t) * 0.5',
  'vec2(sin(440.0 * 6.283 * t), sin(662.0 * 6.283 * t))',
  'fract(t * 220.0) * 2.0 - 1.0',
  'band(i, 255.0) * 0.007 - 0.9',
  '1.0 / sin(t * 2.0)',
  'sqrt(0.0 - abs(sin(t * 440.0)))',
  'sin(220.0 * 6.283 * t) * 1000.0',
  't * 8000.0',
];

test('OfflineAudioContext renders are safe for every corpus formula', async ({ page }) => {
  await page.goto('/');
  const results = await page.evaluate(async (corpus) => {
    const runtime = (await import('/src/core/jsruntime.js?raw')).default;
    const dsp = (await import('/src/audio/dsp.js?raw')).default;
    const glue = (await import('/src/audio/worklet-glue.js?raw')).default;
    const { parse } = await import('/src/core/parser.js');
    const { extractParams } = await import('/src/core/constants.js');
    const { emitJS } = await import('/src/core/js.js');

    const blobUrl = URL.createObjectURL(
      new Blob([runtime, '\n', dsp, '\n', glue], { type: 'application/javascript' })
    );
    const out = [];
    for (const source of corpus) {
      const ctx = new OfflineAudioContext(2, 2 * 48000, 48000);
      await ctx.audioWorklet.addModule(blobUrl);
      const node = new AudioWorkletNode(ctx, 'formula-lab-synth', {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
      });
      node.connect(ctx.destination);
      const { ast, params } = extractParams(parse(source));
      const { body, mode } = emitJS(ast);
      node.port.postMessage({ type: 'formula', body, mode });
      node.port.postMessage({ type: 'params', params });
      node.port.postMessage({ type: 'run', on: true });
      const buffer = await ctx.startRendering();

      const stats = { source, ok: true, dc: 0, peak: 0, bad: 0 };
      for (let c = 0; c < 2; c++) {
        const data = buffer.getChannelData(c);
        let sum = 0;
        for (let s = 0; s < data.length; s++) {
          const v = data[s];
          if (!Number.isFinite(v)) stats.bad++;
          else {
            if (Math.abs(v) > 1) stats.bad++;
            sum += v;
            if (Math.abs(v) > stats.peak) stats.peak = Math.abs(v);
          }
        }
        stats.dc = Math.max(stats.dc, Math.abs(sum / data.length));
      }
      out.push(stats);
    }
    return out;
  }, CORPUS);

  for (const s of results) {
    expect(s.bad, `${s.source}: NaN/Inf/out-of-range samples`).toBe(0);
    expect(s.peak, `${s.source}: peak`).toBeLessThanOrEqual(1.0);
    expect(s.dc, `${s.source}: |mean DC|`).toBeLessThan(0.01);
  }
});
