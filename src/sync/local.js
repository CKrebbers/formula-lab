// Same-machine window sync over BroadcastChannel: the control panel and any
// number of display windows share state without a server. The message shape
// { type, payload } is deliberately transport-agnostic — a future remote
// transport (WebSocket relay, phase C of the symbiosis roadmap) implements
// this same interface.

const CHANNEL = 'formula-lab-sync';

export class SyncChannel {
  constructor(name = CHANNEL) {
    this.handlers = new Map();
    this.bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(name) : null;
    if (this.bc) {
      this.bc.onmessage = (e) => {
        const { type, payload } = e.data ?? {};
        this.handlers.get(type)?.forEach((fn) => fn(payload));
      };
    }
  }

  get available() {
    return this.bc !== null;
  }

  send(type, payload = {}) {
    this.bc?.postMessage({ type, payload });
  }

  /** Multiple handlers per type allowed; returns an unsubscribe function. */
  on(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  close() {
    this.bc?.close();
    this.handlers.clear();
  }
}
