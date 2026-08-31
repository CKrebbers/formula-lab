// Archive strip: thumbnail grid of saved snapshots. Click = load, ✕ = delete.

export class ArchivePanel {
  /**
   * @param {HTMLElement} container
   * @param {(snapshot: object) => void} onLoad
   * @param {(id: string) => void} onDelete
   */
  constructor(container, onLoad, onDelete) {
    this.container = container;
    this.onLoad = onLoad;
    this.onDelete = onDelete;
  }

  /** @param {object[]} snapshots — newest first (Archive.list() order) */
  refresh(snapshots) {
    this.container.textContent = '';
    for (const snap of snapshots) {
      const item = document.createElement('div');
      item.className = 'archive-item';
      item.title = `${snap.formula.source}\n${new Date(snap.created).toLocaleString()}`;

      const img = document.createElement('img');
      img.src = snap.thumb;
      img.alt = snap.formula.source;
      img.addEventListener('click', () => this.onLoad(snap));

      const del = document.createElement('button');
      del.className = 'archive-del';
      del.textContent = '✕';
      del.title = 'delete snapshot';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onDelete(snap.id);
      });

      item.append(img, del);
      this.container.appendChild(item);
    }
  }
}
