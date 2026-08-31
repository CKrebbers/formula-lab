// localStorage CRUD for snapshots + JSON export/import + lineage queries.
// Storage is injectable (any object with getItem/setItem) — testable in Node.

import { validateSnapshot, migrate } from './snapshot.js';

const KEY = 'formula-lab.archive.v1';

export class Archive {
  /** @param {{getItem(k: string): string|null, setItem(k: string, v: string): void}} storage */
  constructor(storage) {
    this.storage = storage;
  }

  /** All snapshots, newest first. Silently drops corrupt entries. */
  list() {
    let raw;
    try {
      raw = JSON.parse(this.storage.getItem(KEY) || '[]');
    } catch {
      return [];
    }
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((s) => validateSnapshot(s).ok)
      .sort((a, b) => b.created.localeCompare(a.created));
  }

  get(id) {
    return this.list().find((s) => s.id === id) ?? null;
  }

  /** Validate + upsert (same id overwrites). Throws on invalid snapshots. */
  save(snapshot) {
    const check = validateSnapshot(snapshot);
    if (!check.ok) throw new Error(`Refusing to save invalid snapshot: ${check.error}`);
    const all = this.list().filter((s) => s.id !== snapshot.id);
    all.push(snapshot);
    this.storage.setItem(KEY, JSON.stringify(all));
  }

  remove(id) {
    this.storage.setItem(KEY, JSON.stringify(this.list().filter((s) => s.id !== id)));
  }

  /** Lineage: direct children of a snapshot. */
  children(id) {
    return this.list().filter((s) => s.parent_ids.includes(id));
  }

  /** Lineage: direct parents of a snapshot. */
  parents(id) {
    const snap = this.get(id);
    if (!snap) return [];
    return snap.parent_ids.map((pid) => this.get(pid)).filter(Boolean);
  }

  exportJSON() {
    return JSON.stringify({ app: 'formula-lab', exported: new Date().toISOString(), snapshots: this.list() }, null, 2);
  }

  /**
   * Merge snapshots from an export (or a bare array). Existing ids win —
   * imports never clobber local work. Returns the number added.
   */
  importJSON(json) {
    const data = JSON.parse(json);
    const incoming = Array.isArray(data) ? data : data.snapshots;
    if (!Array.isArray(incoming)) throw new Error('Not a formula-lab export: no snapshots array');
    const existing = new Set(this.list().map((s) => s.id));
    let added = 0;
    for (const snap of incoming) {
      const migrated = migrate(snap);
      if (!validateSnapshot(migrated).ok || existing.has(migrated.id)) continue;
      this.save(migrated);
      existing.add(migrated.id);
      added++;
    }
    return added;
  }
}
