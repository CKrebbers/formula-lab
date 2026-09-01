// XY scope — the IMAGE of a parametric formula f(t) → (x, y) (ADR 001).
// Draws the exact compiled function the worklet is playing, on the audio
// clock: vec2 traces x against y (L against R), a scalar traces its waveform.
// Phosphor-style persistence: each frame dims the last instead of clearing.

const POINTS = 768;
const WINDOW_S = 0.012; // ~12 ms of signal per frame — a few cycles at 100+ Hz

export class Scope {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.size = 220;
    canvas.width = this.size * devicePixelRatio;
    canvas.height = this.size * devicePixelRatio;
    this.g.scale(devicePixelRatio, devicePixelRatio);
  }

  show(on) {
    this.canvas.hidden = !on;
    if (!on) this.g.clearRect(0, 0, this.size, this.size);
  }

  /**
   * @param {AVSound} sound — evalAt/audioTime/compiled
   * @param {object} params — live param values
   * @param {number[]} mouse
   */
  draw(sound, params, mouse) {
    const t1 = sound.audioTime();
    if (t1 === null || !sound.compiled) return;
    const g = this.g;
    const s = this.size;
    const isXY = sound.compiled.mode !== 'scalar';

    g.fillStyle = 'rgba(15, 15, 27, 0.28)'; // persistence fade
    g.fillRect(0, 0, s, s);
    g.strokeStyle = '#8be9b6';
    g.lineWidth = 1;
    g.beginPath();
    let started = false;
    for (let k = 0; k < POINTS; k++) {
      const t = t1 - WINDOW_S + (WINDOW_S * k) / POINTS;
      const v = sound.evalAt(t, params, mouse);
      if (!v || !Number.isFinite(v[0]) || !Number.isFinite(v[1])) { started = false; continue; }
      let px, py;
      if (isXY) {
        px = (v[0] * 0.5 + 0.5) * s;
        py = (1 - (v[1] * 0.5 + 0.5)) * s;
      } else {
        px = (k / POINTS) * s;
        py = (1 - (Math.tanh(v[0]) * 0.5 + 0.5)) * s; // tanh: match the limiter's view
      }
      if (started) g.lineTo(px, py);
      else { g.moveTo(px, py); started = true; }
    }
    g.stroke();
  }
}
