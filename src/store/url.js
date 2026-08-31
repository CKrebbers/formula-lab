// Permalink encode/decode: formula + params + locks + coords in the URL hash,
// compressed with lz-string (DECISIONS.md #3). Thumbs/stats stay out — too big.

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { COORD_NAMES } from './snapshot.js';

const PREFIX = '#f=';

/**
 * @param {{source: string, params?: object, locks?: object, coords?: string}} data
 * @returns {string} hash fragment including '#f='
 */
export function encodePermalink({
  source, params = {}, locks = {}, coords = 'cartesian',
  palette = 0, smooth = false, tone = 0,
}) {
  const payload = JSON.stringify({ v: 1, source, params, locks, coords, palette, smooth, tone });
  return PREFIX + compressToEncodedURIComponent(payload);
}

/**
 * @param {string} hash — location.hash (or a full permalink)
 * @returns {{source: string, params: object, locks: object, coords: string} | null}
 */
export function decodePermalink(hash) {
  const idx = hash.indexOf(PREFIX);
  if (idx === -1) return null;
  try {
    const json = decompressFromEncodedURIComponent(hash.slice(idx + PREFIX.length));
    const data = JSON.parse(json);
    if (data.v !== 1 || typeof data.source !== 'string') return null;
    return {
      source: data.source,
      params: data.params ?? {},
      locks: data.locks ?? {},
      coords: COORD_NAMES.includes(data.coords) ? data.coords : 'cartesian',
      palette: Number.isInteger(data.palette) ? data.palette : 0,
      smooth: data.smooth === true,
      tone: [0, 1, 2].includes(data.tone) ? data.tone : 0,
    };
  } catch {
    return null;
  }
}
