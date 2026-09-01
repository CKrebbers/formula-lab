// Snapshot schema v1 (§4, frozen): create, validate, migrate.
// No DOM dependency — testable in Node.

export const SCHEMA_VERSION = 3; // v2: display style · v3: AV layer — scan
// settings + stats.audio {rms, crest, flatness}, so presets record how
// interesting image and sound are INDEPENDENTLY (ADR 001 phase 3)

export const COORD_NAMES = ['cartesian', 'polar', 'toroidal'];
export const ORIGINS = ['typed', 'mutate', 'crossover', 'sample', 'llm', 'family'];

const EMPTY_STATS = {
  entropy: 0.0,
  edge_density: 0.0,
  color_variance: 0.0,
  symmetry: 0.0,
  spectral_flatness: 0.0,
  audio: null, // filled at save time: { rms, crest, flatness } — or null
};

/**
 * Build a new schema-1 snapshot. Stats are zeroed in v1 — the §7 filter (v2)
 * fills them in; the shape is frozen so nothing downstream breaks.
 */
export function createSnapshot({
  source,
  ast,
  params = {},
  locks = {},
  coords = 'cartesian',
  seed = Math.floor(Math.random() * 2 ** 31),
  time = 0.0,
  thumb = '',
  origin = 'typed',
  operator = null,
  family = null,
  parent_ids = [],
  palette = 0,
  smooth = false,
  tone = 0,
  scan = null, // { path, freq } — how a field formula was being sonified
}) {
  return {
    schema: SCHEMA_VERSION,
    id: crypto.randomUUID(),
    created: new Date().toISOString(),
    parent_ids,
    origin,
    operator,
    family,
    formula: { source, ast },
    params: { ...params },
    locks: { ...locks },
    coords,
    palette,
    smooth,
    tone,
    scan: scan ? { ...scan } : null,
    seed,
    time,
    stats: { ...EMPTY_STATS },
    thumb,
    tags: [],
    rating: null,
    notes: '',
  };
}

/** Returns { ok: true } or { ok: false, error }. */
export function validateSnapshot(snap) {
  const fail = (error) => ({ ok: false, error });
  if (!snap || typeof snap !== 'object') return fail('Snapshot is not an object');
  if (snap.schema !== SCHEMA_VERSION) return fail(`Unsupported schema ${snap.schema}`);
  if (typeof snap.id !== 'string' || !snap.id) return fail('Missing id');
  if (typeof snap.created !== 'string') return fail('Missing created timestamp');
  if (!Array.isArray(snap.parent_ids)) return fail('parent_ids must be an array');
  if (!ORIGINS.includes(snap.origin)) return fail(`Unknown origin '${snap.origin}'`);
  if (!snap.formula || typeof snap.formula.source !== 'string' || !snap.formula.ast) {
    return fail('Missing formula.source / formula.ast');
  }
  if (typeof snap.params !== 'object') return fail('params must be an object');
  for (const [k, v] of Object.entries(snap.params)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return fail(`param '${k}' is not a finite number`);
  }
  if (!COORD_NAMES.includes(snap.coords)) return fail(`Unknown coords '${snap.coords}'`);
  if (!Number.isInteger(snap.palette) || snap.palette < 0) return fail('palette must be a non-negative integer');
  if (typeof snap.smooth !== 'boolean') return fail('smooth must be a boolean');
  if (![0, 1, 2].includes(snap.tone)) return fail('tone must be 0 (clamp), 1 (wrap) or 2 (fold)');
  if (typeof snap.stats !== 'object' || snap.stats === null) return fail('Missing stats');
  if (snap.scan !== null && snap.scan !== undefined) {
    if (typeof snap.scan !== 'object') return fail('scan must be null or an object');
    if (typeof snap.scan.path !== 'string' || !Number.isFinite(snap.scan.freq)) {
      return fail('scan needs a path string and a finite freq');
    }
  }
  return { ok: true };
}

/**
 * Migrate a snapshot to the current schema. Identity for schema 1;
 * throws on anything newer than this build understands.
 */
export function migrate(snap) {
  if (!snap || typeof snap.schema !== 'number') {
    throw new Error('Not a snapshot: missing schema field');
  }
  if (snap.schema === SCHEMA_VERSION) return snap;
  if (snap.schema > SCHEMA_VERSION) {
    throw new Error(`Snapshot schema ${snap.schema} is newer than this build (${SCHEMA_VERSION})`);
  }
  if (snap.schema === 1) {
    // v1 → v2: display style did not exist yet; defaults match the old look
    return migrate({ ...snap, schema: 2, palette: 0, smooth: false, tone: 0 });
  }
  if (snap.schema === 2) {
    // v2 → v3: AV layer — no scan recorded, no audio stats measured yet
    return migrate({
      ...snap,
      schema: 3,
      scan: null,
      stats: { ...snap.stats, audio: snap.stats?.audio ?? null },
    });
  }
  throw new Error(`No migration path from schema ${snap.schema}`);
}
