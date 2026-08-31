// Bootstrap: editor → parser → param extraction → GLSL → WebGL2, with
// auto-sliders (lock/reroll/LFO), coords toggle, contact sheet and archive.

import { parse } from './core/parser.js';
import { serialize } from './core/ast.js';
import { transpile } from './core/glsl.js';
import { extractParams } from './core/constants.js';
import { Renderer } from './render/gl.js';
import { TileRenderer } from './render/tile.js';
import { initEditor } from './ui/editor.js';
import { SliderPanel } from './ui/sliders.js';
import { ContactSheet } from './ui/sheet.js';
import { ArchivePanel } from './ui/archive.js';
import { Archive } from './store/archive.js';
import { createSnapshot, COORD_NAMES } from './store/snapshot.js';
import { encodePermalink, decodePermalink } from './store/url.js';

const DEFAULT_FORMULA = 'sin(x * y * 4.0 + t) + cos(3.0 * x + t * 0.7)';
const COORDS = ['cart', 'polar', 'torus'];

const el = (id) => document.getElementById(id);
const canvas = el('canvas');
const statusEl = el('status');
const panelEl = el('panel');
const textarea = el('formula');
const errorEl = el('error');

const state = { time: 0, mouse: [0, 0], params: {}, coords: 0 };
let currentMode = 'scalar';
let lastAst = null;

const renderer = new Renderer(canvas);
const tileRenderer = new TileRenderer(128);
const archive = new Archive(localStorage);

const sliders = new SliderPanel(el('sliders'), (name, value) => {
  state.params[name] = value;
});

const sheet = new ContactSheet(el('sheet'), (params) => {
  for (const [name, value] of Object.entries(params)) sliders.setValue(name, value);
});

const archivePanel = new ArchivePanel(
  el('archive'),
  (snap) => loadSnapshot(snap),
  (id) => { archive.remove(id); archivePanel.refresh(archive.list()); }
);

function applyFormula(source) {
  const parsed = parse(source);
  const { ast, params } = extractParams(parsed);
  const { fragmentSource, mode, paramNames } = transpile(ast);
  renderer.setFragmentShader(fragmentSource, paramNames);
  tileRenderer.setShader(fragmentSource, paramNames);
  state.params = { ...params };
  currentMode = mode;
  lastAst = parsed;
  sliders.rebuild(params);
  sheet.clear();
  updateStatus();
}

function setCoords(index) {
  state.coords = index;
  el('coords').textContent = COORDS[index];
  updateStatus();
}

function updateStatus(extra = '') {
  statusEl.textContent =
    `[${currentMode}] [${COORDS[state.coords]}] ${Object.keys(state.params).length} param(s) · h = hide panel${extra}`;
}

function loadSnapshot(snap) {
  textarea.value = snap.formula.source;
  editor.apply(); // rebuilds params from the source literals…
  for (const [name, value] of Object.entries(snap.params)) {
    if (name in state.params) sliders.setValue(name, value); // …then restore live values
  }
  for (const [name, locked] of Object.entries(snap.locks)) sliders.setLock(name, locked);
  setCoords(Math.max(0, COORD_NAMES.indexOf(snap.coords)));
}

function saveSnapshot() {
  if (!lastAst) return;
  const snapshot = createSnapshot({
    source: textarea.value,
    ast: JSON.parse(serialize(lastAst)),
    params: state.params,
    locks: sliders.locks,
    coords: COORD_NAMES[state.coords],
    time: state.time,
    thumb: tileRenderer.thumbnail(state),
    origin: 'typed',
  });
  archive.save(snapshot);
  archivePanel.refresh(archive.list());
  updateStatus(' · saved');
}

function downloadArchive() {
  const blob = new Blob([archive.exportJSON()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `formula-lab-archive-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function copyPermalink() {
  const hash = encodePermalink({
    source: textarea.value,
    params: state.params,
    locks: sliders.locks,
    coords: COORD_NAMES[state.coords],
  });
  history.replaceState(null, '', hash);
  try {
    await navigator.clipboard.writeText(location.href);
    updateStatus(' · link copied');
  } catch {
    updateStatus(' · link in URL bar');
  }
}

const editor = initEditor(textarea, errorEl, applyFormula);

el('reroll-all').addEventListener('click', () => sliders.rerollAll());
el('coords').addEventListener('click', () => setCoords((state.coords + 1) % COORDS.length));
el('make-sheet').addEventListener('click', () =>
  sheet.generate(tileRenderer, state.params, sliders.locks, state));
el('save').addEventListener('click', saveSnapshot);
el('permalink').addEventListener('click', copyPermalink);
el('export').addEventListener('click', downloadArchive);
el('import').addEventListener('click', () => el('import-file').click());
el('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const added = archive.importJSON(await file.text());
    archivePanel.refresh(archive.list());
    updateStatus(` · imported ${added}`);
  } catch (err) {
    updateStatus(` · import failed: ${err.message}`);
  }
  e.target.value = '';
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

// startup: permalink wins over the default formula
const fromUrl = decodePermalink(location.hash);
textarea.value = fromUrl ? fromUrl.source : DEFAULT_FORMULA;
editor.apply();
if (fromUrl) {
  for (const [name, value] of Object.entries(fromUrl.params)) {
    if (name in state.params) sliders.setValue(name, value);
  }
  for (const [name, locked] of Object.entries(fromUrl.locks)) sliders.setLock(name, locked);
  setCoords(Math.max(0, COORD_NAMES.indexOf(fromUrl.coords)));
}
archivePanel.refresh(archive.list());

const start = performance.now();
function frame(now) {
  state.time = (now - start) / 1000;
  sliders.tick(state.time);
  renderer.render(state);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
