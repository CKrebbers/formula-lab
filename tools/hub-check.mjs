#!/usr/bin/env node
// Browser-level check of the Varve hub link (ADR #31), against the real panel:
//   1. WITHOUT ?hub=: the built page (dist, what gets deployed) makes no request
//      beyond itself and opens no WebSocket; on the dev server sync/hub.js is
//      never even fetched; the panel boots without errors.
//   2. WITH ?hub=: AV-app-hub's own conformance test (tools/nep-hub.mjs) passes
//      on dev and dist, and the hub's zet landed on the first slider (the same
//      path as a drag).
//   3. End to end against a logging hub: a zet reaches the displays even while
//      the panel's rAF is stalled (hidden window); a dice click resends only
//      staat; a formula with other params resends manifest + staat.
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
const { WebSocketServer } = await import(resolve(hubRepo, 'node_modules/ws/wrapper.mjs'));

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

  // 3 — end to end against a hub that logs what the panel sends
  const wss = new WebSocketServer({ port: 0, path: '/app' });
  await new Promise((r) => wss.once('listening', r));
  const log = [];
  let sock = null;
  wss.on('connection', (ws) => {
    sock = ws;
    ws.on('message', (d) => log.push(JSON.parse(String(d))));
  });
  const until = async (fn, ms = 5000) => {
    for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 25))) {
      if (fn()) return true;
    }
    return false;
  };
  const types = () => log.map((m) => m.t).filter((t) => t !== 'hb' && t !== 'zet');
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}?hub=${encodeURIComponent(`ws://localhost:${wss.address().port}/app`)}${formula}`);
  await until(() => log.some((m) => m.t === 'staat'));

  // rAF stalled (as in a hidden/minimised panel): the zet must still reach a display
  await page.evaluate(() => {
    window.__raf = window.requestAnimationFrame;
    window.__queued = [];
    window.requestAnimationFrame = (cb) => window.__queued.push(cb);
    window.__live = [];
    new BroadcastChannel('formula-lab-sync').onmessage = (e) => window.__live.push(e.data);
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__live.length = 0; });
  sock.send(JSON.stringify({ t: 'zet', id: 'a', v: 0.9, bron: 'apc40' }));
  await page.waitForTimeout(300);
  const live = await page.evaluate(() => window.__live.filter((m) => m.type === 'params').length);
  check('(e2e) hub zet reaches the displays while the panel rAF is stalled', live > 0, `${live} params message(s)`);
  await page.evaluate(() => {
    window.requestAnimationFrame = window.__raf;
    for (const cb of window.__queued) window.__raf(cb);
  });

  log.length = 0;
  await page.click('#dice');
  await until(() => log.some((m) => m.t === 'staat'));
  await page.waitForTimeout(300);
  check('(e2e) dice click → staat, no manifest', types().join() === 'staat', types().join() || 'nothing');
  const status = await page.textContent('#status');
  check('(e2e) hub status survives other status updates', /· hub connected/.test(status), status);

  log.length = 0;
  await page.fill('#formula', 'sin(x * 2.0) + cos(y * 3.0) + t * 0.1');
  await page.press('#formula', 'Enter');
  await until(() => log.some((m) => m.t === 'staat'));
  await page.waitForTimeout(300);
  const man = log.find((m) => m.t === 'manifest');
  const ids = man?.manifest.params.filter((p) => p.groep === 'formula').map((p) => p.id).join();
  check('(e2e) formula with other params → manifest + staat', types().join() === 'manifest,staat' && ids === 'a,b,c',
    `${types().join()} · formula params ${ids}`);

  // an LFO on a: the hub hears the center it set, never the orbit (pickup keeps its grip)
  await page.evaluate(() => {
    const row = document.querySelector('#sliders .slider-row');
    row.querySelector('button[title^="automation"]').click(); // → sine
    for (const [title, v] of [['rate', 2], ['depth', 0.3]]) {
      const input = row.parentElement.querySelector(`.mini-range[title^="${title}"]`);
      input.value = v;
      input.dispatchEvent(new Event('input'));
    }
  });
  sock.send(JSON.stringify({ t: 'zet', id: 'a', v: 0.7, bron: 'apc40' }));
  await page.waitForTimeout(200);
  log.length = 0;
  const pos = () => page.evaluate(() => document.querySelector('#sliders input[type=range]').value);
  const p1 = await pos();
  await page.waitForTimeout(1200);
  const p2 = await pos();
  const zetA = log.filter((m) => m.t === 'zet' && m.id === 'a');
  check('(e2e) LFO on a param: it moves, but no zet stream to the hub', p1 !== p2 && zetA.length === 0,
    `slider ${p1} → ${p2}, ${zetA.length} zet(s) for a`);
  await page.close();
  for (const c of wss.clients) c.terminate();
  await new Promise((r) => wss.close(r));
  check('(e2e) no page errors', errors.length === 0, errors.join('; '));
} finally {
  await browser.close();
  await server.close();
  dist.close();
}

for (const x of results) console.log(`${x.ok ? '✔' : '✗'} ${x.name}${x.detail ? ` — ${x.detail}` : ''}`);
const ok = results.every((x) => x.ok);
console.log(ok ? '\nformula-lab: hub link OK' : '\nhub link NOT OK');
process.exit(ok ? 0 : 1);
