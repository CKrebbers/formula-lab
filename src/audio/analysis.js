// Pure audio-feature extraction — no Web Audio, testable in Node.
// Input: byte frequency data (0..255 per bin). Output per band:
//   level — enveloped loudness ("hardness"): fast attack, slow release
//   pulse — beat energy ("rhythm"): spikes on spectral-flux onsets, decays
// The per-param focus knob morphs between the two (see automate.js).

export const BANDS = { bass: [20, 150], mid: [150, 2000], high: [2000, 8000] };

const ATTACK_S = 0.03;
const RELEASE_S = 0.35;
const PULSE_DECAY_S = 0.18;
const FLUX_AVG_S = 2.0;
const ONSET_FACTOR = 1.8;

export class AudioAnalysis {
  constructor(sampleRate, fftSize) {
    const binHz = sampleRate / fftSize;
    this.bins = {};
    for (const [name, [lo, hi]] of Object.entries(BANDS)) {
      this.bins[name] = [
        Math.max(1, Math.round(lo / binHz)),
        Math.min(fftSize / 2 - 1, Math.round(hi / binHz)),
      ];
    }
    this.state = {};
    for (const name of Object.keys(BANDS)) {
      this.state[name] = { level: 0, pulse: 0, fluxAvg: 0, prev: null };
    }
    this.lastT = null;
  }

  /**
   * @param {Uint8Array} freqData analyser byte frequency data
   * @param {number} t seconds
   * @returns {{bass: {level, pulse}, mid: {level, pulse}, high: {level, pulse}, level: number}}
   */
  tick(freqData, t) {
    const dt = this.lastT === null ? 1 / 60 : Math.min(0.1, Math.max(0.001, t - this.lastT));
    this.lastT = t;

    const out = {};
    let overall = 0;
    for (const [name, [lo, hi]] of Object.entries(this.bins)) {
      const s = this.state[name];
      const n = hi - lo + 1;

      let energy = 0;
      let flux = 0;
      for (let i = lo; i <= hi; i++) {
        const v = freqData[i] / 255;
        energy += v;
        if (s.prev) flux += Math.max(0, v - s.prev[i - lo]);
      }
      energy /= n;
      flux /= n;
      s.prev = s.prev ?? new Float64Array(n);
      for (let i = lo; i <= hi; i++) s.prev[i - lo] = freqData[i] / 255;

      // hardness: asymmetric envelope
      const coef = energy > s.level ? 1 - Math.exp(-dt / ATTACK_S) : 1 - Math.exp(-dt / RELEASE_S);
      s.level += (energy - s.level) * coef;

      // rhythm: onset when flux jumps above its running average
      s.fluxAvg += (flux - s.fluxAvg) * (1 - Math.exp(-dt / FLUX_AVG_S));
      if (flux > s.fluxAvg * ONSET_FACTOR + 0.005) {
        s.pulse = Math.min(1, Math.max(s.pulse, flux / (s.fluxAvg * 3 + 0.01)));
      } else {
        s.pulse *= Math.exp(-dt / PULSE_DECAY_S);
      }

      out[name] = { level: Math.min(1, s.level * 1.6), pulse: s.pulse };
      overall += out[name].level;
    }
    out.level = overall / 3;
    return out;
  }
}
