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

/** One-pole DC blocker: y[n] = x[n] - x[n-1] + R·y[n-1], cutoff ~20 Hz. */
export class DCBlocker {
  constructor(sampleRate) {
    this.R = 1 - (2 * Math.PI * 20) / sampleRate;
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
 * The synth: compiled formula in, safe stereo audio out.
 * `compiled` objects come from core/js.js compileFormula() on the main thread
 * or from new Function inside the worklet: { fn, mode }.
 */
export class SynthCore {
  constructor(sampleRate, { FL, oversample = 4, target = 0.5 } = {}) {
    this.FL = FL;
    this.sampleRate = sampleRate;
    this.os = oversample;
    this.osRate = sampleRate * oversample;
    this.dt = 1 / this.osRate;
    this.target = target;

    this.cur = null;   // { fn, mode }
    this.prev = null;
    this.fadeLen = Math.max(1, Math.round(0.02 * this.osRate)); // 20 ms
    this.fadePos = this.fadeLen; // >= fadeLen means: no fade running

    this.t = 0;        // shared phase clock, seconds
    this.frame = 0;    // output-sample index → env.i
    this.env = {
      x: 0, y: 0, t: 0, r: 0, th: 0, mx: 0, my: 0, i: 0, dx: 0, dy: 0,
      params: {},
    };
    this.paramTargets = {};
    this.paramSmooth = 1 - Math.exp(-1 / (0.01 * sampleRate)); // ~10 ms

    // two blockers in series: a ramp (t * k, common in bytebeat) leaves a
    // CONSTANT after one differentiating blocker; the second removes it
    this.dcL = new DCBlocker(this.osRate);
    this.dcR = new DCBlocker(this.osRate);
    this.dcL2 = new DCBlocker(this.osRate);
    this.dcR2 = new DCBlocker(this.osRate);
    this.firL = new Decimator(oversample);
    this.firR = new Decimator(oversample);
    this.peak = 1e-4;
    this.peakRelease = Math.exp(-1 / (3 * this.osRate)); // τ ≈ 3 s
    this.gain = 1;
    this.gainSlew = 1 - Math.exp(-1 / (0.05 * this.osRate)); // ~50 ms
    this.scratch = [0, 0, 0];
    this.vl = 0;
    this.vr = 0;
    // 200 ms soft start: the DC blockers answer the first samples of an
    // arbitrary formula with a saturated step response — fade over it
    this.fadeIn = 0;
    this.fadeInInc = 1 / (0.2 * this.osRate);
  }

  /** Swap formulas with a 20 ms crossfade. `compiled` = { fn, mode }. */
  setFormula(compiled) {
    this.prev = this.cur;
    this.cur = compiled;
    this.fadePos = this.prev ? 0 : this.fadeLen;
  }

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

  setTime(t) {
    this.t = t;
  }

  /** Evaluate one voice at the current env → this.vl / this.vr, raw.
   *  Writes fields instead of returning an array: this runs 4×48000 times a
   *  second and must not allocate. */
  evalVoice(voice) {
    const v = voice.fn(this.FL, this.env, this.scratch);
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
        // 2. DC blockers — arbitrary formulas are not centered on zero
        l = this.dcL2.step(this.dcL.step(l));
        r = this.dcR2.step(this.dcR.step(r));
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
        if (this.fadeIn < 1) {
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
      this.frame++;
    }
  }
}
