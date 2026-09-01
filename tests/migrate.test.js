// Schema migration, against FROZEN fixtures of what each older schema
// actually looked like (ADR #36). Round-tripping a record the current code
// wrote proves nothing about a record written months ago; these files are
// checked in and must never be regenerated to make a test pass.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  migrate, validateSnapshot, createSnapshot, SCHEMA_VERSION, DEFAULT_SCAN,
} from '../src/store/snapshot.js';
import { Archive } from '../src/store/archive.js';
import { parse } from '../src/core/parser.js';

const fixture = (v) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/snapshot-v${v}.json`, import.meta.url)), 'utf8'));

/** Minimal in-memory localStorage stand-in. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
  };
}

describe('v2 → current', () => {
  const v2 = fixture(2);

  it('the fixture really is a v2 record: no scan, no audio stats', () => {
    expect(v2.schema).toBe(2);
    expect('scan' in v2).toBe(false);
    expect(v2.stats.audio).toBeUndefined();
  });

  it('loads, and lands on the current schema as a valid snapshot', () => {
    const out = migrate(v2);
    expect(out.schema).toBe(SCHEMA_VERSION);
    expect(validateSnapshot(out).ok).toBe(true);
  });

  it('gets the documented scan default, with its provenance visible', () => {
    const out = migrate(v2);
    expect(out.scan.path).toBe(DEFAULT_SCAN.path);
    expect(out.scan.freq).toBe(DEFAULT_SCAN.freq);
    // the point: a reader can tell this was never chosen by anyone
    expect(out.scan.origin).toBe('schema-v2-default');
    expect(out.scan.origin).not.toBe('session');
  });

  it('claims no audio measurement it never made', () => {
    expect(migrate(v2).stats.audio).toBeNull();
  });

  it('carries every v2 field through untouched', () => {
    const out = migrate(v2);
    for (const key of ['id', 'created', 'origin', 'family', 'params', 'locks',
      'coords', 'palette', 'smooth', 'tone', 'seed', 'time', 'thumb', 'tags',
      'rating', 'notes']) {
      expect(out[key], `field '${key}' changed during migration`).toEqual(v2[key]);
    }
    expect(out.formula.source).toBe(v2.formula.source);
    expect(() => parse(out.formula.source)).not.toThrow();
    expect(out.stats.entropy).toBe(v2.stats.entropy);
  });
});

describe('v1 and v3 → current', () => {
  it('v1 gains display-style defaults AND the scan default', () => {
    const v1 = fixture(1);
    expect(v1.schema).toBe(1);
    const out = migrate(v1);
    expect(out.schema).toBe(SCHEMA_VERSION);
    expect(out.palette).toBe(0);
    expect(out.smooth).toBe(false);
    expect(out.tone).toBe(0);
    expect(out.scan.origin).toBe('schema-v2-default');
    expect(validateSnapshot(out).ok).toBe(true);
  });

  it('v3 keeps its single measurement as post, and admits pre was not measured', () => {
    const v3 = fixture(3);
    expect(v3.stats.audio.rms).toBeDefined(); // the old flat shape
    const out = migrate(v3);
    expect(out.schema).toBe(SCHEMA_VERSION);
    expect(out.stats.audio.pre).toBeNull();
    expect(out.stats.audio.post).toEqual(v3.stats.audio);
    // a v3 scan WAS a live session setting, so it is tagged as one
    expect(out.scan).toEqual({ origin: 'session', path: 'spiral', freq: 220 });
    expect(validateSnapshot(out).ok).toBe(true);
  });
});

describe('migration invariants', () => {
  it('is idempotent for every fixture', () => {
    for (const v of [1, 2, 3]) {
      const once = migrate(fixture(v));
      expect(migrate(once)).toEqual(once);
    }
  });

  it('a fresh snapshot tags its scan as the session\'s own choice', () => {
    const snap = createSnapshot({
      source: 'sin(x + t)', ast: parse('sin(x + t)'),
      scan: { path: 'line', freq: 330 },
    });
    expect(snap.scan.origin).toBe('session');
    expect(validateSnapshot(snap).ok).toBe(true);
  });

  it('refuses a scan that will not say where it came from', () => {
    const snap = createSnapshot({ source: 'sin(x + t)', ast: parse('sin(x + t)') });
    snap.scan = { path: 'line', freq: 330 };
    expect(validateSnapshot(snap).ok).toBe(false);
  });

  it('an archive holding old records loads them migrated', () => {
    const storage = fakeStorage({
      'formula-lab.archive.v1': JSON.stringify([fixture(1), fixture(2), fixture(3)]),
    });
    const list = new Archive(storage).list();
    expect(list).toHaveLength(3);
    for (const snap of list) {
      expect(snap.schema).toBe(SCHEMA_VERSION);
      expect(validateSnapshot(snap).ok).toBe(true);
      expect(snap.scan.origin).toBeDefined();
    }
  });

  it('still refuses a schema from the future', () => {
    expect(() => migrate({ ...fixture(2), schema: 99 })).toThrow(/newer/);
  });
});
