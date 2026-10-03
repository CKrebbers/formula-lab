// Entry: routes to a role. Default = control panel (full UI + local preview,
// broadcasts state); ?view=display = bare fullscreen renderer (display.js).

import { parse } from './core/parser.js';
import { serialize } from './core/ast.js';
import { transpile, PALETTES, TONES } from './core/glsl.js';
import { extractParams } from './core/constants.js';
import { Renderer } from './render/gl.js';
import { TileRenderer } from './render/tile.js';
import { HistCache } from './render/thumbs.js';
import { computeStats, averageStats, shouldReject } from './search/filter.js';
import { noveltyOf, luminanceHistogram } from './search/novelty.js';
import { initEditor } from './ui/editor.js';
import { SliderPanel } from './ui/sliders.js';
import { ContactSheet } from './ui/sheet.js';
import { ArchivePanel } from './ui/archive.js';
import { LineagePanel } from './ui/lineage.js';
import { initFamilyPicker } from './ui/families.js';
import { Archive } from './store/archive.js';
import { createSnapshot, COORD_NAMES } from './store/snapshot.js';
import { encodePermalink, decodePermalink } from './store/url.js';
import { ElitesGrid } from './search/elites.js';
import { Explorer } from './search/explore.js';
import { ElitesPanel } from './ui/elites.js';
import { FAMILIES } from './families/index.js';
import { SyncChannel } from './sync/local.js';
import { CueProgram } from './sync/cue.js';
import { initDisplay } from './display.js';
import { astConstTweak } from './search/mutate.js';
import { StartersStrip } from './ui/starters.js';
import { ModStack } from './core/modulators.js';
import { ModsPanel } from './ui/mods.js';
import { substituteParams } from './core/constants.js';
import { print } from './core/print.js';
import { lhsParamSets, randomExpr } from './search/sample.js';
import { AudioEngine } from './audio/engine.js';
import { FamilyPacks } from './families/packs.js';
import { buildFamilyPrompt } from './families/prompt.js';
import { PacksPanel } from './ui/packs.js';

const VIEW = new URLSearchParams(location.search).get('view');
if (VIEW === 'display') {
  initDisplay();
} else {
  initPanel();
}

