// Bootstrap: editor → parser → param extraction → GLSL → WebGL2,
// with auto-sliders driving param uniforms (no recompile on slider moves).

import { parse } from './core/parser.js';
import { transpile } from './core/glsl.js';
import { extractParams } from './core/constants.js';
import { Renderer } from './render/gl.js';
import { initEditor } from './ui/editor.js';
import { SliderPanel } from './ui/sliders.js';

const DEFAULT_FORMULA = 'sin(x * y * 4.0 + t) + cos(3.0 * x + t * 0.7)';

const canvas = document.getElementById('canvas');
const statusEl = document.getElementById('status');
const panelEl = document.getElementById('panel');
const textarea = document.getElementById('formula');
const errorEl = document.getElementById('error');
const slidersEl = document.getElementById('sliders');
const rerollAllBtn = document.getElementById('reroll-all');

const state = { time: 0, mouse: [0, 0], params: {} };

const renderer = new Renderer(canvas);

const sliders = new SliderPanel(slidersEl, (name, value) => {
  state.params[name] = value;
});

function applyFormula(source) {
  const parsed = parse(source);
  const { ast, params } = extractParams(parsed);
  const { fragmentSource, mode, paramNames } = transpile(ast);
  renderer.setFragmentShader(fragmentSource, paramNames);
  state.params = { ...params };
  sliders.rebuild(params);
  statusEl.textContent = `[${mode}]  ${paramNames.length} param(s)  ·  h = hide panel`;
}

const editor = initEditor(textarea, errorEl, applyFormula);

rerollAllBtn.addEventListener('click', () => sliders.rerollAll());

window.addEventListener('mousemove', (e) => {
  state.mouse = [
    (e.clientX / window.innerWidth) * 2 - 1,
    -((e.clientY / window.innerHeight) * 2 - 1),
  ];
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'h' && document.activeElement !== textarea) {
    panelEl.hidden = !panelEl.hidden;
  }
});

textarea.value = DEFAULT_FORMULA;
editor.apply();

const start = performance.now();
function frame(now) {
  state.time = (now - start) / 1000;
  renderer.render(state);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
