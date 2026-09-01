// Audio DSP core — runs the compiled formula at 4× oversampling through the
// mandatory chain (ADR 001):
//   NaN/Inf guard → DC blocker (20 Hz) → peak normalizer (slow release)
//   → tanh limiter → FIR decimation back to the output rate.
// The 20 ms crossfade between an old and a new formula happens at the RAW
// formula stage, so the chain keeps one continuous state and never jumps.
//
// ZERO imports: this file is embedded verbatim into the AudioWorklet module
// (audio/synth.js concatenates it into a Blob) AND imported normally by the
// Node test suite — same bytes, same math, both places.

/**
 * One-pole DC blocker: y[n] = x[n] - x[n-1] + R·y[n-1].
 * 6 Hz by default (ADR #37): a first-order highpass costs f/√(f²+fc²), so
 * 6 Hz takes 0.17 dB at 30 Hz where two cascaded 20 Hz blockers took 3.2 dB —
 * and 20–40 Hz is exactly where slow visual motion has its audible twin.
 */
export const DC_CUTOFF_HZ = 6;

export class DCBlocker {
  constructor(sampleRate, cutoffHz = DC_CUTOFF_HZ) {
    this.R = 1 - (2 * Math.PI * cutoffHz) / sampleRate;
    this.x1 = 0;
    this.y1 = 0;
  }
  step(x) {
    const y = x - this.x1 + this.R * this.y1;
    this.x1 = x;
    this.y1 = y;
    return y;
  }
}

/**
 * Subtract a boxcar running mean (ADR #37). This is the part that handles the
 * NON-PERIODIC formulas — a ramp (`t * 8000`, and bytebeat's integer counters)
 * walks away from zero forever, and one highpass answers a ramp with a
 * constant, which is why the chain used to need two.
 *
 * Its magnitude response is |1 − sinc(fT)|: ripple bounded by 1/(π·f·T), so
 * with T = 250 ms it is within ±0.54 dB at 20 Hz and ±0.36 dB at 30 Hz, and
 * flat above. It leaves a ramp as a CONSTANT (slope·T/2), which the 6 Hz
 * blocker after it removes — so the pair costs a fraction of a dB where the
 * cascade cost several.
 *
 * Applied unconditionally rather than gated on a "is this periodic?" guess:
 * the cost in the audible band is measured and negligible, and a heuristic
 * that sometimes changes the filter would be far less predictable.
 */
export const MEAN_WINDOW_S = 0.25;

export class RunningMeanRemover {
  constructor(sampleRate, seconds = MEAN_WINDOW_S) {
    this.n = Math.max(1, Math.round(sampleRate * seconds));
    this.buf = new Float64Array(this.n);
    this.pos = 0;
    this.count = 0;
    this.sum = 0;
    this.since = 0;
  }
  step(x) {
    const old = this.buf[this.pos];
    this.buf[this.pos] = x;
    this.pos = this.pos + 1 === this.n ? 0 : this.pos + 1;
    if (this.count < this.n) {
      this.count++;
      this.sum += x;
    } else {
      this.sum += x - old;
    }
    // a float64 running sum drifts; recompute exactly once per window. The
    // burst is ~50 µs against a 2.7 ms deadline, and any residue the drift
    // leaves is a constant, which the blocker downstream removes anyway.
    if (++this.since >= this.n) {
      this.since = 0;
      let s = 0;
      for (let k = 0; k < this.count; k++) s += this.buf[k];
      this.sum = s;
    }
    return x - this.sum / this.count;
  }
}

/**
 * Windowed-sinc lowpass used as decimation filter. `factor` inputs are pushed
 * per output sample; read() computes one output. factor 1 = pass-through.
 */
