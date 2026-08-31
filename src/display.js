// Display role (?view=display): a bare fullscreen renderer driven entirely by
// the control panel through SyncChannel. Formula changes CROSSFADE between two
// stacked canvases (~0.9s) — no hard cuts, even when the zero-player is
// swapping genotypes. Own clock, own mouse; no UI.

import { parse } from './core/parser.js';
import { transpile } from './core/glsl.js';
import { extractParams } from './core/constants.js';
import { Renderer } from './render/gl.js';
import { SyncChannel } from './sync/local.js';

const FADE_MS = 900;

export function initDisplay() {
  document.body.classList.add('display');
  const statusEl = document.getElementById('status');
  statusEl.textContent = 'display — waiting for control panel… (click canvas = fullscreen)';

  const canvasA = document.getElementById('canvas');
  const canvasB = document.createElement('canvas');
  document.body.insertBefore(canvasB, statusEl);
  canvasA.classList.add('display-layer');
  canvasB.classList.add('display-layer');
  canvasB.style.opacity = '0';

  const layers = [
    { canvas: canvasA, renderer: new Renderer(canvasA), live: false },
    { canvas: canvasB, renderer: new Renderer(canvasB), live: false },
  ];
  let frontIdx = 0;
  let fadeUntil = 0;
  let zTop = 1;

  const sync = new SyncChannel();
  const state = { time: 0, mouse: [0, 0], params: {}, coords: 0 };
  let hasFormula = false;

  sync.on('formula', ({ source, coords, params }) => {
    const back = layers[1 - frontIdx];
    try {
      const { ast, params: extracted } = extractParams(parse(source));
      const { fragmentSource, paramNames } = transpile(ast);
      back.renderer.setFragmentShader(fragmentSource, paramNames);
      back.live = true;
      state.params = { ...extracted, ...params };
      state.coords = coords ?? 0;

      // crossfade: force the incoming layer to opacity 0 (it may still be at 1
      // from a previous fast swap), then fade 0 → 1 on top of the old one
      back.canvas.style.transition = 'none';
      back.canvas.style.opacity = '0';
      void back.canvas.offsetWidth; // flush so the transition re-arms
      back.canvas.style.transition = '';
      back.canvas.style.zIndex = String(++zTop);
      back.canvas.style.opacity = '1';
      fadeUntil = performance.now() + FADE_MS;
      frontIdx = 1 - frontIdx;

      hasFormula = true;
      statusEl.hidden = true;
    } catch (err) {
      statusEl.hidden = false;
      statusEl.textContent = `display error: ${err.message}`;
    }
  });
  sync.on('params', ({ params }) => Object.assign(state.params, params));
  sync.on('coords', ({ coords }) => { state.coords = coords; });

  // announce until the panel answers with a formula
  const hello = setInterval(() => {
    if (hasFormula) clearInterval(hello);
    else sync.send('hello');
  }, 800);
  sync.send('hello');

  window.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.body.requestFullscreen?.();
  });

  window.addEventListener('mousemove', (e) => {
    state.mouse = [
      (e.clientX / window.innerWidth) * 2 - 1,
      -((e.clientY / window.innerHeight) * 2 - 1),
    ];
  });

  const start = performance.now();
  (function frame(now) {
    state.time = (now - start) / 1000;
    const front = layers[frontIdx];
    const back = layers[1 - frontIdx];
    if (front.live) front.renderer.render(state);
    // keep the outgoing layer alive only while the crossfade runs
    if (back.live && now < fadeUntil) back.renderer.render(state);
    requestAnimationFrame(frame);
  })(performance.now());
}
