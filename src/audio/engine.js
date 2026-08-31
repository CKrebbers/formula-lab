// Web Audio capture wrapper. Two sources:
//  - tab share (system audio on macOS = share a Chrome TAB with audio enabled;
//    whole-screen shares carry no audio on mac)
//  - microphone / loopback device (BlackHole shows up here)
// Analysis itself is pure (analysis.js).

import { AudioAnalysis } from './analysis.js';

const FFT_SIZE = 2048;

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.analyser = null;
    this.analysis = null;
    this.freq = null;
    this.active = false;
    this.onStopped = null; // UI hook
  }

  /** System audio via tab share: pick the tab that plays, tick "share tab audio". */
  async startTab() {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    return this.connect(stream);
  }

  /** Microphone or a loopback input device (e.g. BlackHole). */
  async startMic() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false },
    });
    return this.connect(stream);
  }

  connect(stream) {
    if (!stream.getAudioTracks().length) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error('no audio in that share — pick a TAB and enable "share tab audio"');
    }
    this.stop(); // replace any previous source
    this.stream = stream;
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
    this.analyser.smoothingTimeConstant = 0; // envelopes are ours (analysis.js)
    source.connect(this.analyser);
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    this.analysis = new AudioAnalysis(this.ctx.sampleRate, FFT_SIZE);
    this.active = true;
    stream.getTracks().forEach((t) => { t.onended = () => this.stop(); });
  }

  stop() {
    if (!this.active && !this.stream) return;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    this.stream = null;
    this.ctx = null;
    this.active = false;
    this.onStopped?.();
  }

  /** Per-frame features, or null when idle. */
  tick(t) {
    if (!this.active) return null;
    this.analyser.getByteFrequencyData(this.freq);
    return this.analysis.tick(this.freq, t);
  }
}
