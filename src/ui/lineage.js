// Context strip for the currently loaded snapshot: origin/operator, rating
// stars, and clickable parent/child thumbs (lineage navigation, §9 v2).

export class LineagePanel {
  /**
   * @param {HTMLElement} container
   * @param {(snap: object) => void} onLoad
   * @param {(id: string, rating: number|null) => void} onRate
   */
  constructor(container, onLoad, onRate) {
    this.container = container;
    this.onLoad = onLoad;
    this.onRate = onRate;
  }

  clear() {
    this.container.textContent = '';
  }

  /** @param {object} snap  @param {object[]} parents  @param {object[]} children */
  show(snap, parents, children) {
    this.clear();

    const head = document.createElement('div');
    head.className = 'lineage-head';
    const label = document.createElement('span');
    label.textContent = snap.operator ? `${snap.origin} · ${snap.operator}` : snap.origin;
    head.appendChild(label);
    head.appendChild(this.buildStars(snap));
    this.container.appendChild(head);

    for (const [title, snaps] of [['parents', parents], ['children', children]]) {
      if (!snaps.length) continue;
      const row = document.createElement('div');
      row.className = 'lineage-row';
      const tag = document.createElement('span');
      tag.className = 'lineage-tag';
      tag.textContent = title;
      row.appendChild(tag);
      for (const s of snaps) {
        const img = document.createElement('img');
        img.src = s.thumb;
        img.title = s.formula.source;
        img.addEventListener('click', () => this.onLoad(s));
        row.appendChild(img);
      }
      this.container.appendChild(row);
    }
  }

  buildStars(snap) {
    const stars = document.createElement('span');
    stars.className = 'stars';
    for (let n = 1; n <= 5; n++) {
      const star = document.createElement('button');
      star.textContent = n <= (snap.rating ?? 0) ? '★' : '☆';
      star.title = `rate ${n}/5`;
      star.addEventListener('click', () => {
        // clicking the current rating clears it
        this.onRate(snap.id, snap.rating === n ? null : n);
      });
      stars.appendChild(star);
    }
    return stars;
  }
}
