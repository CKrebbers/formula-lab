#!/usr/bin/env node
// Browser-level check of the Varve hub link (ADR #31), against the real panel:
//   1. WITHOUT ?hub=: the built page (dist, what gets deployed) makes no request
//      beyond itself and opens no WebSocket; on the dev server sync/hub.js is
//      never even fetched; the panel boots without errors.
//   2. WITH ?hub=: AV-app-hub's own conformance test (tools/nep-hub.mjs) passes
//      on dev and dist, and the hub's zet landed on the first slider (the same
//      path as a drag).
// Needs an AV-app-hub checkout (for nep-hub + playwright-core) and a Chromium:
//   AV_APP_HUB=../av-app-hub CHROMIUM=/path/to/chromium npm run test:hub
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createHttp } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer, build } from 'vite';
import lz from 'lz-string';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hubRepo = resolve(process.env.AV_APP_HUB ?? resolve(root, '../av-app-hub'));
const { toetsApp } = await import(resolve(hubRepo, 'tools/nep-hub.mjs'));
const { chromium } = await import(resolve(hubRepo, 'node_modules/playwright-core/index.mjs'));

// a fixed formula (the panel otherwise starts somewhere random): a, b are faders
const formula = `#f=${lz.compressToEncodedURIComponent(JSON.stringify({ v: 1, source: 'sin(x * 4.0 + t * 0.7)' }))}`;

const outDir = await mkdtemp(resolve(tmpdir(), 'formula-lab-hub-'));
await build({ root, logLevel: 'error', build: { outDir, emptyOutDir: true } });
const html = await readFile(resolve(outDir, 'index.html'));
const dist = createHttp((req, res) => res.end(html)).listen(0);
const distUrl = `http://localhost:${dist.address().port}/`;

const server = await createServer({ root, server: { port: 0, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });

try {
  // 1 — no flag, no change
  const errors = [];
  const open = async (url) => {
    const page = await browser.newPage();
    const seen = { urls: [], sockets: [] };
    page.on('request', (r) => seen.urls.push(r.url()));
    page.on('websocket', (ws) => seen.sockets.push(ws.url()));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => /param\(s\)/.test(document.getElementById('status').textContent));
    await page.waitForTimeout(2000);
    await page.close();
    return seen;
  };
  const built = await open(distUrl);
  const extra = built.urls.filter((u) => u !== distUrl && !u.startsWith('data:') && !u.startsWith('blob:'));
  check('no flag (dist): no request beyond the page itself', extra.length === 0, extra.join(', '));
  check('no flag (dist): no WebSocket opened', built.sockets.length === 0, built.sockets.join(', '));
  const dev = await open(base);
  check('no flag (dev): sync/hub.js never fetched', !dev.urls.some((u) => u.includes('sync/hub.js')));
  check('no flag: panel boots without errors', errors.length === 0, errors.join('; '));

  // 2 — with ?hub=: the hub's conformance test, on the dev server and on dist
  for (const [where, url0] of [['dev', base], ['dist', distUrl]]) {
    const live = await browser.newPage();
    live.on('pageerror', (e) => errors.push(e.message));
    const r = await toetsApp({ poort: 0, start: (url) => live.goto(`${url0}?hub=${encodeURIComponent(url)}${formula}`) });
    for (const u of r.uitslagen) check(`toets (${where}): ${u.naam}`, u.ok, u.detail);
    const pos = await live.evaluate(() => {
      const s = document.querySelector('#sliders input[type=range]');
      return s ? (s.value - s.min) / (s.max - s.min) : null;
    });
    check(`(${where}) hub zet 0.25 put the first slider at 25% of its range`, Math.abs(pos - 0.25) < 0.01, `at ${pos}`);
    await live.close();
  }
  check('with flag: no page errors', errors.length === 0, errors.join('; '));
} finally {
  await browser.close();
  await server.close();
  dist.close();
}

for (const x of results) console.log(`${x.ok ? '✔' : '✗'} ${x.name}${x.detail ? ` — ${x.detail}` : ''}`);
const ok = results.every((x) => x.ok);
console.log(ok ? '\nformula-lab: hub link OK' : '\nhub link NOT OK');
process.exit(ok ? 0 : 1);
