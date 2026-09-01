// audio/stats-remote.js: one job at a time, a reply resolves it, a budget
// overrun resolves null and replaces the worker, and no Worker at all means
// "unmeasured" instead of a crash (ADR #42).

import { describe, it, expect, vi } from 'vitest';
import { AudioStatsRemote } from '../src/audio/stats-remote.js';

class FakeWorker {
  static made = [];
  constructor() {
    this.posted = [];
    this.terminated = false;
    this.onmessage = null;
    FakeWorker.made.push(this);
  }
  postMessage(msg) { this.posted.push(msg); }
  terminate() { this.terminated = true; }
  reply(msg) { this.onmessage({ data: msg }); }
}

const AUDIO = { pre: { rms: 0.3, crest: 1.41, flatness: 1e-5 }, post: { rms: 0.33, crest: 1.4, flatness: 1e-5 }, silent: [] };

describe('AudioStatsRemote', () => {
  it('posts the job and resolves with the worker\'s measurement', async () => {
    FakeWorker.made = [];
    const remote = new AudioStatsRemote(() => new FakeWorker());
    const p = remote.measure({ type: 'num', value: 1 }, { a: 1 }, { path: 'line', freq: 110 });
    const w = FakeWorker.made[0];
    expect(w.posted[0]).toMatchObject({ ast: { type: 'num', value: 1 }, params: { a: 1 }, scan: { path: 'line', freq: 110 } });
    w.reply({ id: w.posted[0].id, ok: true, audio: AUDIO });
    expect(await p).toEqual(AUDIO);
    expect(remote.counts).toEqual({ measured: 1, timedOut: 0, failed: 0 });
  });

  it('runs one job at a time, in order, on one worker', async () => {
    FakeWorker.made = [];
    const remote = new AudioStatsRemote(() => new FakeWorker());
    const p1 = remote.measure({}, {}, null);
    const p2 = remote.measure({}, {}, null);
    const w = FakeWorker.made[0];
    expect(FakeWorker.made).toHaveLength(1);
    expect(w.posted).toHaveLength(1);
    w.reply({ id: w.posted[0].id, ok: true, audio: AUDIO });
    await p1;
    expect(w.posted).toHaveLength(2);
    w.reply({ id: w.posted[1].id, ok: false, message: 'boom' });
    expect(await p2).toBeNull();
    expect(remote.counts).toEqual({ measured: 1, timedOut: 0, failed: 1 });
  });

  it('a job over budget resolves null, the worker is replaced, the queue moves on', async () => {
    vi.useFakeTimers();
    try {
      FakeWorker.made = [];
      const remote = new AudioStatsRemote(() => new FakeWorker(), { timeoutMs: 100 });
      const slow = remote.measure({}, {}, null);
      const next = remote.measure({}, {}, null);
      const w1 = FakeWorker.made[0];
      vi.advanceTimersByTime(101);
      expect(await slow).toBeNull();
      expect(w1.terminated).toBe(true);
      const w2 = FakeWorker.made[1];
      expect(w2).toBeDefined();
      expect(w2.posted).toHaveLength(1);
      // the late reply from the old worker is ignored, not mistaken for the new job
      w1.reply({ id: w1.posted[0].id, ok: true, audio: AUDIO });
      w2.reply({ id: w2.posted[0].id, ok: true, audio: AUDIO });
      expect(await next).toEqual(AUDIO);
      expect(remote.counts).toEqual({ measured: 1, timedOut: 1, failed: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('no Worker available: every measurement is null, nothing throws', async () => {
    const remote = new AudioStatsRemote(() => { throw new Error('no Worker'); });
    expect(await remote.measure({}, {}, null)).toBeNull();
    expect(await remote.measure({}, {}, null)).toBeNull();
    expect(remote.counts.failed).toBe(2);
  });

  it('dispose resolves everything pending with null', async () => {
    FakeWorker.made = [];
    const remote = new AudioStatsRemote(() => new FakeWorker());
    const a = remote.measure({}, {}, null);
    const b = remote.measure({}, {}, null);
    remote.dispose();
    expect(await a).toBeNull();
    expect(await b).toBeNull();
    expect(FakeWorker.made[0].terminated).toBe(true);
  });
});
