// Cue / program (preview / live), the video-mixer model for the panel.
//
// PROGRAM is what the display windows are showing. CUE is what the panel is
// editing. Only TAKE commits cue → program and lets a new formula reach the
// displays; the panel's own canvas is the cue preview.
//
// Policy B (DECISIONS.md ADR #28): the live channel — params, coords, style —
// streams straight through while cue and program share the SAME formula
// source, so sliders, LFOs and audio keep driving the live image. The moment
// the source differs the channel closes and nothing reaches the displays
// until TAKE. Uniform-level play stays live; authoring needs a commit.
//
// Pure: the only outside contact is the injected send(type, payload).

export class CueProgram {
  /** @param {(type: string, payload: object) => void} send */
  constructor(send) {
    this.send = send;
    this.program = null; // mirrors exactly what the displays show
    this.cueMode = true;
  }

  /** Formula source the displays are currently showing. */
  get programSource() {
    return this.program ? this.program.source : null;
  }

  /** Is the uniform-level live channel open for this cue source? */
  isLive(cueSource) {
    return !!this.program && this.program.source === cueSource;
  }

  /** Does this cue need a TAKE to reach the displays? */
  isArmed(cueSource) {
    return this.cueMode && !!this.program && this.program.source !== cueSource;
  }

  /**
   * Commit cue → program. Sends one 'formula' when the source changed (the
   * displays rebuild and reset feedback), otherwise a plain 'params' refresh
   * so an unchanged formula never triggers a needless crossfade.
   * @returns {boolean} true when the formula itself changed
   */
  take(state) {
    const sourceChanged = !this.program || this.program.source !== state.source;
    this.program = { ...state, params: { ...state.params } };
    if (sourceChanged) this.send('formula', this.program);
    else this.send('params', { params: this.program.params });
    return sourceChanged;
  }

  /**
   * Uniform-level update (params / coords / style). Reaches the displays only
   * while the live channel is open; program is kept in step so it stays a
   * true mirror of what is on screen.
   * @returns {boolean} true when it was actually sent
   */
  live(type, payload, cueSource) {
    if (!this.isLive(cueSource)) return false;
    Object.assign(this.program, payload.params ? { params: { ...payload.params } } : payload);
    this.send(type, payload);
    return true;
  }

  /** A display asked what to show: always answer with program, never cue. */
  hello() {
    if (this.program) this.send('formula', this.program);
  }
}
