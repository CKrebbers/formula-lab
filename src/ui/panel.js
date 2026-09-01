// The control panel as a floating window: drag it by the grip, resize it by
// the corner, make it solid so the image stops bleeding through, and remember
// all of that across launches. Nothing here touches formula state.

const KEY = 'fl.panel';
const MIN_VISIBLE = 48; // px of the panel that must stay on screen
const MARGIN = 8;

export class FloatingPanel {
  /**
   * @param {HTMLElement} panel  the #panel element (position: fixed)
   * @param {HTMLElement} grip   the drag handle inside it
   * @param {Storage} storage
   */
  constructor(panel, grip, storage) {
    this.panel = panel;
    this.grip = grip;
    this.storage = storage;
    this.state = this.load();
    this.apply();
    this.bindDrag();
    this.bindResize();
    window.addEventListener('resize', () => { this.clamp(); this.apply(); });
  }

  load() {
    try {
      const raw = this.storage.getItem(KEY);
      const s = raw ? JSON.parse(raw) : {};
      return {
        x: Number.isFinite(s.x) ? s.x : MARGIN,
        y: Number.isFinite(s.y) ? s.y : MARGIN,
        w: Number.isFinite(s.w) ? s.w : null,
        h: Number.isFinite(s.h) ? s.h : null,
        solid: !!s.solid,
      };
    } catch {
      return { x: MARGIN, y: MARGIN, w: null, h: null, solid: false };
    }
  }

  save() {
    try { this.storage.setItem(KEY, JSON.stringify(this.state)); } catch { /* full or blocked */ }
  }

  apply() {
    const { x, y, w, h, solid } = this.state;
    this.panel.style.left = `${x}px`;
    this.panel.style.top = `${y}px`;
    this.panel.style.width = w ? `${w}px` : '';
    this.panel.style.height = h ? `${h}px` : '';
    this.panel.classList.toggle('solid', solid);
  }

  /** Keep at least a grip's worth of panel inside the viewport. */
  clamp() {
    const rect = this.panel.getBoundingClientRect();
    const maxX = window.innerWidth - MIN_VISIBLE;
    const maxY = window.innerHeight - MIN_VISIBLE;
    this.state.x = Math.min(maxX, Math.max(MIN_VISIBLE - rect.width, this.state.x));
    this.state.y = Math.min(maxY, Math.max(0, this.state.y));
  }

  bindDrag() {
    let start = null;
    this.grip.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return; // grip buttons are not handles
      start = { px: e.clientX, py: e.clientY, x: this.state.x, y: this.state.y };
      this.grip.setPointerCapture(e.pointerId);
      this.panel.classList.add('dragging');
      e.preventDefault();
    });
    this.grip.addEventListener('pointermove', (e) => {
      if (!start) return;
      this.state.x = start.x + (e.clientX - start.px);
      this.state.y = start.y + (e.clientY - start.py);
      this.clamp();
      this.apply();
    });
    const end = () => {
      if (!start) return;
      start = null;
      this.panel.classList.remove('dragging');
      this.save();
    };
    this.grip.addEventListener('pointerup', end);
    this.grip.addEventListener('pointercancel', end);
    this.grip.addEventListener('dblclick', (e) => {
      if (e.target.closest('button')) return;
      this.reset();
    });
  }

  /** CSS `resize: both` does the work; we only remember the result. */
  bindResize() {
    if (typeof ResizeObserver === 'undefined') return;
    let timer = 0;
    new ResizeObserver(() => {
      if (!this.panel.style.width && !this.panel.style.height) return; // not user-sized
      clearTimeout(timer);
      timer = setTimeout(() => {
        const rect = this.panel.getBoundingClientRect();
        this.state.w = Math.round(rect.width);
        this.state.h = Math.round(rect.height);
        this.save();
      }, 200);
    }).observe(this.panel);
  }

  toggleSolid() {
    this.state.solid = !this.state.solid;
    this.apply();
    this.save();
    return this.state.solid;
  }

  reset() {
    this.state = { x: MARGIN, y: MARGIN, w: null, h: null, solid: this.state.solid };
    this.apply();
    this.save();
  }
}
