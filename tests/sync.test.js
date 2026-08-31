import { describe, it, expect } from 'vitest';
import { SyncChannel } from '../src/sync/local.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe('sync: SyncChannel', () => {
  it('delivers typed messages between channels (panel → display)', async () => {
    const panel = new SyncChannel('test-1');
    const display = new SyncChannel('test-1');
    const got = [];
    display.on('formula', (payload) => got.push(payload));
    panel.send('formula', { source: 'sin(x + t)', coords: 1 });
    await wait(30);
    expect(got).toEqual([{ source: 'sin(x + t)', coords: 1 }]);
    panel.close();
    display.close();
  });

  it('routes by type and supports multiple handlers + unsubscribe', async () => {
    const a = new SyncChannel('test-2');
    const b = new SyncChannel('test-2');
    const seen = [];
    b.on('params', (p) => seen.push(['h1', p.params.a]));
    const off = b.on('params', (p) => seen.push(['h2', p.params.a]));
    b.on('coords', () => seen.push(['coords']));
    a.send('params', { params: { a: 1 } });
    await wait(30);
    off();
    a.send('params', { params: { a: 2 } });
    await wait(30);
    expect(seen).toEqual([['h1', 1], ['h2', 1], ['h1', 2]]);
    a.close();
    b.close();
  });

  it('does not deliver to itself', async () => {
    const solo = new SyncChannel('test-3');
    let hits = 0;
    solo.on('ping', () => hits++);
    solo.send('ping');
    await wait(30);
    expect(hits).toBe(0);
    solo.close();
  });

  it('separate channel names are isolated', async () => {
    const a = new SyncChannel('test-4a');
    const b = new SyncChannel('test-4b');
    let hits = 0;
    b.on('ping', () => hits++);
    a.send('ping');
    await wait(30);
    expect(hits).toBe(0);
    a.close();
    b.close();
  });
});
