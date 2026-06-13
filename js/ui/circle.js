/* ============================================================================
 * Sonus · ui/circle.js · Círculo de quintas interactivo.
 * Anillo exterior: tonalidades mayores. Anillo interior: relativas menores.
 * Click para cambiar de tonalidad.
 * ==========================================================================*/

import { parseNote } from '../theory.js';

const NS = 'http://www.w3.org/2000/svg';
// Orden por quintas desde Do (arriba), en sentido horario.
const MAJORS = ['C', 'G', 'D', 'A', 'E', 'B', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
const MINORS = ['Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'Ebm', 'Bbm', 'Fm', 'Cm', 'Gm', 'Dm'];
const MINOR_ROOTS = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'Eb', 'Bb', 'F', 'C', 'G', 'D'];

export class CircleOfFifths {
  constructor(container, app) {
    this.container = container;
    this.app = app;
    this.cx = 200; this.cy = 200;
    this.render();
  }

  _polar(cx, cy, r, deg) {
    const rad = (deg - 90) * Math.PI / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }

  _sector(r1, r2, a1, a2) {
    const [x1, y1] = this._polar(this.cx, this.cy, r2, a1);
    const [x2, y2] = this._polar(this.cx, this.cy, r2, a2);
    const [x3, y3] = this._polar(this.cx, this.cy, r1, a2);
    const [x4, y4] = this._polar(this.cx, this.cy, r1, a1);
    const large = (a2 - a1) > 180 ? 1 : 0;
    return `M${x1} ${y1} A${r2} ${r2} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${r1} ${r1} 0 ${large} 0 ${x4} ${y4} Z`;
  }

  render() {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 400 400');
    svg.classList.add('circle-svg');
    this.svg = svg;
    this.wedges = [];

    const rings = [
      { r1: 118, r2: 190, labels: MAJORS, roots: MAJORS, family: 'mayor', cls: 'maj' },
      { r1: 58, r2: 118, labels: MINORS, roots: MINOR_ROOTS, family: 'menor', cls: 'min' },
    ];

    for (const ring of rings) {
      for (let i = 0; i < 12; i++) {
        const a1 = i * 30 - 15;
        const a2 = i * 30 + 15;
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', this._sector(ring.r1, ring.r2, a1, a2));
        path.setAttribute('class', `wedge ${ring.cls}`);
        const root = ring.roots[i];
        const family = ring.family;
        path.addEventListener('click', () => {
          this.app.setKey(parseNote(root).pc, family === 'menor' ? 'aeolian' : 'ionian', root);
        });
        svg.appendChild(path);

        const mid = (a1 + a2) / 2;
        const [tx, ty] = this._polar(this.cx, this.cy, (ring.r1 + ring.r2) / 2, mid);
        const text = document.createElementNS(NS, 'text');
        text.setAttribute('x', tx);
        text.setAttribute('y', ty + 5);
        text.setAttribute('class', 'wedge-label');
        text.textContent = ring.labels[i];
        text.style.pointerEvents = 'none';
        svg.appendChild(text);
        this.wedges.push({ path, pc: parseNote(ring.roots[i]).pc, family });
      }
    }

    const hub = document.createElementNS(NS, 'circle');
    hub.setAttribute('cx', this.cx); hub.setAttribute('cy', this.cy); hub.setAttribute('r', 56);
    hub.setAttribute('class', 'circle-hub');
    svg.appendChild(hub);

    this.hubText = document.createElementNS(NS, 'text');
    this.hubText.setAttribute('x', this.cx);
    this.hubText.setAttribute('y', this.cy + 7);
    this.hubText.setAttribute('class', 'circle-hub-text');
    svg.appendChild(this.hubText);

    this.container.innerHTML = '';
    this.container.appendChild(svg);
  }

  setActive(rootName, family, label) {
    const rootPc = parseNote(rootName).pc;
    const wantMinor = family === 'menor';
    for (const w of this.wedges) {
      const active = w.pc === rootPc && (wantMinor ? w.family === 'menor' : w.family === 'mayor');
      const neighbor = w.family === (wantMinor ? 'menor' : 'mayor') &&
        ((w.pc - rootPc + 12) % 12 === 7 || (w.pc - rootPc + 12) % 12 === 5);
      const relative = (wantMinor && w.family === 'mayor' && (w.pc - rootPc + 12) % 12 === 3) ||
        (!wantMinor && w.family === 'menor' && (rootPc - w.pc + 12) % 12 === 3);
      w.path.classList.toggle('active', active);
      w.path.classList.toggle('neighbor', neighbor);
      w.path.classList.toggle('relative', relative);
    }
    this.hubText.textContent = label || rootName;
  }
}
