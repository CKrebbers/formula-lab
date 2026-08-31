// Display role (?view=display): a bare fullscreen renderer driven entirely by
// the control panel through SyncChannel. Own clock, own mouse; no UI.

import { parse } from './core/parser.js';
import { transpile } from './core/glsl.js';
import { extractParams } from './core/constants.js';
import { Renderer } from './render/gl.js';
import { SyncChannel } from './sync/local.js';

export function initDisplay() {
  document.body.classList.add('display');
  const canvas = document.getElementById('canvas');
  const statusEl = document.getElementById('status');
  statusEl.textContent = 'display — waiting for control panel… (click canvas = fullscreen)';

  const renderer = new Renderer(canvas);
  const sync = new SyncChannel();
  const state = { time: 0, mouse: [0, 0], params: {}, coords: 0 };
  let hasFormula = false;

  sync.on('formula', ({ source, coords, params }) => {
    try {
      const { ast, params: extracted } = extractParams(parse(source));
      const { fragmentSource, paramNames } = transpile(ast);
      renderer.setFragmentShader(fragmentSource, paramNames);
      state.params = { ...extracted, ...params };
      state.coords = coords ?? 0;
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

  canvas.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else canvas.requestFullscreen?.();
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
    renderer.render(state);
    requestAnimationFrame(frame);
  })(performance.now());
}
