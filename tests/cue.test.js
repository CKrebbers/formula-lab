import { describe, it, expect } from 'vitest';
import { CueProgram } from '../src/sync/cue.js';
import { STARTERS } from '../src/families/starters.js';
import { parse } from '../src/core/parser.js';
import { transpile } from '../src/core/glsl.js';
import { extractParams } from '../src/core/constants.js';
import { createSnapshot, validateSnapshot, COORD_NAMES } from '../src/store/snapshot.js';
import { encodePermalink, decodePermalink } from '../src/store/url.js';

/** Records everything that would reach a display. */
function mockSync() {
  const sent = [];
  const cue = new CueProgram((type, payload) => sent.push({ type, payload }));
  return { cue, sent, types: () => sent.map((s) => s.type) };
}

const A = { source: 'sin(x + t)', coords: 0, params: { a: 1 }, palette: 0, smooth: false, tone: 0 };
const B = { source: 'cos(y * 3.0)', coords: 1, params: { a: 3 }, palette: 2, smooth: true, tone: 1 };

describe('cue/program: broadcasts are gated by TAKE', () => {
  it('sends nothing until the first take, then one formula', () => {
    const { cue, sent, types } = mockSync();
    expect(sent).toHaveLength(0);
    expect(cue.take(A)).toBe(true);
    expect(types()).toEqual(['formula']);
    expect(sent[0].payload.source).toBe('sin(x + t)');
  });

  it('an edited cue reaches no display and arms TAKE', () => {
    const { cue, sent } = mockSync();
    cue.take(A);
    sent.length = 0;

    // cue now holds B's source; nothing may leave until TAKE
    expect(cue.isArmed(B.source)).toBe(true);
    expect(cue.isLive(B.source)).toBe(false);
    expect(cue.live('params', { params: { a: 99 } }, B.source)).toBe(false);
    expect(cue.live('coords', { coords: 2 }, B.source)).toBe(false);
    expect(cue.live('style', { palette: 4 }, B.source)).toBe(false);
    expect(sent).toHaveLength(0);
    expect(cue.programSource).toBe('sin(x + t)'); // displays still on A
  });

  it('take sends exactly one formula when the source changed', () => {
    const { cue, sent, types } = mockSync();
    cue.take(A);
    sent.length = 0;
    expect(cue.take(B)).toBe(true);
    expect(types()).toEqual(['formula']);
    expect(sent[0].payload).toMatchObject({ source: B.source, coords: 1, palette: 2, tone: 1 });
    expect(cue.isArmed(B.source)).toBe(false);
  });

  it('take sends params only when the source is identical (policy B)', () => {
    const { cue, sent, types } = mockSync();
    cue.take(A);
    sent.length = 0;
    expect(cue.take({ ...A, params: { a: 7 } })).toBe(false);
    expect(types()).toEqual(['params']); // no needless crossfade / feedback reset
    expect(sent[0].payload.params).toEqual({ a: 7 });
  });
});

describe('cue/program: the live channel', () => {
  it('streams uniform-level changes while the formula matches', () => {
    const { cue, sent, types } = mockSync();
    cue.take(A);
    sent.length = 0;
    expect(cue.live('params', { params: { a: 5 } }, A.source)).toBe(true);
    expect(cue.live('coords', { coords: 2 }, A.source)).toBe(true);
    expect(types()).toEqual(['params', 'coords']);
    // program mirrors what the displays actually show
    expect(cue.program.params).toEqual({ a: 5 });
    expect(cue.program.coords).toBe(2);
  });

  it('program keeps its own copy of params (no shared mutation)', () => {
    const { cue } = mockSync();
    const live = { a: 1 };
    cue.take({ ...A, params: live });
    live.a = 42;
    expect(cue.program.params.a).toBe(1);
  });

  it('legacy live-edit mode never arms', () => {
    const { cue } = mockSync();
    cue.take(A);
    cue.cueMode = false;
    expect(cue.isArmed(B.source)).toBe(false); // the panel takes immediately instead
  });
});

describe('cue/program: hello', () => {
  it('answers a display with program, never the cue being edited', () => {
    const { cue, sent } = mockSync();
    cue.take(A);
    sent.length = 0;
    cue.isArmed(B.source); // pretend the panel is mid-edit on B
    cue.hello();
    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe('formula');
    expect(sent[0].payload.source).toBe(A.source);
  });

  it('stays silent before anything has been taken', () => {
    const { cue, sent } = mockSync();
    cue.hello();
    expect(sent).toHaveLength(0);
  });
});

describe('starters', () => {
  it('every starter parses, transpiles and has a usable coords/style', () => {
    expect(STARTERS.length).toBeGreaterThanOrEqual(3);
    expect(STARTERS.length).toBeLessThanOrEqual(6);
    for (const s of STARTERS) {
      const { ast, params } = extractParams(parse(s.source));
      expect(() => transpile(ast), s.id).not.toThrow();
      expect(Object.keys(params).length, `${s.id} needs live constants`).toBeGreaterThan(0);
      expect(COORD_NAMES).toContain(s.coords);
      expect([0, 1, 2]).toContain(s.tone);
      expect(typeof s.smooth).toBe('boolean');
      expect(s.label.length).toBeGreaterThan(0);
    }
    // the strip shows the range of the instrument, not five variations
    expect(STARTERS.some((s) => s.source.includes('prev('))).toBe(true);
    expect(STARTERS.some((s) => s.source.includes('band('))).toBe(true);
    expect(STARTERS.some((s) => s.source.includes('cam('))).toBe(true);
  });

  it('a starter survives the snapshot and permalink round-trips', () => {
    const s = STARTERS[0];
    const { ast, params } = extractParams(parse(s.source));
    const snap = createSnapshot({
      source: s.source,
      ast: parse(s.source),
      params,
      coords: s.coords,
      palette: s.palette,
      smooth: s.smooth,
      tone: s.tone,
      origin: 'family',
    });
    expect(validateSnapshot(snap)).toEqual({ ok: true });

    const round = decodePermalink(encodePermalink({
      source: s.source, params, locks: {}, coords: s.coords,
      palette: s.palette, smooth: s.smooth, tone: s.tone,
    }));
    expect(round.source).toBe(s.source);
    expect(round.tone).toBe(s.tone);
    expect(round.palette).toBe(s.palette);
  });
});
