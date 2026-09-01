// Main-thread audio controller: owns the AudioContext, loads the worklet
// module ONCE (a Blob of jsruntime + dsp + glue — see ADR 001), and talks to
// it with postMessage. The same compiled formula the worklet plays is exposed
// to the UI so the scope plot draws from the identical function.

import RUNTIME_SRC from '../core/jsruntime.js?raw';
import DSP_SRC from './dsp.js?raw';
import GLUE_SRC from './worklet-glue.js?raw';
import { emitJS, compileFormula } from '../core/js.js';
import { FL } from '../core/jsruntime.js';

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
    this.onError = null;       // (message) => void
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
    this.node.port.postMessage({ type: 'formula', body, mode });
    return this.compiled;
  }

  /** Stream the live param values (already glide/LFO-smoothed upstream). */
  setParams(params, mouse) {
    if (!this.ctx || !this.playing) return;
    this.node.port.postMessage({ type: 'params', params, mouse });
  }

  async start(formulaTime) {
    await this.ensure();
    await this.ctx.resume();
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

  /** Evaluate the current formula on the main thread (scope plot). */
  evalAt(t, params, mouse = [0, 0]) {
    if (!this.compiled) return null;
    const env = {
      x: 0, y: 0, t, r: 0, th: 0,
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
