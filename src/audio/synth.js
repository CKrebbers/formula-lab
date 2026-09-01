// Main-thread audio controller: owns the AudioContext, loads the worklet
// module ONCE (a Blob of jsruntime + dsp + glue — see ADR 001), and talks to
// it with postMessage. The same compiled formula the worklet plays is exposed
// to the UI so the scope plot draws from the identical function.

import RUNTIME_SRC from '../core/jsruntime.js?raw';
import DSP_SRC from './dsp.js?raw';
import GLUE_SRC from './worklet-glue.js?raw';
import { emitJS, compileFormula } from '../core/js.js';
import { FL } from '../core/jsruntime.js';
import { scanXY } from './dsp.js';

export class AVSound {
  constructor() {
    this.ctx = null;
    this.node = null;
    this.gainNode = null;
    this.playing = false;
    this.volume = 0.5;
    this.compiled = null;      // { fn, mode, isParametric } — for the scope
    this.pendingAst = null;    // formula applied before the ctx existed
    this.startCtxTime = 0;     // ctx.currentTime ↔ formula-t mapping
    this.startFormulaTime = 0;
    this.scan = { path: 'lissajous', freq: 110 }; // field-mode scan path
    this.onError = null;       // (message) => void
    // dropout meter, measured on the audio thread (ADR #33)
    this.meter = { quanta: 0, gaps: 0, gapFrames: 0, worstLagMs: 0, overruns: 0, load: 0, peakLoad: 0 };
    this.onDropout = null;     // (meter) => void, called when gaps increases
    this.pendingFlush = new Map();
    this.flushId = 0;
  }

  /** Exact meter reading straight from the audio thread. The windowed reports
   *  arrive late when the main thread is busy — do not measure with those. */
  flushMeter(timeoutMs = 2000) {
    if (!this.ctx || !this.playing) return Promise.resolve({ ...this.meter });
    const id = ++this.flushId;
    return new Promise((resolve) => {
      this.pendingFlush.set(id, resolve);
      this.node.port.postMessage({ type: 'meter-flush', id });
      setTimeout(() => {
        if (this.pendingFlush.delete(id)) resolve({ ...this.meter, stale: true });
      }, timeoutMs);
    });
  }

  async ensure() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    const blob = new Blob([RUNTIME_SRC, '\n', DSP_SRC, '\n', GLUE_SRC], {
      type: 'application/javascript',
    });
    const url = URL.createObjectURL(blob);
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    this.node = new AudioWorkletNode(ctx, 'formula-lab-synth', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.node.port.onmessage = (e) => {
      if (e.data?.type === 'formula-error') this.onError?.(e.data.message);
      else if (e.data?.type === 'meter') {
        const grew = e.data.gaps > this.meter.gaps;
        this.meter = e.data;
        if (grew) this.onDropout?.(e.data);
        if (e.data.flush) {
          this.pendingFlush.get(e.data.flush)?.(e.data);
          this.pendingFlush.delete(e.data.flush);
        }
      }
    };
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = this.volume;
    this.node.connect(this.gainNode).connect(ctx.destination);
    this.ctx = ctx;
    if (this.pendingAst) {
      const ast = this.pendingAst;
      this.pendingAst = null;
      this.setFormula(ast);
    }
  }

  /**
   * Follow the panel's current formula (param AST from extractParams).
   * Compiles locally for the scope AND posts the emitted body to the worklet.
   * Throws JsEmitError upward like transpile() does.
   */
  setFormula(paramAst) {
    this.compiled = compileFormula(paramAst);
    if (!this.ctx) {
      this.pendingAst = paramAst;
      return this.compiled;
    }
    const { body, mode } = emitJS(paramAst);
    this.node.port.postMessage({
      type: 'formula', body, mode,
      spatial: !this.compiled.isParametric,
    });
    return this.compiled;
  }

  /** Field-mode scan path: which curve walks the field, at how many Hz. */
  setScan(path = this.scan.path, freq = this.scan.freq) {
    this.scan = { path, freq };
    if (this.ctx) this.node.port.postMessage({ type: 'scan', path, freq });
  }

  /** Stream the live param values (already glide/LFO-smoothed upstream). */
  setParams(params, mouse) {
    if (!this.ctx || !this.playing) return;
    this.node.port.postMessage({ type: 'params', params, mouse });
  }

  async start(formulaTime) {
    await this.ensure();
    await this.ctx.resume();
    this.node.port.postMessage({ type: 'scan', ...this.scan });
    this.meter = { quanta: 0, gaps: 0, gapFrames: 0, worstLagMs: 0, overruns: 0, load: 0, peakLoad: 0 };
    this.startCtxTime = this.ctx.currentTime;
    this.startFormulaTime = formulaTime;
    this.node.port.postMessage({ type: 'time', t: formulaTime });
    this.node.port.postMessage({ type: 'run', on: true });
    this.playing = true;
  }

  stop() {
    if (!this.ctx) return;
    this.node.port.postMessage({ type: 'run', on: false });
    this.playing = false;
  }

  setVolume(v) {
    this.volume = v;
    if (this.gainNode) {
      this.gainNode.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
    }
  }

  /** The audio clock's current formula-t — the scope draws on THIS clock. */
  audioTime() {
    if (!this.ctx || !this.playing) return null;
    return this.startFormulaTime + (this.ctx.currentTime - this.startCtxTime);
  }

  /** Evaluate the current formula on the main thread (scope plot). For a
   *  field formula, x/y follow the same scanXY the worklet runs, derived
   *  from the audio clock — the scope shows the waveform being heard. */
  evalAt(t, params, mouse = [0, 0]) {
    if (!this.compiled) return null;
    let x = 0, y = 0, r = 0, th = 0;
    if (!this.compiled.isParametric) {
      const traversal = t * this.scan.freq;
      const phase = traversal - Math.floor(traversal);
      const rowPhase = (Math.floor(traversal) % 64) / 64;
      const p = scanXY(this.scan.path, phase, rowPhase, [0, 0]);
      x = p[0]; y = p[1];
      r = Math.hypot(x, y);
      th = Math.atan2(y, x);
    }
    const env = {
      x, y, t, r, th,
      mx: mouse[0], my: mouse[1],
      i: Math.floor(t * 48000), dx: 0, dy: 0, params,
    };
    try {
      const v = this.compiled.fn(FL, env, [0, 0, 0]);
      return this.compiled.mode === 'scalar' ? [v, v] : [v[0], v[1]];
    } catch {
      return null;
    }
  }
}