export class Decimator {
  constructor(factor, taps = 192) {
    this.factor = factor;
    this.n = taps;
    this.buf = new Float64Array(taps);
    this.pos = 0;
    this.taps = new Float64Array(taps);
    if (factor === 1) return;
    // put the STOPBAND edge at the output Nyquist: cutoff backed off by the
    // Blackman transition width (~5.5/N), so folded energy meets real
    // attenuation instead of the transition band's shoulder
    const fc = Math.max(0.06, 0.5 / factor - 5.5 / taps);
    const mid = (taps - 1) / 2;
    let sum = 0;
    for (let k = 0; k < taps; k++) {
      const x = k - mid;
      const sinc = x === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * x) / (Math.PI * x);
      // Blackman window
      const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * k) / (taps - 1))
              + 0.08 * Math.cos((4 * Math.PI * k) / (taps - 1));
      this.taps[k] = sinc * w;
      sum += this.taps[k];
    }
    for (let k = 0; k < taps; k++) this.taps[k] /= sum; // unity DC gain
  }
  push(x) {
    this.buf[this.pos] = x;
    this.pos = (this.pos + 1) % this.n;
    this.last = x;
  }
  read() {
    if (this.factor === 1) return this.last ?? 0;
    let acc = 0;
    let p = this.pos; // oldest sample first
    for (let k = 0; k < this.n; k++) {
      acc += this.buf[p] * this.taps[k];
      p = p + 1 === this.n ? 0 : p + 1;
    }
    return acc;
  }
}

/**
 * Dropout meter (ADR #33). The audio thread is the only place where "did we
 * make the deadline" is answerable, so the measurement lives there and the
 * result is reported to the main thread.
 *
 * Two independent instruments, because they fail differently:
 *
 *  - `gaps` — the RENDERED position (currentFrame) against the frames wall
 *    clock says should exist by now. Rendering normally runs AHEAD of the wall
 *    clock (the device buffer), so lag is negative in health; lag growing past
 *    GAP_TOLERANCE_MS means real time was lost, whatever the cause (us, the
 *    thread being starved, the device). That is an audible dropout.
 *  - `overruns` / `load` — the wall time OUR process() consumed against the
 *    audio time it produced, per window. load >= 1 means the DSP cannot
 *    sustain real time even with the machine to itself.
 *
 * Date.now() (1 ms) is the only clock in AudioWorkletGlobalScope; per quantum
 * that is coarse, so load is accumulated over a window and the gap tolerance
 * is far above the resolution. Truncation is unbiased across many quanta.
 */
export const METER_WINDOW_QUANTA = 32; // ~85 ms at 128 frames / 48 kHz
export const GAP_TOLERANCE_MS = 25;    // lost real time before it counts as a gap
const METER_WARMUP_QUANTA = 16;        // the device clock settles first

export class DropoutMeter {
  constructor(sampleRate, quantum = 128) {
    this.sampleRate = sampleRate;
    this.quantum = quantum;
    this.windowAudioMs = (quantum * METER_WINDOW_QUANTA * 1000) / sampleRate;
    this.reset();
  }

  /** Start (or restart) measuring. Called on run/resume: a suspended context
   *  advances the wall clock without rendering, which is not a dropout. */
  reset() {
    this.warmup = METER_WARMUP_QUANTA;
    this.startWallMs = 0;
    this.startFrame = 0;
    this.quanta = 0;
    this.contextQuanta = 0;
    this.wallMs = 0;
    this.gaps = 0;
    this.gapFrames = 0;
    this.countedLagMs = 0;
    this.worstLagMs = 0;
    this.windowWallMs = 0;
    this.windowQuanta = 0;
    this.totalWallMs = 0;
    this.peakLoad = 0;
    this.overruns = 0;
    this.windowsClosed = 0;
  }

  /**
   * Account for one rendered quantum.
   * @param {number} nowMs     wall clock after processing (Date.now())
   * @param {number} frame     rendered frame position (currentFrame)
   * @param {number} processMs wall time this quantum's processing took
   * @returns {boolean} true when a reporting window just closed
   */
  quantum_(nowMs, frame, processMs) {
    if (this.warmup > 0) {
      this.warmup--;
      this.startWallMs = nowMs;
      this.startFrame = frame;
      return false;
    }
    this.quanta++;
    this.contextQuanta = Math.round((frame - this.startFrame) / this.quantum);
    this.wallMs = nowMs - this.startWallMs;
    this.totalWallMs += processMs;
    this.windowWallMs += processMs;
    this.windowQuanta++;

    // rendered position vs. wall clock: positive lag = real time was lost
    const producedMs = ((frame - this.startFrame) / this.sampleRate) * 1000;
    const lagMs = nowMs - this.startWallMs - producedMs;
    if (lagMs > this.worstLagMs) this.worstLagMs = lagMs;
    if (lagMs > this.countedLagMs + GAP_TOLERANCE_MS) {
      const lostMs = lagMs - this.countedLagMs;
      this.gaps++;
      this.gapFrames += Math.round((lostMs / 1000) * this.sampleRate);
      this.countedLagMs = lagMs;
    }

    if (this.windowQuanta < METER_WINDOW_QUANTA) return false;
    const load = this.windowWallMs / this.windowAudioMs;
    if (load > this.peakLoad) this.peakLoad = load;
    if (load >= 1) this.overruns++;
    this.windowQuanta = 0;
    this.windowWallMs = 0;
    this.windowsClosed++;
    return true;
  }

