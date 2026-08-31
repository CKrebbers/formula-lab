import { describe, it, expect } from 'vitest';
import { parse } from '../src/core/parser.js';
import { createSnapshot, validateSnapshot, migrate, SCHEMA_VERSION } from '../src/store/snapshot.js';
import { Archive } from '../src/store/archive.js';
import { encodePermalink, decodePermalink } from '../src/store/url.js';

function makeSnap(overrides = {}) {
  return {
    ...createSnapshot({
      source: 'sin(1.7 * x + t)',
      ast: parse('sin(1.7 * x + t)'),
      params: { a: 1.7 },
      locks: { a: false },
      coords: 'polar',
    }),
    ...overrides,
  };
}

/** Minimal in-memory localStorage. */
function mockStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

describe('snapshot: create + validate', () => {
  it('creates a valid schema-1 snapshot with all §4 fields', () => {
    const snap = makeSnap();
    expect(validateSnapshot(snap)).toEqual({ ok: true });
    expect(snap.schema).toBe(SCHEMA_VERSION);
    expect(snap.stats).toHaveProperty('entropy');
    expect(snap.stats).toHaveProperty('spectral_flatness');
    expect(snap.rating).toBeNull();
    expect(snap.parent_ids).toEqual([]);
  });

  it('unique ids per snapshot', () => {
    expect(makeSnap().id).not.toBe(makeSnap().id);
  });

  it('rejects bad origin, coords, params and schema', () => {
    expect(validateSnapshot(makeSnap({ origin: 'magic' })).ok).toBe(false);
    expect(validateSnapshot(makeSnap({ coords: 'spherical' })).ok).toBe(false);
    expect(validateSnapshot(makeSnap({ params: { a: NaN } })).ok).toBe(false);
    expect(validateSnapshot(makeSnap({ schema: 2 })).ok).toBe(false);
  });

  it('migrate is identity for schema 1 and throws on newer', () => {
    const snap = makeSnap();
    expect(migrate(snap)).toBe(snap);
    expect(() => migrate(makeSnap({ schema: 99 }))).toThrow(/newer/);
    expect(() => migrate({})).toThrow(/missing schema/);
  });
});

describe('archive: CRUD + lineage + export/import', () => {
  it('saves, lists (newest first), gets and removes', () => {
    const archive = new Archive(mockStorage());
    const older = makeSnap({ created: '2026-08-30T10:00:00Z' });
    const newer = makeSnap({ created: '2026-08-31T10:00:00Z' });
    archive.save(older);
    archive.save(newer);
    expect(archive.list().map((s) => s.id)).toEqual([newer.id, older.id]);
    expect(archive.get(older.id).id).toBe(older.id);
    archive.remove(older.id);
    expect(archive.list()).toHaveLength(1);
  });

  it('save upserts on the same id', () => {
    const archive = new Archive(mockStorage());
    const snap = makeSnap();
    archive.save(snap);
    archive.save({ ...snap, notes: 'updated' });
    expect(archive.list()).toHaveLength(1);
    expect(archive.get(snap.id).notes).toBe('updated');
  });

  it('refuses invalid snapshots', () => {
    const archive = new Archive(mockStorage());
    expect(() => archive.save(makeSnap({ coords: 'nope' }))).toThrow(/invalid snapshot/);
  });

  it('answers lineage queries', () => {
    const archive = new Archive(mockStorage());
    const parent = makeSnap();
    const child = makeSnap({ parent_ids: [parent.id], origin: 'mutate' });
    archive.save(parent);
    archive.save(child);
    expect(archive.children(parent.id).map((s) => s.id)).toEqual([child.id]);
    expect(archive.parents(child.id).map((s) => s.id)).toEqual([parent.id]);
  });

  it('round-trips export → import without duplicating', () => {
    const a = new Archive(mockStorage());
    a.save(makeSnap());
    a.save(makeSnap());
    const json = a.exportJSON();

    const b = new Archive(mockStorage());
    expect(b.importJSON(json)).toBe(2);
    expect(b.importJSON(json)).toBe(0); // same ids skipped
    expect(b.list()).toHaveLength(2);
  });

  it('survives corrupt storage', () => {
    const storage = mockStorage();
    storage.setItem('formula-lab.archive.v1', '{not json');
    expect(new Archive(storage).list()).toEqual([]);
  });
});

describe('url: permalink', () => {
  it('round-trips source, params, locks and coords', () => {
    const data = {
      source: 'fbm(x + 0.5, y, 4.0) < worley(x * 3.0, y * 3.0)',
      params: { a: 0.5, b: 4, c: 3, d: 3 },
      locks: { a: true, b: false, c: false, d: false },
      coords: 'toroidal',
    };
    const hash = encodePermalink(data);
    expect(hash.startsWith('#f=')).toBe(true);
    expect(decodePermalink(hash)).toEqual(data);
    expect(decodePermalink('https://x.test/index.html' + hash)).toEqual(data);
  });

  it('returns null for garbage', () => {
    expect(decodePermalink('')).toBeNull();
    expect(decodePermalink('#other')).toBeNull();
    expect(decodePermalink('#f=!!!not-lz!!!')).toBeNull();
  });
});
