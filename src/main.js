// Bootstrap: editor → parser → param extraction → GLSL → WebGL2,
// with auto-sliders (lock/reroll/LFO), coordinate toggle and contact sheet.

import { parse } from './core/parser.js';
import { transpile } from './core/glsl.js';
import { extractParams } from './core/constants.js';
import { Renderer } from './render/gl.js';
import { TileRenderer } from './render/tile.js';
import { initEditor } from './ui/editor.js';
import { SliderPanel } from './ui/sliders.js';
import { ContactSheet } from './ui/sheet.js';

const DEFAULT_FORMULA = 'sin(x * y * 4.0 + t) + cos(3.0 * x + t * 0.7)';
const COORDS = ['cart', 'polar', 'torus'];

const canvas = document.getElementById('canvas');
const statusEl = document.getElementById('status');
const panelEl = document.getElementById('panel');
const textarea = document.getElementById('formula');
const errorEl = document.getElementById('error');
const slidersEl = document.getElementById('sliders');
const sheetEl = document.getElementById('sheet');
const rerollAllBtn = document.getElementById('reroll-all');
const coordsBtn = document.getElementById('coords');
const sheetBtn = document.getElementById('make-sheet');

const state = { time: 0, mouse: [0, 0], params: {}, coords: 0 };
let currentMode = 'scalar';

const renderer = new Renderer(canvas);
const tileRenderer = new TileRenderer(128);

const sliders = new SliderPanel(slidersEl, (name, value) => {
  state.params[name] = value;
});

const sheet = new ContactSheet(sheetEl, (params) => {
  for (const [name, value] of Object.entries(params)) {
    sliders.setValue(name, value);
  }
});

function applyFormula(source) {
  const parsed = parse(source);
  const { ast, params } = extractParams(parsed);
  const { fragmentSource, mode, paramNames } = transpile(ast);
  renderer.setFragmentShader(fragmentSource, paramNames);
  tileRenderer.setShader(fragmentSource, paramNames);
  state.params = { ...params };
  currentMode = mode;
  sliders.rebuild(params);
  sheet.clear();
  updateStatus();
}

function updateStatus() {
  statusEl.textContent =
    `[${currentMode}] [${COORDS[state.coords]}] ${Object.keys(state.params).length} param(s) · h = hide panel`;
}

const editor = initEditor(textarea, errorEl, applyFormula);

rerollAllBtn.addEventListener('click', () => sliders.rerollAll());

coordsBtn.addEventListener('click', () => {
  state.coords = (state.coords + 1) % COORDS.length;
  coordsBtn.textContent = COORDS[state.coords];
  updateStatus();
});

sheetBtn.addEventListener('click', () => {
  sheet.generate(tileRenderer, state.params, sliders.locks, state);
});

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
  sliders.tick(state.time);
  renderer.render(state);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
