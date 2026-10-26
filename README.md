# Formula Lab

> **README FIRST**
> - **What:** a browser instrument where a formula `f(x, y, t)` becomes a live animated image, with tools that search for formulas worth keeping (mutation, crossover, a zero-player explorer) and play them live (sliders, audio bands, cue/take).
> - **For whom:** visual artists and creative coders who like glitch, dither and texture and are comfortable with a terminal. Built for Clay's own live-AV setup; a personal tool, no support promised.
> - **Install:** Node 20 or newer, then `git clone https://github.com/CKrebbers/formula-lab && cd formula-lab && npm ci && npm run dev` and open http://localhost:5174. For one portable file: `npm run build`, then serve `dist/` with any static server (for example `npx vite preview`) — audio capture needs HTTPS or localhost, so do not open it from `file://`.
> - **Tested on:** `npm ci`, `npm test` (235 pass, 1 skipped: the optional AV-app-hub conformance test) and `npm run build` on Node 22 (Linux); the deploy workflow builds on Node 20. In a real browser it is used on Chrome (macOS) with WebGL2; other browsers and a hosted copy are untested by anyone but its author. Controllers (APC40/LPD8) need the separate AV-app-hub and are optional.
> - **Price and licence:** free, MIT (see `LICENSE`), no warranty.

A browser instrument where a mathematical formula `f(x, y, t)` becomes a live
animated image — and where the tool helps you *search* for formulas worth
keeping, instead of only rendering the ones you already thought of.

Everything runs in the browser. No backend, no accounts, no build step to use
it: the published page is a single self-contained HTML file, and your archive
lives in your own browser's local storage.

## What it does

- **Type a formula, get an image.** A whitelisted language (no `eval`) is parsed
  to an AST and transpiled to a WebGL2 fragment shader. Errors point at the
  exact column.
- **Every constant becomes a slider**, and every slider can be automated — LFO
  shapes, live audio bands (bass/mid/high), or a gesture you just performed and
  captured.
- **The tool searches with you.** Mutation operators, crossover, an
  interestingness filter and novelty scoring produce contact sheets of children;
  a zero-player mode explores on its own and fills a 10×10 grid of maximally
  different results.
- **It is playable live.** A cue/take model keeps the display windows steady
  while you edit; sliders and audio keep streaming until you commit.
- **The image can feed on itself** via `prev(x, y)`, a previous-frame buffer.

## Run it locally

```bash
npm ci
npm run dev      # http://localhost:5174 (fixed; av-kern owns 5173)
npm test         # vitest
npm run build    # dist/index.html — one portable file
```

Open a second window with `?view=display` for a bare fullscreen output; the
control panel drives it over BroadcastChannel (same browser, same origin).

### Controllers via the Varve hub

With the Varve hub (AV-app-hub) running, open the panel as
`http://localhost:5174/?hub=ws://localhost:7700/app`: the APC40/LPD8 then drive the
formula's constants, TAKE, dice, palette, coords, smooth and tone. Without `?hub=`
nothing of this loads. Keep the panel window visible (display fullscreen on the
other screen, not over the panel): browsers throttle timers in hidden windows, and
the hub then loses the heartbeat.

`npm run test:hub` runs the hub's conformance test against the panel in Chromium.
It needs an AV-app-hub checkout and, when playwright-core has no browser of its
own, a Chromium binary:

```bash
AV_APP_HUB=../av-app-hub CHROMIUM=/path/to/chromium npm run test:hub
```

`npm test` runs the protocol-level conformance test too when `AV_APP_HUB` (or a
sibling `../av-app-hub`) exists, and says so when it skips it.

## Notes

- WebGL2 only, deliberately: it targets a 2014 Radeon as well as current
  hardware. No WebGPU.
- Audio capture and clipboard permalinks need a secure context (HTTPS or
  localhost).
- Local storage is per-origin: use the export/import buttons to move an archive
  between the dev server and the hosted page.

Docs for contributors and AI collaborators live in `docs/` — `CLAUDE.md` is the
project brief, `docs/TODO.md` the ordered backlog, `docs/DECISIONS.md` the
append-only decision log.
