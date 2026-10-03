import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from '../src/core/parser.js';
import { extractParams, inferRange } from '../src/core/constants.js';
import { speedParam, panelControls, buildManifest, connectPanel } from '../src/sync/hub.js';

/** Stand-in for main.js: the same adapter shape, sliders reduced to state. */
function fakePanel(source = 'sin(x * 4.0 + t * 0.7) + 0.5') {
  const { ast, params } = extractParams(parse(source));
  const ranges = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, inferRange(v)]));
  const calls = [];
  const panel = {
    state: { params: { ...params }, coords: 0, palette: 0, smooth: false, tone: 0 },
    ranges: () => ranges,
    ast: () => ast,
    setParam: (name, v) => { panel.state.params[name] = v; calls.push(['param', name, v]); },
    setCoords: (i) => { panel.state.coords = i; },
    setStyle: (s) => Object.assign(panel.state, s),
    take: () => calls.push(['take']),
    dice: () => calls.push(['dice']),
    status: () => {},
    calls,
    swap(src) { // the formula changed (applyFormula)
      const next = extractParams(parse(src));
      panel.state.params = next.params;
      for (const k of Object.keys(ranges)) delete ranges[k];
      for (const [k, v] of Object.entries(next.params)) ranges[k] = inferRange(v);
      panel.ast = () => next.ast;
    },
  };
  return panel;
}

/** Minimal browser-style WebSocket that records what the app sends. */
class FakeWS {
  static all = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.out = [];
    FakeWS.all.push(this);
  }
  send(s) { this.out.push(JSON.parse(s)); }
  close() { this.drop(1000); }
  open() { this.readyState = 1; this.onopen?.(); }
  drop(code) { this.readyState = 3; this.onclose?.({ code }); }
  hub(msg) { this.onmessage?.({ data: typeof msg === 'string' ? msg : JSON.stringify(msg) }); }
  sent(t) { return this.out.filter((m) => m.t === t); }
}

describe('hub: manifest', () => {
  it('formula params become faders, the t-multiplier gets macro.beweging', () => {
    const m = buildManifest(panelControls(fakePanel()));
    expect(m).toMatchObject({ v: 1, app: 'formula-lab', truth: 'app', hb_s: 1 });
    const byId = Object.fromEntries(m.params.map((p) => [p.id, p]));
    expect(byId.a).toMatchObject({ soort: 'waarde', hint: 'fader' });
    expect(byId.b.rol).toBe('macro.beweging'); // t * 0.7
    expect(byId.a.rol).toBeUndefined();
    expect(byId.take.soort).toBe('trigger');
    expect(byId.dice.soort).toBe('trigger');
    expect(byId.palette).toMatchObject({ soort: 'keuze', rol: 'macro.kleur' });
    expect(byId.coords.keuzes).toEqual(['cartesian', 'polar', 'toroidal']);
    expect(byId.smooth.soort).toBe('schakelaar');
    expect(byId.tone.keuzes).toEqual(['clamp', 'wrap', 'fold']);
    expect(m.params.every((p) => typeof p.get !== 'function')).toBe(true);
  });

  it('speedParam finds t * k and k * t, else null', () => {
    const sp = (s) => speedParam(extractParams(parse(s)).ast);
    expect(sp('sin(x * 3.0 + 2.0 * t)')).toBe('b');
    expect(sp('sin(x + t)')).toBe(null);
  });
});

describe('hub: values stay inside the slider range', () => {
  it('0..1 maps onto the live range; out-of-range input is clamped', () => {
    const panel = fakePanel();
    const a = panelControls(panel).find((c) => c.id === 'a');
    const r = panel.ranges().a;
    a.set(0.25);
    expect(panel.state.params.a).toBeCloseTo(r.min + 0.25 * (r.max - r.min));
    expect(a.get()).toBeCloseTo(0.25);
    a.set(7);
    expect(panel.state.params.a).toBeCloseTo(r.max);
    a.set(-3);
    expect(panel.state.params.a).toBeCloseTo(r.min);
  });

  it('choices round to a valid index', () => {
    const panel = fakePanel();
    const c = panelControls(panel);
    c.find((x) => x.id === 'palette').set(0.99);
    c.find((x) => x.id === 'tone').set(0.5);
    c.find((x) => x.id === 'smooth').set(1);
    expect(panel.state).toMatchObject({ palette: 4, tone: 1, smooth: true });
  });
});