function initPanel() {
  const DEFAULT_FORMULA = 'sin(x * y * 4.0 + t) + cos(3.0 * x + t * 0.7)';
  const COORDS = ['cart', 'polar', 'torus'];

  const el = (id) => document.getElementById(id);
  const canvas = el('canvas');
  const statusEl = el('status');
  const textarea = el('formula');

  const state = { time: 0, mouse: [0, 0], params: {}, coords: 0, palette: 0, smooth: false, tone: 0 };
  let currentMode = 'scalar';
  let lastAst = null;          // raw parsed AST (num literals)
  let currentParamAst = null;  // AST with param nodes
  let currentShader = null;    // { fragmentSource, paramNames, usesPrev }
  let currentFamily = null;
  let currentParentIds = [];   // lineage chain: last saved/loaded snapshot
  let pendingOrigin = null;    // 'mutate' | 'crossover' when promoted from a sheet
  let pendingOperator = null;
  let hub = null;              // Varve hub link, only with ?hub=ws://… (sync/hub.js)

  const renderer = new Renderer(canvas);
  const tileRenderer = new TileRenderer(128);
  const archive = new Archive(localStorage);
  const histCache = new HistCache();
  const elites = new ElitesGrid(localStorage);
  const sync = new SyncChannel();
  const cue = new CueProgram((type, payload) => sync.send(type, payload));
  const modStack = new ModStack();
  const audioEngine = new AudioEngine();
  const packs = new FamilyPacks(localStorage);

  const allFamilies = () => [...FAMILIES, ...packs.enabledFamilies()];
  const familyGroups = () => [
    { label: 'built-in', families: FAMILIES },
    ...packs.list().filter((p) => p.enabled).map((p) => ({ label: p.name, families: p.families })),
  ];

  const sliders = new SliderPanel(el('sliders'), (name, value) => {
    state.params[name] = value;
  });

  const sheet = new ContactSheet(el('sheet'), {
    onPromoteParams(params) {
      for (const [name, value] of Object.entries(params)) sliders.setValue(name, value);
      pendingOrigin = 'mutate';
      pendingOperator = 'const_tweak';
    },
    onPromoteFormula({ source, operator }) {
      textarea.value = source;
      editor.apply();
      pendingOrigin = operator === 'crossover' ? 'crossover' : 'mutate';
      pendingOperator = operator;
    },
  });

  const archivePanel = new ArchivePanel(el('archive'), loadSnapshot, (id) => {
    archive.remove(id);
    refreshArchive();
  });

  const lineagePanel = new LineagePanel(el('lineage'), loadSnapshot, (id, rating) => {
    const snap = archive.get(id);
    if (!snap) return;
    archive.save({ ...snap, rating });
    refreshArchive();
    lineagePanel.show({ ...snap, rating }, archive.parents(id), archive.children(id));
  });

  /** Everything the displays need to reproduce the current cue. */
  function cueState() {
    return {
      source: textarea.value, coords: state.coords, params: { ...state.params },
      palette: state.palette, smooth: state.smooth, tone: state.tone,
    };
  }

  /** Commit cue → program: the only path by which a formula reaches a display. */
  function take() {
    cue.take(cueState());
    refreshTakeUI();
  }

  function refreshTakeUI() {
    const armed = cue.isArmed(textarea.value);
    el('take').classList.toggle('armed', armed);
    el('take').disabled = !armed && cue.cueMode;
    el('cue-mode').classList.toggle('active', cue.cueMode);
    el('cue-mode').textContent = cue.cueMode ? 'cue' : 'live edit';
  }

  /** The cue changed. In live-edit mode that commits straight away. */
  function cueChanged() {
    if (!cue.cueMode) take();
    else refreshTakeUI();
  }

  function applyFormula(source) {
    const parsed = parse(source);
    const { ast, params } = extractParams(parsed);
    const compiled = transpile(ast);
    renderer.setFragmentShader(compiled.fragmentSource, compiled.paramNames, compiled.usesPrev);
    tileRenderer.setShader(compiled.fragmentSource, compiled.paramNames, compiled.usesPrev);
    state.params = { ...params };
    currentMode = compiled.mode;
    lastAst = parsed;
    currentParamAst = ast;
    currentShader = {
      fragmentSource: compiled.fragmentSource,
      paramNames: compiled.paramNames,
      usesPrev: compiled.usesPrev,
    };
    sliders.rebuild(params);
    sheet.clear();
    updateStatus();
    cueChanged(); // the panel canvas is the cue preview; displays wait for TAKE
    hub?.refresh(); // new params → new manifest + staat
  }

  function setCoords(index) {
    state.coords = index;
    el('coords').textContent = COORDS[index];
    updateStatus();
    cue.live('coords', { coords: index }, textarea.value);
  }

  function setStyle({ palette = state.palette, smooth = state.smooth, tone = state.tone } = {}) {
    state.palette = Math.min(PALETTES.length - 1, Math.max(0, palette));
    state.smooth = !!smooth;
    state.tone = tone;
    el('palette').value = String(state.palette);
    el('tone').textContent = TONES[state.tone];
    el('smooth').textContent = state.smooth ? '▤' : '▦';
    cue.live(
      'style',
      { palette: state.palette, smooth: state.smooth, tone: state.tone },
      textarea.value
    );
  }

  function updateStatus(extra = '') {
    statusEl.textContent =
      `[${currentMode}] [${COORDS[state.coords]}] ${Object.keys(state.params).length} param(s) · h = hide panel${extra}`;
  }

  function loadSnapshot(snap) {
    textarea.value = snap.formula.source;
    editor.apply();
    for (const [name, value] of Object.entries(snap.params)) {
      if (name in state.params) sliders.setValue(name, value);
    }
    for (const [name, locked] of Object.entries(snap.locks)) sliders.setLock(name, locked);
    setCoords(Math.max(0, COORD_NAMES.indexOf(snap.coords)));
    setStyle(snap);
    currentFamily = snap.family ?? null;
    currentParentIds = [snap.id];
    pendingOrigin = null;
    pendingOperator = null;
    lineagePanel.show(snap, archive.parents(snap.id), archive.children(snap.id));
  }

  function loadFamily(family) {
    textarea.value = family.source;
    editor.apply();
    setCoords(Math.max(0, COORD_NAMES.indexOf(family.coords)));
    currentFamily = family.id;
    pendingOrigin = null;
    pendingOperator = null;
  }

  function saveSnapshot() {
    if (!lastAst) return;
    const s0 = tileRenderer.readStats({ ...state, time: 0 });
    const s1 = tileRenderer.readStats({ ...state, time: 1 });
    const snapshot = createSnapshot({
      source: textarea.value,
      ast: JSON.parse(serialize(lastAst)),
      params: sliders.targetParams(), // glide targets, not transition frames
      locks: sliders.locks,
      coords: COORD_NAMES[state.coords],
      time: state.time,
      thumb: tileRenderer.thumbnail(state),
      origin: pendingOrigin ?? (currentFamily ? 'family' : 'typed'),
      operator: pendingOperator,
      family: currentFamily,
      parent_ids: currentParentIds,
      palette: state.palette,
      smooth: state.smooth,
      tone: state.tone,
    });
    snapshot.stats = averageStats(
      computeStats(s0.pixels, s0.width, s0.height),
      computeStats(s1.pixels, s1.width, s1.height)
    );
    archive.save(snapshot);
    currentParentIds = [snapshot.id];
    refreshArchive();
    lineagePanel.show(snapshot, archive.parents(snapshot.id), archive.children(snapshot.id));
    updateStatus(' · saved');
  }

  async function refreshArchive() {
    const list = archive.list();
    const sort = el('sort').value;
    if (sort === 'top') {
      list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    } else if (sort === 'novel') {
      const hists = await histCache.forSnapshots(list);
      const scored = list.map((snap, i) => ({
        snap,
        score: hists[i]
          ? noveltyOf(hists[i], hists.filter((h, j) => h && j !== i))
          : 0,
      }));
      scored.sort((a, b) => b.score - a.score);
      archivePanel.refresh(scored.map((s) => s.snap));
      return;
    }
    archivePanel.refresh(list);
  }

  async function mutateSheet(partnerAst = null) {
    if (!currentParamAst) return;
    updateStatus(' · mutating…');
    const archiveHists = (await histCache.forSnapshots(archive.list())).filter(Boolean);
    const { shown, tried } = sheet.generateMutations({
      tileRenderer,
      ast: currentParamAst,
      params: sliders.targetParams(),
      locks: sliders.locks,
      state,
      mask: el('mask').value,
      archiveHists,
      partner: partnerAst,
      parentShader: currentShader,
    });
    updateStatus(` · ${shown}/${tried} passed the filter`);
  }

  // --- zero-player auto-explore (v3) --------------------------------------

  const elitesPanel = new ElitesPanel(el('elites'), (snap) => {
    stopAuto();
    loadSnapshot(snap); // elites aren't in the archive, but load fine; save = keep
  });

  async function evaluateCandidate({ source, coords }) {
    try {
      const parsed = parse(source);
      const { ast, params } = extractParams(parsed);
      const compiled = transpile(ast);
      tileRenderer.setShader(compiled.fragmentSource, compiled.paramNames, compiled.usesPrev);
      const coordsIdx = Math.max(0, COORD_NAMES.indexOf(coords));
      const candState = {
        time: 0, mouse: [0, 0], coords: coordsIdx, params,
        palette: state.palette, smooth: state.smooth, tone: state.tone,
      };

      const s0 = tileRenderer.readStats(candState);
      const s1 = tileRenderer.readStats({ ...candState, time: 1 });
      const stats = averageStats(
        computeStats(s0.pixels, s0.width, s0.height),
        computeStats(s1.pixels, s1.width, s1.height)
      );
      if (shouldReject(stats).rejected) return null;

      const thumb = tileRenderer.thumbnail({ ...candState, time: 1 });
      const disp = tileRenderer.renderer.readPixels();
      const hist = luminanceHistogram(disp.pixels, disp.width, disp.height);
      const pool = (await histCache.forSnapshots(
        [...archive.list(), ...elites.all().map((e) => e.snapshot)]
      )).filter(Boolean);
      return { stats, thumb, novelty: noveltyOf(hist, pool), ast: parsed, params };
    } catch {
      return null;
    } finally {
      if (currentShader) {
        tileRenderer.setShader(
          currentShader.fragmentSource, currentShader.paramNames, currentShader.usesPrev);
      }
    }
  }

  const explorer = new Explorer({ families: FAMILIES, evaluate: evaluateCandidate });
  let autoTimer = null;
  let autoBusy = false;

  async function autoStep() {
    if (autoBusy) return;
    autoBusy = true;
    try {
      const result = await explorer.step({
        elites,
        fallbackSource: textarea.value,
        fallbackCoords: COORD_NAMES[state.coords],
      });
      if (result.accepted) {
        const snap = createSnapshot({
          source: result.source,
          ast: JSON.parse(serialize(result.ast)),
          params: result.params,
          coords: result.coords,
          thumb: result.thumb,
          origin: result.origin,
          operator: result.operator,
          family: result.family ?? null,
          parent_ids: result.parentIds ?? [],
          // discoveries wander through looks too — half inherit, half mutate style
          palette: Math.random() < 0.5 ? state.palette : Math.floor(Math.random() * PALETTES.length),
          smooth: Math.random() < 0.5 ? state.smooth : Math.random() < 0.3,
          tone: Math.random() < 0.5 ? state.tone : Math.floor(Math.random() * TONES.length),
        });
        snap.stats = result.stats;
        const placed = elites.consider(snap, result.novelty);
        if (placed.placed) {
          elitesPanel.refresh(elites);
          // zero-player display: the main view follows every new discovery,
          // carrying provenance so a manual 'save' keeps origin/lineage
          textarea.value = snap.formula.source;
          editor.apply();
          setCoords(Math.max(0, COORD_NAMES.indexOf(snap.coords)));
          setStyle(snap);
          pendingOrigin = snap.origin;
          pendingOperator = snap.operator;
          currentFamily = snap.family;
          currentParentIds = [snap.id];
          take(); // the zero-player auto-TAKEs: the display keeps moving
        }
      }
      updateStatus(` · auto: ${elites.count()}/100 cells · ${explorer.found}/${explorer.tried} passed`);
    } finally {
      autoBusy = false;
    }
  }

  function startAuto() {
    if (autoTimer) return;
    autoTimer = setInterval(autoStep, 900);
    el('auto').classList.add('active');
    autoStep();
  }

  function stopAuto() {
    if (!autoTimer) return;
    clearInterval(autoTimer);
    autoTimer = null;
    el('auto').classList.remove('active');
    updateStatus();
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
      params: sliders.targetParams(),
      locks: sliders.locks,
      coords: COORD_NAMES[state.coords],
      palette: state.palette,
      smooth: state.smooth,
      tone: state.tone,
    });
    // never leave the hash in the address bar — it would defeat the random
    // start on the next reload (a pasted link still loads once, then strips)
    const url = location.origin + location.pathname + location.search + hash;
    try {
      await navigator.clipboard.writeText(url);
      updateStatus(' · link copied');
    } catch {
      history.replaceState(null, '', hash); // fallback: copy it from the URL bar
      updateStatus(' · link in URL bar (copy it, then reload strips it)');
    }
  }

  /**
   * Dice (Hydra-style): nudge ONE unlocked constant in the cue formula text.
   * It rewrites the source, so it arms TAKE rather than leaking to the
   * displays — sliders stay the live channel, authoring stays a commit.
   * No §7 filter here on purpose: a human asked for exactly one nudge and is
   * the filter; §7 exists to protect attention from machine bulk (ADR #28).
   */
  function dice() {
    if (!currentParamAst) return;
    const raw = substituteParams(currentParamAst, sliders.targetParams());
    for (let attempt = 0; attempt < 8; attempt++) {
      const child = astConstTweak(raw, Math.random, { locks: sliders.locks });
      if (!child) break; // every constant is locked (or there are none)
      try {
        const source = print(child);
        parse(source); // must survive the round-trip before it reaches the editor
        textarea.value = source;
        editor.apply();
        pendingOrigin = 'mutate';
        pendingOperator = 'const_tweak';
        updateStatus(cue.cueMode ? ' · diced — TAKE to show it' : ' · diced');
        return;
      } catch {
        continue;
      }
    }
    updateStatus(' · dice: nothing unlocked to change');
  }

  const editor = initEditor(textarea, el('error'), applyFormula);

  const starters = new StartersStrip(el('starters'), (starter) => {
    stopAuto();
    textarea.value = starter.source;
    editor.apply();
    setCoords(Math.max(0, COORD_NAMES.indexOf(starter.coords)));
    setStyle(starter);
    currentFamily = null;
    pendingOrigin = null;
    pendingOperator = null;
    take(); // a starter click must produce a living image, not homework
  });
  const familyPicker = initFamilyPicker(el('family'), loadFamily, familyGroups);

  const packsPanel = new PacksPanel(el('packs'), packs, {
    onChange() {
      familyPicker.refresh();
      explorer.families = allFamilies(); // zero-player explores new generations too
    },
    buildPrompt: () => buildFamilyPrompt({
      snapshots: archive.list(),
      elites: elites.all(),
      packNames: packs.list().map((p) => p.name),
    }),
  });
  el('packs-toggle').addEventListener('click', () => {
    el('packs').hidden = !el('packs').hidden;
    packsPanel.refresh();
  });
  explorer.families = allFamilies();

  textarea.addEventListener('input', () => {
    stopAuto(); // typing takes the controls back from the zero-player
    currentFamily = null;
    pendingOrigin = null;
    pendingOperator = null;
  });

  sync.on('hello', () => cue.hello()); // a new display gets program, never cue

  // APC40/LPD8 via the Varve hub (ADR #31). Without ?hub= the module is never
  // loaded: no socket, no timers, nothing changes.
  const hubAddress = new URLSearchParams(location.search).get('hub');
  if (hubAddress) {
    import('./sync/hub.js').then(({ connectPanel }) => {
      hub = connectPanel(hubAddress, {
        state, ranges: () => sliders.ranges(), ast: () => currentParamAst,
        setParam: (name, v) => sliders.setValue(name, v, { smooth: false }),
        setCoords, setStyle, take, dice, status: (s) => updateStatus(` · hub ${s}`),
      });
    });
  }

  el('take').addEventListener('click', take);
  el('dice').addEventListener('click', dice);
  el('cue-mode').addEventListener('click', () => {
    cue.cueMode = !cue.cueMode;
    if (!cue.cueMode) take(); // leaving cue mode publishes what you were editing
    refreshTakeUI();
  });
  el('out').addEventListener('click', () =>
    window.open(`${location.pathname}?view=display`, '_blank'));
  el('auto').addEventListener('click', () => (autoTimer ? stopAuto() : startAuto()));
  const modsPanel = new ModsPanel(el('mods'), modStack, (id, active) => {
    if (id === 'glitch') el('glitch').classList.toggle('active', active);
  });
  el('mods-toggle').addEventListener('click', () => {
    el('mods').hidden = !el('mods').hidden;
    modsPanel.refresh();
  });
  el('glitch').addEventListener('click', () => {
    modStack.toggle('glitch');
    el('glitch').classList.toggle('active', modStack.get('glitch').active);
    modsPanel.refresh();
  });
  el('chaos').addEventListener('input', (e) => {
    modStack.set('glitch', 'amount', parseFloat(e.target.value));
    modsPanel.refresh();
  });
  modStack.set('glitch', 'amount', parseFloat(el('chaos').value));

  function setAudioButtons(activeId) {
    for (const id of ['audio-tab', 'audio-mic']) {
      el(id).classList.toggle('active', id === activeId);
    }
  }
  audioEngine.onStopped = () => setAudioButtons(null);
  async function toggleAudio(id, starter) {
    if (el(id).classList.contains('active')) {
      audioEngine.stop();
      return;
    }
    try {
      await starter();
      setAudioButtons(id);
      updateStatus(' · ♪ listening — set a slider to ♪b/♪m/♪h and raise depth');
    } catch (err) {
      setAudioButtons(null);
      updateStatus(` · audio: ${err.message}`);
    }
  }
  el('audio-tab').addEventListener('click', () => toggleAudio('audio-tab', () => audioEngine.startTab()));
  el('audio-mic').addEventListener('click', () => toggleAudio('audio-mic', () => audioEngine.startMic()));
  el('cap').addEventListener('click', () => {
    const n = sliders.captureAll();
    updateStatus(n ? ` · ⏺ captured ${n} gesture${n > 1 ? 's' : ''} (mode ↺)` : ' · ⏺ no recent movement to capture');
  });
  el('reroll-all').addEventListener('click', () => sliders.rerollAll());
  el('coords').addEventListener('click', () => setCoords((state.coords + 1) % COORDS.length));
  for (const p of PALETTES) el('palette').append(new Option(p.id, String(PALETTES.indexOf(p))));
  el('palette').addEventListener('change', () => setStyle({ palette: parseInt(el('palette').value, 10) }));
  el('tone').addEventListener('click', () => setStyle({ tone: (state.tone + 1) % TONES.length }));
  el('smooth').addEventListener('click', () => setStyle({ smooth: !state.smooth }));
  el('make-sheet').addEventListener('click', () =>
    sheet.generateTweak(tileRenderer, sliders.targetParams(), sliders.locks, state));
  el('mutate').addEventListener('click', () => mutateSheet());
  el('xover').addEventListener('click', () => {
    const pool = archive.list();
    if (!pool.length) return updateStatus(' · save something to cross with first');
    const partner = pool[Math.floor(Math.random() * pool.length)];
    mutateSheet(partner.formula.ast);
  });
  el('save').addEventListener('click', saveSnapshot);
  el('permalink').addEventListener('click', copyPermalink);
  el('export').addEventListener('click', downloadArchive);
  el('import').addEventListener('click', () => el('import-file').click());
  el('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const added = archive.importJSON(await file.text());
      refreshArchive();
      updateStatus(` · imported ${added}`);
    } catch (err) {
      updateStatus(` · import failed: ${err.message}`);
    }
    e.target.value = '';
  });
  el('sort').addEventListener('change', refreshArchive);

  window.addEventListener('mousemove', (e) => {
    state.mouse = [
      (e.clientX / window.innerWidth) * 2 - 1,
      -((e.clientY / window.innerHeight) * 2 - 1),
    ];
  });

  window.addEventListener('keydown', (e) => {
    // Cmd/Ctrl+Enter works from inside the editor too; bare keys must not
    // steal characters while typing a formula
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      take();
      return;
    }
    if (document.activeElement === textarea) return;
    if (e.key === 'h') el('panel').hidden = !el('panel').hidden;
    else if (e.key === 't') take();
    else if (e.key === 'd') dice();
  });

  // startup: a permalink wins; otherwise start somewhere COMPLETELY different
  // every time — a rerolled family (75%) or a fresh random-born formula (25%)
  function randomStart() {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        if (Math.random() < 0.25) {
          const born = {
            type: 'bin',
            op: Math.random() < 0.5 ? '+' : '*',
            left: randomExpr(Math.random, 3),
            right: randomExpr(Math.random, 3),
          };
          textarea.value = print(born);
          editor.apply();
          setCoords(Math.floor(Math.random() * 3));
          return;
        }
        const family = FAMILIES[Math.floor(Math.random() * FAMILIES.length)];
        const { ast, params } = extractParams(parse(family.source));
        const set = lhsParamSets(params, 1, Math.random)[0];
        textarea.value = print(substituteParams(ast, set));
        editor.apply();
        setCoords(Math.max(0, COORD_NAMES.indexOf(family.coords)));
        currentFamily = family.id;
        return;
      } catch {
        continue;
      }
    }
    textarea.value = DEFAULT_FORMULA;
    editor.apply();
  }

  const fromUrl = decodePermalink(location.hash);
  if (fromUrl) {
    textarea.value = fromUrl.source;
    editor.apply();
    // consume the permalink: strip it so the NEXT load starts fresh again
    history.replaceState(null, '', location.pathname + location.search);
  } else {
    randomStart();
  }
  if (fromUrl) {
    for (const [name, value] of Object.entries(fromUrl.params)) {
      if (name in state.params) sliders.setValue(name, value);
    }
    for (const [name, locked] of Object.entries(fromUrl.locks)) sliders.setLock(name, locked);
    setCoords(Math.max(0, COORD_NAMES.indexOf(fromUrl.coords)));
    setStyle(fromUrl);
  }
  setStyle({}); // sync the style controls with initial state
  take();       // bootstrap: program := the state we booted with
  refreshArchive();
  elitesPanel.refresh(elites);
  // starter thumbnails compile a shader each — never on the boot path
  setTimeout(() => starters.renderThumbs(tileRenderer, currentShader), 0);

  const start = performance.now();
  let frameCount = 0;
  let lastSentCoords = null;
  function frame(now) {
    state.time = (now - start) / 1000;
    sliders.tick(state.time, audioEngine.tick(state.time));
    // modulators are a render-time overlay: base params stay clean
    const g = modStack.tick(state.time, state.params, sliders.ranges());
    const renderState = g.modulating
      ? { ...state, params: g.params, coords: g.coords ?? state.coords }
      : state;
    renderer.render(renderState);
    // ~30 Hz live channel (glitch included) — open only while cue and program
    // share a formula, so sliders/LFOs/audio keep driving the live image
    if (frameCount++ % 2 === 0) {
      cue.live('params', { params: renderState.params }, textarea.value);
    }
    if (renderState.coords !== lastSentCoords) {
      if (cue.live('coords', { coords: renderState.coords }, textarea.value)) {
        lastSentCoords = renderState.coords;
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
