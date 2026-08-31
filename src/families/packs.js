// Family packs: AI- (or hand-) generated GENERATIONS of formula families.
// Each pack is a separate unit — toggle on/off, delete — kept apart from the
// built-ins. Import = one JSON list; every formula is validated through the
// full parse→transpile pipeline before it may enter.

import { parse } from '../core/parser.js';
import { extractParams } from '../core/constants.js';
import { transpile } from '../core/glsl.js';
import { COORD_NAMES } from '../store/snapshot.js';

const KEY = 'formula-lab.familypacks.v1';

/** Validate one family entry (shape + full compile). */
export function validateFamily(f) {
  const fail = (error) => ({ ok: false, error });
  if (!f || typeof f !== 'object') return fail('not an object');
  if (typeof f.source !== 'string' || !f.source.trim()) return fail('missing source');
  if (f.coords && !COORD_NAMES.includes(f.coords)) return fail(`unknown coords '${f.coords}'`);
  try {
    const { ast } = extractParams(parse(f.source));
    transpile(ast);
  } catch (err) {
    return fail(err.message);
  }
  return { ok: true };
}

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pack';
}

export class FamilyPacks {
  /** @param {{getItem(k): string|null, setItem(k, v): void}} storage */
  constructor(storage) {
    this.storage = storage;
    this.packs = this.load();
  }

  load() {
    try {
      const raw = JSON.parse(this.storage.getItem(KEY) || '[]');
      return Array.isArray(raw) ? raw.filter((p) => p && Array.isArray(p.families)) : [];
    } catch {
      return [];
    }
  }

  persist() {
    this.storage.setItem(KEY, JSON.stringify(this.packs));
  }

  list() {
    return this.packs;
  }

  /**
   * Import a pack from JSON text: {name, families: [...]} or a bare array.
   * Every family is compiled; invalid ones are dropped (reported, not fatal).
   * @returns {{ pack: object, added: number, rejected: {source, error}[] }}
   */
  importJSON(text) {
    const data = JSON.parse(text);
    const rawFamilies = Array.isArray(data) ? data : data.families;
    if (!Array.isArray(rawFamilies) || !rawFamilies.length) {
      throw new Error('no families array found');
    }
    const name = (Array.isArray(data) ? null : data.name) || `pack-${this.packs.length + 1}`;
    let slug = slugify(name);
    while (this.packs.some((p) => p.id === slug)) slug += 'x';

    const families = [];
    const rejected = [];
    rawFamilies.forEach((f, i) => {
      const check = validateFamily(f);
      if (!check.ok) {
        rejected.push({ source: f?.source ?? '(none)', error: check.error });
        return;
      }
      families.push({
        id: f.id || `${slug}.${i + 1}`,
        name: f.name || `${name} ${i + 1}`,
        source: f.source.trim(),
        params: {},
        coords: f.coords || 'cartesian',
        notes: f.notes || '',
        ref: f.ref || '',
        pack: slug,
      });
    });
    if (!families.length) {
      throw new Error(`all ${rejected.length} formulas failed: ${rejected[0].error}`);
    }
    const pack = {
      id: slug,
      name,
      created: new Date().toISOString(),
      enabled: true,
      families,
    };
    this.packs.push(pack);
    this.persist();
    return { pack, added: families.length, rejected };
  }

  toggle(id, on) {
    const pack = this.packs.find((p) => p.id === id);
    if (!pack) return;
    pack.enabled = on ?? !pack.enabled;
    this.persist();
  }

  remove(id) {
    this.packs = this.packs.filter((p) => p.id !== id);
    this.persist();
  }

  /** Families of all ENABLED packs — feeds the picker and the zero-player. */
  enabledFamilies() {
    return this.packs.filter((p) => p.enabled).flatMap((p) => p.families);
  }
}
