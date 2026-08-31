// Snapshot schema v1 (§4, frozen): create, validate, migrate.
// No DOM dependency — testable in Node.

export const SCHEMA_VERSION = 1;

export const COORD_NAMES = ['cartesian', 'polar', 'toroidal'];
export const ORIGINS = ['typed', 'mutate', 'crossover', 'sample', 'llm', 'family'];

const EMPTY_STATS = {
  entropy: 0.0,
  edge_density: 0.0,
  color_variance: 0.0,
  symmetry: 0.0,
  spectral_flatness: 0.0,
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
  if (typeof snap.stats !== 'object' || snap.stats === null) return fail('Missing stats');
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
  // future: schema 0 → 1 steps chain here
  throw new Error(`No migration path from schema ${snap.schema}`);
}