  /** Plain-object snapshot for postMessage. */
  report() {
    const audioMs = (this.quanta * this.quantum * 1000) / this.sampleRate;
    return {
      // the device decides this (44.1 kHz on most Macs, not 48 kHz) — any
      // reader converting quanta to seconds needs it, and assuming 48000
      // silently turns a healthy run into a fake 8 % deficit
      sampleRate: this.sampleRate,
      quanta: this.quanta,
      contextQuanta: this.contextQuanta,
      skipped: this.contextQuanta - this.quanta,
      wallMs: this.wallMs,
      gaps: this.gaps,
      gapFrames: this.gapFrames,
      worstLagMs: Math.round(this.worstLagMs * 10) / 10,
      overruns: this.overruns,
      load: audioMs > 0 ? this.totalWallMs / audioMs : 0,
      peakLoad: this.peakLoad,
    };
  }
}

/**
 * Scan paths (ADR 001 phase 3): a FIELD formula becomes sound by walking a
 * path through the same field the shader draws, at an audible traversal rate.
 * phase ∈ [0,1) is one traversal; rowPhase moves the line path between rows.
 * Pure and exported: the worklet AND the main-thread scope use this function.
 */
export const SCAN_PATHS = ['lissajous', 'spiral', 'line'];

export function scanXY(path, phase, rowPhase, out) {
  if (path === 'line') {
    // TV raster: x sweeps at the scan rate, y steps one of 64 rows per sweep
    out[0] = 2 * phase - 1;
    out[1] = 2 * rowPhase - 1;
  } else if (path === 'spiral') {
    // center → edge, 8 windings per traversal (restarts each cycle)
    const a = phase * Math.PI * 16;
    out[0] = phase * Math.cos(a);
    out[1] = phase * Math.sin(a);
  } else {
    // 3:2 Lissajous — smooth and periodic, no wrap discontinuity
    out[0] = Math.sin(2 * Math.PI * 3 * phase);
    out[1] = Math.sin(2 * Math.PI * 2 * phase + Math.PI / 4);
  }
  return out;
}

/**
 * The synth: compiled formula in, safe stereo audio out.
 * `compiled` objects come from core/js.js compileFormula() on the main thread
 * or from new Function inside the worklet: { fn, mode }.
 */
const LIVE_INPUTS = ['mot', 's_ent', 's_sym'];

