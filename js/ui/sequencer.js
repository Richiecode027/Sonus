/* ============================================================================
 * Sonus · ui/sequencer.js · Piano roll / secuenciador de melodía.
 * Cuadrícula notas × pasos. Resalta las notas dentro de la escala y los
 * límites de pulso. La melodía suena junto a la progresión.
 * ==========================================================================*/

import { midiToName } from '../theory.js';

const BLACK = new Set([1, 3, 6, 8, 10]);

export class Sequencer {
  constructor(container, app) {
    this.container = container;
    this.app = app;
    this.lowMidi = 60;
    this.highMidi = 83;
    this.build();
  }

  build() {
    this.container.innerHTML = `
      <div class="panel-head">
        <h2>Melodía · Piano roll</h2>
        <div class="seq-controls">
          <div class="seg-toggle" id="stepSel">
            <button data-v="16" class="active">16</button>
            <button data-v="32">32</button>
          </div>
          <button class="btn ghost" id="octDown">Octava −</button>
          <button class="btn ghost" id="octUp">Octava +</button>
          <button class="btn ghost" id="seqClear">Limpiar</button>
        </div>
      </div>
      <div class="roll-wrap"><div class="roll" id="roll"></div></div>
      <p class="hint pad">Click en las celdas para dibujar la melodía. Las filas iluminadas pertenecen a la escala actual. La progresión suena de fondo al reproducir.</p>
    `;
    this.roll = this.container.querySelector('#roll');

    this.container.querySelector('#stepSel').addEventListener('click', (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      this.container.querySelectorAll('#stepSel button').forEach((b) => b.classList.toggle('active', b === btn));
      this.app.setSteps(parseInt(btn.dataset.v, 10));
    });
    this.container.querySelector('#octDown').addEventListener('click', () => this.app.shiftOctave(-1));
    this.container.querySelector('#octUp').addEventListener('click', () => this.app.shiftOctave(1));
    this.container.querySelector('#seqClear').addEventListener('click', () => this.app.clearSequence());
  }

  setRange(low, high) { this.lowMidi = low; this.highMidi = high; }

  render() {
    const steps = this.app.state.seqSteps;
    const scalePcs = this.app.scalePcSet;
    const seq = this.app.state.sequence;
    const spb = this.app.transport.stepsPerBeat;

    this.roll.style.setProperty('--steps', steps);
    this.roll.innerHTML = '';
    this.cells = new Map();

    for (let m = this.highMidi; m >= this.lowMidi; m--) {
      const pc = ((m % 12) + 12) % 12;
      const inScale = scalePcs.has(pc);
      const row = document.createElement('div');
      row.className = 'roll-row' + (BLACK.has(pc) ? ' black-row' : '') + (inScale ? ' in-scale' : '');

      const label = document.createElement('div');
      label.className = 'roll-label';
      label.textContent = midiToName(m);
      row.appendChild(label);

      const lane = document.createElement('div');
      lane.className = 'roll-lane';
      lane.style.gridTemplateColumns = `repeat(${steps}, 1fr)`;
      for (let c = 0; c < steps; c++) {
        const cell = document.createElement('div');
        cell.className = 'roll-cell' + (c % spb === 0 ? ' beat' : '') + (c % (spb * 4) === 0 ? ' bar' : '');
        cell.dataset.midi = m; cell.dataset.col = c;
        const key = `${m}:${c}`;
        if (seq[key]) cell.classList.add('on');
        cell.addEventListener('click', () => this._toggle(m, c, cell));
        this.cells.set(key, cell);
        lane.appendChild(cell);
      }
      row.appendChild(lane);
      this.roll.appendChild(row);
    }
  }

  _toggle(midi, col, cell) {
    const key = `${midi}:${col}`;
    const seq = this.app.state.sequence;
    if (seq[key]) { delete seq[key]; cell.classList.remove('on'); }
    else { seq[key] = true; cell.classList.add('on'); this.app.playMidi(midi, 0.4); }
    this.app.touch();
  }

  setPlayhead(col) {
    if (this._lastCol !== undefined && this._lastCol >= 0) {
      this.roll.querySelectorAll(`.roll-cell.playhead`).forEach((c) => c.classList.remove('playhead'));
    }
    this._lastCol = col;
    if (col < 0) return;
    for (const [key, cell] of this.cells) {
      if (parseInt(key.split(':')[1], 10) === col) cell.classList.add('playhead');
    }
  }
}
