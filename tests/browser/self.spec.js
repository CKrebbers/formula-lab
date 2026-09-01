// s_ent / s_sym on the real GL path (ADR #43): the renderer's 128² probe pass
// feeds the previous frame's entropy/symmetry back as uniforms. Measured on
// the GPU because the feedback buffer is 8-bit and a quantizer can lie (ADR #22):
// with t HELD, the Homeostat family must keep changing frame to frame and its
// stats must keep hunting; the same formula with the vars pinned to constants
// must settle into a static field; a formula without the vars has no probe.

import { test, expect } from '@playwright/test';

async function run(page, source, frames) {
  return page.evaluate(async ({ src, n }) => {
    const { parse } = await import('/src/core/parser.js');
    const { extractParams } = await import('/src/core/constants.js');
    const { transpile } = await import('/src/core/glsl.js');
    const { TileRenderer } = await import('/src/render/tile.js');

    const { ast, params } = extractParams(parse(src));
    const compiled = transpile(ast);
    const tile = new TileRenderer(128);
    tile.setShader(compiled.fragmentSource, compiled.paramNames, compiled.usesPrev);
    const r = tile.renderer;
    const state = { time: 0.8, mouse: [0, 0], params, coords: 0, palette: 0, smooth: false, tone: 0, raw: true };
    const ents = [];
    const diffs = [];
    let last = null;
    for (let f = 0; f < n; f++) {
      ents.push(r.selfStats.s_ent ?? null); // what THIS draw reads (measured last frame)
      r.render(state); // t held: only the loop can move the image
      const { pixels } = r.readPixels();
      if (last) {
        let d = 0;
        for (let k = 0; k < pixels.length; k += 4) d += Math.abs(pixels[k] - last[k]);
        diffs.push(d / (pixels.length / 4));
      }
      last = pixels;
    }
    const tail = diffs.slice(-20);
    const e = ents.slice(-40).filter((v) => v !== null);
    return {
      hasMemory: r.hasMemory,
      usesSelf: r.usesSelf,
      selfStats: r.selfStats,
      tailDiff: tail.reduce((a, b) => a + b, 0) / tail.length,
      entRange: e.length ? Math.max(...e) - Math.min(...e) : 0,
      ents: ents.slice(0, 8),
    };
  }, { src: source, n: frames });
}

const HOMEOSTAT = 'prev(x, y) * 0.9 + 0.3 * sin(length(x, y) * (4.0 + 40.0 * (0.7 - s_ent)) - t) + 0.8 * (s_sym - 0.6) * sin(x * 5.0 + y * 2.0 - t)';
const PINNED = HOMEOSTAT.replace('s_ent', '0.5').replace('s_sym', '0.5');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('the Homeostat keeps hunting with t held — the loop closes on the GPU', async ({ page }) => {
  const live = await run(page, HOMEOSTAT, 90);
  expect(live.usesSelf).toBe(true);
  expect(live.hasMemory).toBe(true);
  expect(live.ents[0]).toBe(0);          // first frame reads the black-frame stats
  expect(live.ents[1]).toBeGreaterThan(0); // measured from frame one on
  expect(live.tailDiff, 'frames must keep changing').toBeGreaterThan(3);
  expect(live.entRange, 's_ent must keep moving').toBeGreaterThan(0.05);
  expect(live.selfStats.s_ent).toBeGreaterThan(0.3);
  expect(live.selfStats.s_sym).toBeGreaterThan(0.3);
});

test('the same formula with the vars pinned settles into a static field', async ({ page }) => {
  const dead = await run(page, PINNED, 90);
  expect(dead.usesSelf).toBe(false);
  expect(dead.hasMemory).toBe(true); // prev() still warms
  expect(dead.selfStats).toEqual({});
  expect(dead.tailDiff, 'no loop, no motion').toBeLessThan(0.05);
});

test('a formula without the vars has no probe and no stats', async ({ page }) => {
  const plain = await run(page, 'sin(x * y * 4.0 + t) + cos(3.0 * x + t * 0.7)', 4);
  expect(plain.usesSelf).toBe(false);
  expect(plain.hasMemory).toBe(false);
  expect(plain.selfStats).toEqual({});
  expect(plain.tailDiff).toBe(0);
});
