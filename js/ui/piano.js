/* ============================================================================
 * Sonus · ui/piano.js · Teclado de piano interactivo.
 * Tocable con ratón (drag/glissando), táctil y teclado del ordenador.
 * Resalta las notas de la escala activa y la tónica.
 * ==========================================================================*/

import { midiToName } from '../theory.js';

const BLACK = new Set([1, 3, 6, 8, 10]);
// Mapeo del teclado del ordenador (fila inferior + superior), base C4 = 60.
const KEYMAP = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11,
  k: 12, o: 13, l: 14, p: 15, ';': 16, "'": 17,
};

export class Piano {
  constructor(container, app, { startMidi = 48, endMidi = 84 } = {}) {
    this.container = container;
    this.app = app;
    this.startMidi = startMidi;
    this.endMidi = endMidi;
    this.base = 60;
    this.keys = new Map();      // midi -> element
    this.pressed = new Set();
    this.mouseDown = false;
    this.scalePcs = new Set();
    this.rootPc = 0;
    this.render();
    this._bindGlobal();
  }

  render() {
    this.container.innerHTML = '';
    this.container.classList.add('piano');
    const whiteW = 100 / this._countWhite();
    let whiteIdx = 0;

    for (let m = this.startMidi; m <= this.endMidi; m++) {
      const pc = ((m % 12) + 12) % 12;
      const black = BLACK.has(pc);
      const key = document.createElement('div');
      key.className = 'key ' + (black ? 'black' : 'white');
      key.dataset.midi = m;
      if (black) {
        key.style.left = `calc(${whiteIdx * whiteW}% - ${whiteW * 0.32}%)`;
        key.style.width = `${whiteW * 0.64}%`;
      } else {
        key.style.left = `${whiteIdx * whiteW}%`;
        key.style.width = `${whiteW}%`;
        whiteIdx++;
        if (pc === 0) {
          const lbl = document.createElement('span');
          lbl.className = 'key-label';
          lbl.textContent = midiToName(m);
          key.appendChild(lbl);
        }
      }
      this._bindKey(key, m);
      this.keys.set(m, key);
      this.container.appendChild(key);
    }
  }

  _countWhite() {
    let c = 0;
    for (let m = this.startMidi; m <= this.endMidi; m++) if (!BLACK.has(((m % 12) + 12) % 12)) c++;
    return c;
  }

  _bindKey(key, midi) {
    const press = (e) => { e.preventDefault(); this.mouseDown = true; this._press(midi); };
    const enter = () => { if (this.mouseDown) this._press(midi); };
    key.addEventListener('mousedown', press);
    key.addEventListener('mouseenter', enter);
    key.addEventListener('touchstart', (e) => { e.preventDefault(); this._press(midi); }, { passive: false });
  }

  _bindGlobal() {
    window.addEventListener('mouseup', () => { this.mouseDown = false; });
    window.addEventListener('keydown', (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'z') { this.base = Math.max(36, this.base - 12); return; }
      if (e.key === 'x') { this.base = Math.min(96, this.base + 12); return; }
      const semi = KEYMAP[e.key];
      if (semi === undefined) return;
      const midi = this.base + semi;
      if (!this.pressed.has(midi)) { this.pressed.add(midi); this._press(midi); }
    });
    window.addEventListener('keyup', (e) => {
      const semi = KEYMAP[e.key];
      if (semi === undefined) return;
      this.pressed.delete(this.base + semi);
    });
  }

  _press(midi) {
    this.app.playMidi(midi, 0.5);
    this.flash(midi);
  }

  flash(midi) {
    const key = this.keys.get(midi);
    if (!key) return;
    key.classList.add('active');
    setTimeout(() => key.classList.remove('active'), 220);
  }

  /** Resalta notas de la escala (Set de pitch-classes) y la tónica. */
  setScale(scalePcs, rootPc) {
    this.scalePcs = scalePcs;
    this.rootPc = rootPc;
    for (const [midi, key] of this.keys) {
      const pc = ((midi % 12) + 12) % 12;
      key.classList.toggle('in-scale', scalePcs.has(pc));
      key.classList.toggle('root', pc === rootPc);
    }
  }
}