describe('hub: connection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWS.all = [];
  });
  afterEach(() => vi.useRealTimers());

  it('without a ws:// address nothing is created and no socket opens', () => {
    expect(connectPanel(null, fakePanel(), FakeWS)).toBe(null);
    expect(connectPanel('', fakePanel(), FakeWS)).toBe(null);
    expect(connectPanel('http://localhost:7700/app', fakePanel(), FakeWS)).toBe(null);
    vi.advanceTimersByTime(10000);
    expect(FakeWS.all).toHaveLength(0);
  });

  it('hallo → manifest → staat with every non-trigger value', () => {
    const link = connectPanel('ws://localhost:7700/app', fakePanel(), FakeWS);
    const ws = FakeWS.all[0];
    ws.open();
    expect(ws.out.map((m) => m.t)).toEqual(['hallo', 'manifest', 'staat']);
    expect(ws.out[0]).toMatchObject({ app: 'formula-lab', v: 1 });
    expect(Object.keys(ws.out[2].waarden).sort())
      .toEqual(['a', 'b', 'c', 'coords', 'palette', 'smooth', 'tone']);
    link.stop();
  });

  it('applies zet and trig, ignores unknown messages and ids, does not echo', () => {
    const panel = fakePanel();
    const link = connectPanel('ws://h/app', panel, FakeWS);
    const ws = FakeWS.all[0];
    ws.open();
    ws.out.length = 0;
    ws.hub({ t: 'zet', id: 'a', v: 0.25, bron: 'apc40' });
    ws.hub({ t: 'trig', id: 'take', aan: true });
    ws.hub({ t: 'trig', id: 'take', aan: false });
    ws.hub({ t: 'trig', id: 'dice', aan: true });
    ws.hub({ t: 'zet', id: 'nope', v: 1 });
    ws.hub({ t: 'globaal', waarden: { 'macro.ruimte': 0.5 } });
    ws.hub({ t: 'iets-nieuws', x: 1 });
    ws.hub('not json');
    expect(panel.calls.map((c) => c[0])).toEqual(['param', 'take', 'dice']);
    vi.advanceTimersByTime(150);
    expect(ws.sent('zet')).toHaveLength(0); // the hub set it; it already knows
    link.stop();
  });

  it('own changes go out as zet; silence goes out as hb within hb_s', () => {
    const panel = fakePanel();
    const link = connectPanel('ws://h/app', panel, FakeWS);
    const ws = FakeWS.all[0];
    ws.open();
    ws.out.length = 0;
    panel.state.palette = 2; // e.g. the dropdown
    vi.advanceTimersByTime(100);
    expect(ws.sent('zet')).toEqual([{ t: 'zet', id: 'palette', v: 0.5 }]);
    vi.advanceTimersByTime(3000);
    const hbs = ws.sent('hb').length;
    expect(hbs).toBeGreaterThanOrEqual(3);
    link.stop();
  });

  it('a new formula resends the manifest only when the params differ', () => {
    const panel = fakePanel();
    const link = connectPanel('ws://h/app', panel, FakeWS);
    const ws = FakeWS.all[0];
    ws.open();
    ws.out.length = 0;
    panel.state.params.a = 5; // a dice: same names, new value
    link.refresh();
    expect(ws.out.map((m) => m.t)).toEqual(['staat']);
    panel.swap('fbm(x * 2.0, y, 3.0) + t * 0.2 + 1.0 + 2.0');
    link.refresh();
    expect(ws.out.map((m) => m.t)).toEqual(['staat', 'manifest', 'staat']);
    expect(ws.out[1].manifest.params.filter((p) => p.groep === 'formula').map((p) => p.id))
      .toEqual(['a', 'b', 'c', 'd', 'e']);
    link.stop();
  });

  it('reconnects 0.5 → 1 → 2 → 5 → 5 s, resets on success, waits 30 s after 4001', () => {
    const link = connectPanel('ws://h/app', fakePanel(), FakeWS);
    const waits = [];
    for (let i = 0; i < 5; i++) {
      const before = FakeWS.all.length;
      FakeWS.all.at(-1).drop(1006);
      let ms = 0;
      while (FakeWS.all.length === before) { vi.advanceTimersByTime(50); ms += 50; }
      waits.push(ms);
    }
    expect(waits).toEqual([500, 1000, 2000, 5000, 5000]);

    FakeWS.all.at(-1).open();
    FakeWS.all.at(-1).drop(1006);
    vi.advanceTimersByTime(500);
    expect(FakeWS.all).toHaveLength(7); // back to 0.5 s after a good connection

    FakeWS.all.at(-1).drop(4001);
    vi.advanceTimersByTime(29900);
    expect(FakeWS.all).toHaveLength(7);
    vi.advanceTimersByTime(100);
    expect(FakeWS.all).toHaveLength(8);
    link.stop();
  });

  it('stop() closes and never reconnects', () => {
    const link = connectPanel('ws://h/app', fakePanel(), FakeWS);
    FakeWS.all[0].open();
    link.stop();
    vi.advanceTimersByTime(60000);
    expect(FakeWS.all).toHaveLength(1);
  });
});

// The hub's own conformance test (tools/nep-hub.mjs), driven at protocol level
// with the panel adapter. Runs when AV-app-hub is checked out next to this repo
// (or AV_APP_HUB points at it); the browser-level run is `npm run test:hub`.
const HUB_REPO = process.env.AV_APP_HUB ?? resolve(__dirname, '../../av-app-hub');
const hasHub = existsSync(resolve(HUB_REPO, 'tools/nep-hub.mjs'));

describe.skipIf(!hasHub)('hub: AV-app-hub conformance (nep-hub toetsApp)', () => {
  it('passes every check', async () => {
    const { toetsApp } = await import(resolve(HUB_REPO, 'tools/nep-hub.mjs'));
    const WS = globalThis.WebSocket ?? (await import(resolve(HUB_REPO, 'node_modules/ws/wrapper.mjs'))).default;
    let link = null;
    const r = await toetsApp({ poort: 0, start: (url) => { link = connectPanel(url, fakePanel(), WS); } });
    link?.stop();
    expect(r.uitslagen.filter((u) => !u.ok)).toEqual([]);
    expect(r.ok).toBe(true);
  }, 20000);
});
