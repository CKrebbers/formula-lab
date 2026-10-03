// Varve hub link (AV-app-hub, PROTOCOL.md v1). One daemon on the machine owns
// the APC40 mkII + LPD8; the panel registers its live controls with it and
// gets 0..1 values back. Off unless the panel was opened with ?hub=ws://… —
// without that flag main.js never even loads this module (ADR #31).
//
// Values from the hub take the slider's own path (setValue → onChange →
// state.params → cue.live), scaled into the slider's CURRENT range, so the
// hub can never push a param further than a hand on the slider could, and
// the displays follow exactly as they do for a drag.
//
// No DOM here: the WebSocket class and the panel are injected, so the whole
// protocol is testable in Node.

import { PALETTES, TONES } from '../core/glsl.js';
import { COORD_NAMES } from '../store/snapshot.js';

const APP = 'formula-lab';
const HB_S = 1;
const BACKOFF_MS = [500, 1000, 2000, 5000];
const REPLACED_MS = 30000; // close 4001: another panel took our slot
const POLL_MS = 100;       // own changes (drag, LFO, audio) reach the hub at ≤10 Hz
const MAX_FORMULA_PARAMS = 120; // manifest cap is 128, six are fixed controls

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const toIndex = (v, n) => Math.round(clamp01(v) * (n - 1));

/**
 * The formula param that is a direct multiplier of t (`t * a`, `a * t`):
 * the formula's speed, so it gets the global motion macro. null if none.
 */
export function speedParam(ast) {
  if (!ast || typeof ast !== 'object') return null;
  if (ast.type === 'bin' && ast.op === '*') {
    const { left: l, right: r } = ast;
    if (l.type === 'var' && l.name === 't' && r.type === 'param') return r.name;
    if (r.type === 'var' && r.name === 't' && l.type === 'param') return l.name;
  }
  for (const child of [ast.arg, ast.left, ast.right, ...(ast.args ?? [])]) {
    const found = child && speedParam(child);
    if (found) return found;
  }
  return null;
}

/**
 * Controls for the current panel state. Each: manifest fields plus
 * get() → 0..1 and set(v) / fire().
 * @param {object} p panel adapter (see main.js)
 */
export function panelControls(p) {
  const ranges = p.ranges();
  const speed = speedParam(p.ast());
  const choice = (id, naam, keuzes, get, set, extra = {}) => ({
    id, naam, soort: 'keuze', keuzes, hint: 'kolom', groep: 'look', ...extra,
    get: () => (keuzes.length > 1 ? get() / (keuzes.length - 1) : 0),
    set: (v) => set(toIndex(v, keuzes.length)),
  });
  const params = Object.keys(p.state.params).slice(0, MAX_FORMULA_PARAMS).map((name) => ({
    id: name, naam: name, soort: 'waarde', hint: 'fader', groep: 'formula',
    ...(name === speed ? { rol: 'macro.beweging' } : {}),
    get() {
      const r = ranges[name];
      return r && r.max > r.min ? clamp01((p.state.params[name] - r.min) / (r.max - r.min)) : 0;
    },
    set(v) {
      const r = ranges[name];
      if (r && r.max > r.min) p.setParam(name, r.min + clamp01(v) * (r.max - r.min));
    },
  }));
  return [
    ...params,
    { id: 'take', naam: 'Take', soort: 'trigger', hint: 'pad', groep: 'play', fire: p.take },
    { id: 'dice', naam: 'Dice', soort: 'trigger', hint: 'pad', groep: 'play', fire: p.dice },
    choice('palette', 'Palette', PALETTES.map((x) => x.id), () => p.state.palette,
      (i) => p.setStyle({ palette: i }), { rol: 'macro.kleur' }),
    choice('coords', 'Coords', COORD_NAMES, () => p.state.coords, (i) => p.setCoords(i)),
    { id: 'smooth', naam: 'Smooth', soort: 'schakelaar', hint: 'pad', groep: 'look',
      get: () => (p.state.smooth ? 1 : 0), set: (v) => p.setStyle({ smooth: v >= 0.5 }) },
    choice('tone', 'Tone', TONES, () => p.state.tone, (i) => p.setStyle({ tone: i })),
  ];
}

/**
 * Manifest (PROTOCOL.md §4) for a control list: the fields, not the functions.
 * No `standaard`: values travel in `staat`, so the manifest only changes when
 * the controls themselves do (a dice keeps a, b, c… and resends nothing).
 */
