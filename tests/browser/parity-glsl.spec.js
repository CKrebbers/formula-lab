// GLSL parity (ADR 001): render each corpus formula with the app's own GL
// path (TileRenderer, u_raw = palette-free continuous scalar), read pixels
// back, and compare every pixel against the reference AST interpreter at
// exactly the env the shader computes. The GPU is float32 and the reference
// float64, so the tolerances are statistical for discontinuous/hash-based
// formulas: a floor() boundary pixel may legitimately land in the other cell.

import { test, expect } from '@playwright/test';

const SMOOTH = [
  'sin(x * y * 4.0 + t) + cos(3.0 * x + t * 0.7)',
  'mix(x, y, 0.3) + smoothstep(0.0, 1.0, y) * 0.5',
  'sin(r * 6.0 - t) * cos(th * 2.0)',
  'exp(0.0 - r * 2.0) * 2.0 - 1.0',
  'length(x, y) - length(x) * 0.5',
  'atan2(y, x) * 0.3 + atan(x * 2.0) * 0.4',
  'clamp(x * 3.0, 0.0 - 1.0, 1.0) * min(1.0, max(0.0 - 1.0, y))',
  'fold(x * 2.0 + t * 0.1) - fold(y * 3.0)',
  'tan(x * 0.7) * 0.2 + sqrt(abs(y)) * 0.5',
  'pow(abs(x * y) + 0.1, 1.7) * 2.0 - 1.0',
];

const DISCONTINUOUS = [
  'floor(y * 3.0) * 0.4 + fract(x * 4.0) - 0.5',
  'mod(x * 5.0, 2.0) - 1.0 + step(0.2, y) * 0.3',
  'sign(sin(x * 9.0)) * 0.5 + (x < y) * 0.3 + (x > 0.0) * 0.1',
  'band(i, 255.0) * 0.005 - 0.5',
  'bxor(floor(x * 20.0) + 40.0, floor(y * 20.0) + 40.0) * 0.02 - 0.5',
  'julia(x, y, 0.355, 0.355, 16.0) * 2.0 - 1.0',
  'ship(x * 1.3, y * 1.3, 0.0 - 0.6, 0.0 - 0.4, 12.0) * 2.0 - 1.0',
  'kali(x, y, 0.55, 0.4, 10.0) * 2.0 - 1.0',
  'orbit(x, y, 0.3, 0.5, 14.0) * 2.0 - 1.0',
];

const HASH_BASED = [
  'noise(x * 3.0, y * 3.0) * 2.0 - 1.0',
  'fbm(x * 2.0, y * 2.0, 4.0) * 2.0 - 1.0',
  'worley(x * 4.0, y * 4.0) * 2.0 - 1.0',
  'hash(x, y) * 2.0 - 1.0',
];

/** Runs in the page: render `source` at SIZE² via the real GL path and
 *  compare with the reference interpreter. Returns diff statistics. */
async function measure(page, source) {
  return page.evaluate(async (src) => {
    const { parse } = await import('/src/core/parser.js');
    const { extractParams } = await import('/src/core/constants.js');
    const { transpile } = await import('/src/core/glsl.js');
    const { evaluate } = await import('/src/core/interp.js');
    const { TileRenderer } = await import('/src/render/tile.js');

    const SIZE = 64;
    const TIME = 0.8;
    const { ast, params } = extractParams(parse(src));
    const compiled = transpile(ast);
    if (compiled.mode !== 'scalar') throw new Error('parity corpus is scalar-only');
    const tile = new TileRenderer(SIZE);
    tile.setShader(compiled.fragmentSource, compiled.paramNames, compiled.usesPrev);
    const { pixels, width, height } = tile.readStats({
      time: TIME, mouse: [0.13, -0.27], params, coords: 0,
      palette: 0, smooth: false, tone: 0,
    });

    const diffs = [];
    const got = [];
    const want = [];
    const minRes = Math.min(width, height);
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        // the exact env main() computes for this fragment (u_coords == 0)
        const fx = px + 0.5, fy = py + 0.5;
        const ux = (2 * fx - width) / minRes;
        const uy = (2 * fy - height) / minRes;
        const env = {
          x: ux, y: uy, t: TIME,
          r: Math.hypot(ux, uy), th: Math.atan2(uy, ux),
          mx: 0.13, my: -0.27, i: fx + fy * width,
          dx: 2 / minRes, dy: 2 / minRes,
          params,
        };
        const v = evaluate(ast, env);
        const expected = Math.min(Math.max(v * 0.5 + 0.5, 0), 1) * 255;
        const actual = pixels[(py * width + px) * 4]; // R of the raw render
        want.push(expected);
        got.push(actual);
        diffs.push(Math.abs(actual - expected));
      }
    }
    // Pearson correlation between the GPU image and the reference image —
    // robust to the isolated pixels where float32 crosses a hash-cell border
    const n = diffs.length;
    const mg = got.reduce((s, v) => s + v, 0) / n;
    const mw = want.reduce((s, v) => s + v, 0) / n;
    let num = 0, dg = 0, dw = 0;
    for (let k = 0; k < n; k++) {
      num += (got[k] - mg) * (want[k] - mw);
      dg += (got[k] - mg) ** 2;
      dw += (want[k] - mw) ** 2;
    }
    const corr = num / Math.sqrt(dg * dw || 1);
    diffs.sort((a, b) => a - b);
    const q = (p) => diffs[Math.min(diffs.length - 1, Math.floor(p * diffs.length))];
    const mean = diffs.reduce((s, d) => s + d, 0) / n;
    return { mean, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: diffs[n - 1], corr };
  }, source);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

for (const source of SMOOTH) {
  test(`smooth: ${source}`, async ({ page }) => {
    const s = await measure(page, source);
    expect(s.max, JSON.stringify(s)).toBeLessThanOrEqual(3);
  });
}

for (const source of DISCONTINUOUS) {
  test(`discontinuous: ${source}`, async ({ page }) => {
    const s = await measure(page, source);
    // boundary pixels may land one cell over in f32; the bulk must agree
    expect(s.p95, JSON.stringify(s)).toBeLessThanOrEqual(3);
    expect(s.mean, JSON.stringify(s)).toBeLessThanOrEqual(2);
  });
}

for (const source of HASH_BASED) {
  test(`hash-based: ${source}`, async ({ page }) => {
    const s = await measure(page, source);
    // the JS hash mirrors the GPU's float32 op for op (Math.fround in
    // jsruntime.js) — without that, worley correlation drops to 0.20 because
    // the hash amplifies f32↔f64 rounding into different cell values.
    // Measured with it: max < 1 byte, corr > 0.9999.
    expect(s.max, JSON.stringify(s)).toBeLessThanOrEqual(3);
    expect(s.corr, JSON.stringify(s)).toBeGreaterThanOrEqual(0.999);
  });
}
