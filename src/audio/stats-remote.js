// Main-thread client for audio/stats-worker.js: the zero-player asks for a
// stats.audio measurement and gets the same {pre, post, silent} the save path
// computes, without blocking the UI. One job at a time (the worker is one
// thread anyway); a job that overruns its budget resolves to null — "not
// measured", which the ranking treats as image-only (ADR #42) — and the
// worker is replaced so the next candidate does not queue behind it.
// The worker factory is injected so the queue and the timeout are testable
// in Node with a fake.

export class AudioStatsRemote {
  /**
   * @param {() => Worker} createWorker
   * @param {{ timeoutMs?: number }} [opts]
   */
  constructor(createWorker, { timeoutMs = 6000 } = {}) {
    this.createWorker = createWorker;
    this.timeoutMs = timeoutMs;
    this.worker = null;
    this.queue = [];
    this.active = null;
    this.nextId = 1;
    this.counts = { measured: 0, timedOut: 0, failed: 0 };
  }

  /**
   * @param {object} paramAst — AST with param nodes (extractParams output)
   * @param {Record<string, number>} params
   * @param {{path: string, freq: number}|null} scan
   * @returns {Promise<object|null>} stats.audio, or null when it could not be
   *   measured in time (or at all)
   */
  measure(paramAst, params, scan = null) {
    return new Promise((resolve) => {
      this.queue.push({ id: this.nextId++, ast: paramAst, params, scan, resolve });
      this.pump();
    });
  }

  ensureWorker() {
    if (this.worker) return this.worker;
    const w = this.createWorker();
    w.onmessage = (e) => this.onMessage(e.data);
    w.onerror = () => this.finish(null, 'failed');
    this.worker = w;
    return w;
  }

  pump() {
    if (this.active || !this.queue.length) return;
    const job = this.queue.shift();
    let worker;
    try {
      worker = this.ensureWorker();
    } catch {
      // no Worker here (file://, an old browser): unmeasured, never blocking
      this.counts.failed++;
      job.resolve(null);
      this.pump();
      return;
    }
    this.active = job;
    job.timer = setTimeout(() => this.onTimeout(job), this.timeoutMs);
    worker.postMessage({ id: job.id, ast: job.ast, params: job.params, scan: job.scan });
  }

  onMessage(msg) {
    if (!this.active || msg?.id !== this.active.id) return; // a late reply from a replaced worker
    this.finish(msg.ok ? msg.audio : null, msg.ok ? 'measured' : 'failed');
  }

  onTimeout(job) {
    if (this.active !== job) return;
    // the worker is still grinding on it: replace it rather than wait
    this.worker?.terminate();
    this.worker = null;
    this.finish(null, 'timedOut');
  }

  finish(audio, outcome) {
    const job = this.active;
    if (!job) return;
    clearTimeout(job.timer);
    this.active = null;
    this.counts[outcome]++;
    job.resolve(audio);
    this.pump();
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    for (const job of this.queue.splice(0)) job.resolve(null);
    if (this.active) this.finish(null, 'failed');
  }
}