export function buildManifest(controls) {
  return {
    v: 1, app: APP, naam: 'Formula Lab', kleur: '#3fbf5f', truth: 'app', hb_s: HB_S,
    params: controls.map(({ get, set, fire, ...field }) => field),
  };
}

export class HubLink {
  /**
   * @param {{ url: string, controls: () => object[], WebSocket?: any,
   *   onStatus?: (s: string) => void }} o
   */
  constructor({ url, controls, WebSocket = globalThis.WebSocket, onStatus = () => {} }) {
    Object.assign(this, { url, getControls: controls, WS: WebSocket, onStatus });
    this.inst = Math.random().toString(36).slice(2, 10);
    this.attempt = 0;
    this.ws = null;
    this.timers = { poll: null, retry: null };
    this.stopped = true;
    this.controls = [];
    this.manifestJson = '';
    this.sent = {};   // id → last 0..1 the hub knows
    this.lastSend = 0;
  }

  start() {
    this.stopped = false;
    this.connect();
    return this;
  }

  stop() {
    this.stopped = true;
    clearInterval(this.timers.poll);
    clearTimeout(this.timers.retry);
    this.ws?.close();
  }

  /** The formula changed: new manifest when the controls differ, then full staat. */
  refresh() {
    if (this.ws?.readyState !== 1) return;
    this.controls = this.getControls();
    const json = JSON.stringify(buildManifest(this.controls));
    if (json !== this.manifestJson) this.send({ t: 'manifest', manifest: JSON.parse(json) });
    this.manifestJson = json;
    this.sent = {};
    for (const c of this.controls) if (c.soort !== 'trigger') this.sent[c.id] = c.get();
    this.send({ t: 'staat', waarden: { ...this.sent } });
  }

  connect() {
    let ws;
    try {
      ws = new this.WS(this.url);
    } catch {
      return this.retry(0);
    }
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.manifestJson = '';
      this.send({ t: 'hallo', app: APP, inst: this.inst, v: 1 });
      this.refresh();
      this.timers.poll = setInterval(() => this.poll(), POLL_MS);
      this.onStatus('connected');
    };
    ws.onmessage = (e) => {
      try {
        this.receive(JSON.parse(e.data));
      } catch {
        // malformed or a throwing control: never let the hub break the panel
      }
    };
    ws.onclose = (e) => {
      clearInterval(this.timers.poll);
      if (this.ws !== ws) return;
      this.ws = null;
      if (!this.stopped) this.retry(e?.code);
    };
    ws.onerror = () => {};
  }

  retry(code) {
    const wait = code === 4001 ? REPLACED_MS : BACKOFF_MS[Math.min(this.attempt++, BACKOFF_MS.length - 1)];
    this.onStatus(code === 4001 ? 'replaced by another panel' : 'offline, retrying');
    this.timers.retry = setTimeout(() => this.connect(), wait);
  }

  send(msg) {
    if (this.ws?.readyState !== 1) return;
    this.ws.send(JSON.stringify(msg));
    this.lastSend = Date.now();
  }

  /** Hub → panel. Unknown types and unknown ids are ignored (§1.5). */
  receive(msg) {
    const c = this.controls.find((x) => x.id === msg?.id);
    if (!c) return;
    if (msg.t === 'zet' && c.set && Number.isFinite(msg.v)) {
      c.set(clamp01(msg.v));
      this.sent[c.id] = c.get(); // the hub already knows: no echo
    } else if (msg.t === 'trig' && c.fire && msg.aan === true) {
      c.fire();
    }
  }

  /** Panel → hub: changes the panel made itself, plus the heartbeat. */
  poll() {
    for (const c of this.controls) {
      if (c.soort === 'trigger') continue;
      const v = c.get();
      if (Math.abs(v - (this.sent[c.id] ?? -1)) > 0.001) {
        this.sent[c.id] = v;
        this.send({ t: 'zet', id: c.id, v });
      }
    }
    if (Date.now() - this.lastSend >= HB_S * 800) this.send({ t: 'hb' });
  }
}

/** Panel entry point: null (and no socket) without a ws:// or wss:// address. */
export function connectPanel(url, panel, WebSocket = globalThis.WebSocket) {
  if (!/^wss?:\/\//.test(url ?? '') || !WebSocket) return null;
  return new HubLink({ url, WebSocket, controls: () => panelControls(panel), onStatus: panel.status }).start();
}
