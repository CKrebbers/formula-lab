# Formula Lab

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
npm install
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
nothing of this loads. `npm run test:hub` runs the hub's conformance test against
the panel (needs an AV-app-hub checkout: `AV_APP_HUB=../av-app-hub`).

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