export class SynthCore {
  constructor(sampleRate, { FL, oversample = 4, target = 0.5 } = {}) {
    this.FL = FL;
    this.sampleRate = sampleRate;
    this.os = oversample;
    this.osRate = sampleRate * oversample;
    this.dt = 1 / this.osRate;
    this.target = target;

    this.cur = null;   // { fn, mode, spatial }
    this.prev = null;
    this.scan = { path: 'lissajous', freq: 110 };
    this.scanPhase = 0;
    this.rowPhase = 0;
    this.scanOut = [0, 0];
    this.sx = 0;
    this.sy = 0;
    this.fadeLen = Math.max(1, Math.round(0.02 * this.osRate)); // 20 ms
    this.fadePos = this.fadeLen; // >= fadeLen means: no fade running

    this.t = 0;        // shared phase clock, seconds
    this.frame = 0;    // output-sample index → env.i
    this.env = {
      x: 0, y: 0, t: 0, r: 0, th: 0, mx: 0, my: 0, i: 0, dx: 0, dy: 0, mot: 0,
      s_ent: 0, s_sym: 1, // black-frame stats until the renderer feeds real ones (ADR #43)
      params: {},
    };
    this.paramTargets = {};
    this.paramSmooth = 1 - Math.exp(-1 / (0.01 * sampleRate)); // ~10 ms

    // running-mean subtraction handles the non-periodic formulas (a ramp
    // walks away forever), the 6 Hz blocker removes what it leaves behind —
    // together far flatter at 20–40 Hz than the two cascaded blockers this
    // replaced (ADR #37)
    this.meanL = new RunningMeanRemover(this.osRate);
    this.meanR = new RunningMeanRemover(this.osRate);
    this.dcL = new DCBlocker(this.osRate);
    this.dcR = new DCBlocker(this.osRate);
    this.firL = new Decimator(oversample);
    this.firR = new Decimator(oversample);
    // optional analysis tap, pre-normalizer / pre-limiter (ADR #35). Off by
    // default: the worklet must not pay for a measurement it never reads.
    this.tap = null;
    this.peak = 1e-4;
    this.peakRelease = Math.exp(-1 / (3 * this.osRate)); // τ ≈ 3 s
    this.gain = 1;
    this.gainSlew = 1 - Math.exp(-1 / (0.05 * this.osRate)); // ~50 ms
    this.scratch = [0, 0, 0];
    this.vl = 0;
    this.vr = 0;
    // Silent until one full mean window has been observed, then a 20 ms fade
    // (ADR #37). While the window fills, the running mean of a ramp lags by
    // half the samples seen, so the residue is still a ramp and the blocker
    // cannot remove it: measured, that pinned `t * 8000` at the limiter for
    // 250 ms (2 s mean DC 0.085). We cannot know a formula's DC before
    // watching a window of it, so we do not pretend to — we stay quiet.
    this.warmup = this.meanL.n;
    this.fadeIn = 0;
    this.fadeInInc = 1 / (0.02 * this.osRate);
  }

  /** Swap formulas with a 20 ms crossfade. `compiled` = { fn, mode };
   *  spatial = a field formula, whose x/y the scan path drives. */
  setFormula(compiled, spatial = false) {
    this.prev = this.cur;
    this.cur = { ...compiled, spatial };
    this.fadePos = this.prev ? 0 : this.fadeLen;
  }

  setScan(path, freq) {
    if (SCAN_PATHS.includes(path)) this.scan.path = path;
    if (Number.isFinite(freq)) this.scan.freq = Math.min(4000, Math.max(1, freq));
  }

  /**
   * Tap the signal where the formula still IS the formula: after the NaN
   * guard and the DC chain, before the normalizer and the tanh limiter.
   * It runs through its own decimation filter, so tap and output are at the
   * same rate and their statistics are directly comparable (ADR #35).
   * After each process(), `tapL` / `tapR` hold that block's tapped samples.
   */
  enableTap() {
    this.tap = {
      firL: new Decimator(this.os),
      firR: new Decimator(this.os),
      L: null,
      R: null,
    };
  }

  get tapL() { return this.tap?.L; }
  get tapR() { return this.tap?.R; }

  setParams(params) {
    this.paramTargets = params;
    this.paramKeys = Object.keys(params); // cached: the glide loop runs 48k×/s
    for (const k of this.paramKeys) {
      if (!(k in this.env.params)) this.env.params[k] = params[k];
    }
  }

  setMouse(mx, my) {
    this.env.mx = mx;
    this.env.my = my;
  }

  /**
   * Live scalar inputs that exist at audio rate too: mot (camera motion) and
   * s_ent / s_sym (the image's own previous-frame stats, ADR #43).
   */
  setInputs(inputs) {
    if (!inputs) return;
    for (const name of LIVE_INPUTS) {
      if (typeof inputs[name] === 'number') this.env[name] = inputs[name];
    }
  }

  setTime(t) {
    this.t = t;
  }

  /** Evaluate one voice at the current env → this.vl / this.vr, raw.
   *  Writes fields instead of returning an array: this runs 4×48000 times a
   *  second and must not allocate. */
  evalVoice(voice) {
    const env = this.env;
    if (voice.spatial) {
      env.x = this.sx;
      env.y = this.sy;
      env.r = Math.sqrt(this.sx * this.sx + this.sy * this.sy);
      env.th = Math.atan2(this.sy, this.sx);
    } else {
      env.x = 0; env.y = 0; env.r = 0; env.th = 0;
    }
    const v = voice.fn(this.FL, env, this.scratch);
    if (voice.mode === 'scalar') {
      this.vl = v; this.vr = v;
    } else if (voice.mode === 'vec2') {
      this.vl = v[0]; this.vr = v[1];
    } else {
      const lum = 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
      this.vl = lum; this.vr = lum;
    }
  }

