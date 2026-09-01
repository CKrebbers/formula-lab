// Worker entry: runs the SAME computeAudioStats the save path runs, off the
// main thread — one measurement costs 0.4–3 s (the chain's 0.5 s settle plus
// a 32k window through the 4× oversampled core), which the zero-player cannot
// afford on the UI thread every step (ADR #42). Bundled by Vite as an inline
// worker (`?worker&inline`) so the single-file build keeps working.
// Never imported by app code as a module; see audio/stats-remote.js.

import { computeAudioStats } from './stats.js';

self.onmessage = (e) => {
  const { id, ast, params, scan } = e.data;
  try {
    self.postMessage({ id, ok: true, audio: computeAudioStats(ast, params, scan) });
  } catch (err) {
    self.postMessage({ id, ok: false, message: String(err?.message ?? err) });
  }
};
