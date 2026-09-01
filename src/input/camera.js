// Camera input: one getUserMedia stream, a <video> the renderer uploads as
// the cam() texture, and a 32×24 luminance downscale per video frame that
// core/motion.js turns into {level, pulse} — the same shape as an audio band,
// so any slider can follow ◉cam. DOM-only; the math lives in core/motion.js.

import { frameDifference, luminance, MotionEnvelope } from '../core/motion.js';

const W = 32;
const H = 24;
const STALE_S = 0.15; // no new video frame for this long = the camera is still

export class Camera {
  constructor() {
    this.video = null;
    this.stream = null;
    this.active = false;
    this.starting = null; // pending start() promise, so two clicks share one prompt
    this.onStopped = null;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.bufA = new Float32Array(W * H);
    this.bufB = new Float32Array(W * H);
    this.lum = null;
    this.env = new MotionEnvelope();
    this.frame = { level: 0, pulse: 0 };
    this.motion = 0;
    this.lastVideoTime = -1;
    this.lastFrameAt = -Infinity;
  }

  /** Ask for the front camera. Rejects with a readable message. */
  start() {
    if (this.active) return Promise.resolve();
    if (this.starting) return this.starting;
    if (!navigator.mediaDevices?.getUserMedia) {
      return Promise.reject(new Error('camera not available in this browser'));
    }
    this.starting = (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      this.video = video;
      this.stream = stream;
      this.active = true;
      stream.getVideoTracks()[0]?.addEventListener('ended', () => this.stop());
    })();
    return this.starting.finally(() => { this.starting = null; });
  }

  stop() {
    if (!this.active) return;
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.video) { this.video.pause(); this.video.srcObject = null; }
    this.video = null;
    this.stream = null;
    this.active = false;
    this.lum = null;
    this.motion = 0;
    this.env = new MotionEnvelope();
    this.frame = { level: 0, pulse: 0 };
    this.onStopped?.();
  }

  /** Camera aspect (w/h), 1 until the first frame arrives. */
  get aspect() {
    const v = this.video;
    return v && v.videoWidth > 0 ? v.videoWidth / v.videoHeight : 1;
  }

  /**
   * Call once per animation frame. Analyses a new video frame when there is
   * one; otherwise keeps the envelope releasing.
   * @returns {{level: number, pulse: number}|null} null while inactive
   */
  tick(t) {
    if (!this.active) return null;
    const v = this.video;
    if (v.readyState >= 2 && v.videoWidth > 0 && v.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = v.currentTime;
      this.lastFrameAt = t;
      this.ctx.drawImage(v, 0, 0, W, H);
      const data = this.ctx.getImageData(0, 0, W, H).data;
      const next = this.lum === this.bufA ? this.bufB : this.bufA;
      luminance(data, next);
      this.motion = frameDifference(next, this.lum);
      this.lum = next;
    } else if (t - this.lastFrameAt > STALE_S) {
      this.motion = 0;
    }
    this.frame = this.env.tick(this.motion, t);
    return this.frame;
  }
}
