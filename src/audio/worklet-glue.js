// AudioWorkletProcessor shell. NEVER loaded on the main thread and never
// imported as a module by app code: audio/synth.js concatenates
// jsruntime.js + dsp.js + this file into ONE Blob module, loaded with
// addModule exactly once. Formulas arrive via postMessage as emitted JS
// bodies (from core/js.js) and are compiled here with new Function — no
// module reload, no click (ADR 001). `FL`, `SynthCore`, `sampleRate`,
// `registerProcessor` all exist in this scope.

class FormulaLabProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.core = new SynthCore(sampleRate, { FL });
    this.running = false;
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(msg) {
    switch (msg.type) {
      case 'formula':
        try {
          const fn = new Function('FL', 'env', 'out', msg.body);
          // smoke-test once so a broken body fails HERE, not in process()
          fn(FL, this.core.env, [0, 0, 0]);
          this.core.setFormula({ fn, mode: msg.mode }, !!msg.spatial);
          this.port.postMessage({ type: 'formula-ok' });
        } catch (err) {
          this.port.postMessage({ type: 'formula-error', message: String(err?.message ?? err) });
        }
        break;
      case 'params':
        this.core.setParams(msg.params);
        if (msg.mouse) this.core.setMouse(msg.mouse[0], msg.mouse[1]);
        break;
      case 'time':
        this.core.setTime(msg.t);
        break;
      case 'scan':
        this.core.setScan(msg.path, msg.freq);
        break;
      case 'run':
        this.running = !!msg.on;
        break;
    }
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const l = out[0];
    const r = out[1] ?? out[0];
    if (!this.running) {
      l.fill(0);
      if (r !== l) r.fill(0);
      return true; // keep the node alive; start/stop is a flag, not a rebuild
    }
    this.core.process(l, r);
    return true;
  }
}

registerProcessor('formula-lab-synth', FormulaLabProcessor);