  /** Fill outL/outR (Float32Array-like, same length) with processed audio. */
  process(outL, outR) {
    const n = outL.length;
    if (!this.cur) {
      outL.fill(0);
      if (outR !== outL) outR.fill(0);
      return;
    }
    const env = this.env;
    const tap = this.tap;
    if (tap && (!tap.L || tap.L.length !== n)) {
      tap.L = new Float64Array(n); // pre-normalizer levels are unbounded: f64
      tap.R = new Float64Array(n);
    }
    for (let i = 0; i < n; i++) {
      // params glide toward their targets (~10 ms) so a slider jump never clicks
      const keys = this.paramKeys;
      if (keys) {
        for (let k = 0; k < keys.length; k++) {
          const name = keys[k];
          env.params[name] += (this.paramTargets[name] - env.params[name]) * this.paramSmooth;
        }
      }
      for (let s = 0; s < this.os; s++) {
        env.t = this.t;
        env.i = this.frame;
        // scan clock: x/y walk the field at an audible rate; t stays slow
        this.scanPhase += this.scan.freq * this.dt;
        if (this.scanPhase >= 1) {
          this.scanPhase -= 1;
          this.rowPhase = (this.rowPhase + 1 / 64) % 1;
        }
        scanXY(this.scan.path, this.scanPhase, this.rowPhase, this.scanOut);
        this.sx = this.scanOut[0];
        this.sy = this.scanOut[1];
        let l, r;
        try {
          this.evalVoice(this.cur);
          l = this.vl; r = this.vr;
          if (this.fadePos < this.fadeLen && this.prev) {
            this.evalVoice(this.prev);
            const k = this.fadePos / this.fadeLen;
            l = this.vl + (l - this.vl) * k;
            r = this.vr + (r - this.vr) * k;
            this.fadePos++;
          }
        } catch {
          l = 0; r = 0; // a runtime throw must never take the node down
        }
        // 1. guard — one NaN would otherwise poison every filter after it
        if (!Number.isFinite(l)) l = 0;
        if (!Number.isFinite(r)) r = 0;
        // 2. centre the signal: subtract the running mean (catches ramps and
        //    other non-periodic drift), then block the constant it leaves
        l = this.dcL.step(this.meanL.step(l));
        r = this.dcR.step(this.meanR.step(r));
        if (tap) {
          tap.firL.push(l);
          tap.firR.push(r);
        }
        // 3. normalize via running peak with slow release
        const a = Math.max(Math.abs(l), Math.abs(r));
        this.peak = Math.max(a, this.peak * this.peakRelease, 1e-4);
        const gTarget = Math.min(this.target / this.peak, 1000);
        this.gain += (gTarget - this.gain) * this.gainSlew;
        l *= this.gain;
        r *= this.gain;
        // 4. tanh limiter as the safety net
        l = Math.tanh(l);
        r = Math.tanh(r);
        if (this.warmup > 0) {
          this.warmup--;
          l = 0;
          r = 0;
        } else if (this.fadeIn < 1) {
          l *= this.fadeIn;
          r *= this.fadeIn;
          this.fadeIn = Math.min(1, this.fadeIn + this.fadeInInc);
        }
        // 5. decimation filter — evaluated once per output sample below
        this.firL.push(l);
        this.firR.push(r);
        this.t += this.dt;
      }
      // final hard clamp: the decimation FIR can ring a fraction past the
      // tanh ceiling (Gibbs); the contract is every sample inside [-1, 1]
      const yl = this.firL.read();
      const yr = this.firR.read();
      outL[i] = yl > 1 ? 1 : yl < -1 ? -1 : yl;
      outR[i] = yr > 1 ? 1 : yr < -1 ? -1 : yr;
      if (tap) {
        tap.L[i] = tap.firL.read();
        tap.R[i] = tap.firR.read();
      }
      this.frame++;
    }
  }
}
