/* ============================================================================
 * Sonus · ui/notation.js · Vista de partitura (lead sheet) en SVG.
 * Pentagrama en clave de sol con la melodía (cabezas de nota, plicas,
 * corchetes, líneas adicionales) y el cifrado de acordes sobre cada compás.
 * ==========================================================================*/

const NS = 'http://www.w3.org/2000/svg';
const LETTER_ORDER = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const SHARP = [['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0]];

const GAP = 11;                 // separación entre líneas del pentagrama
const STAFF_H = GAP * 4;
const LEFT = 50;
const ROW_H = 150;

export class Notation {
  constructor(container, app) {
    this.container = container;
    this.app = app;
  }

  _pitch(midi, spell) {
    const pc = ((midi % 12) + 12) % 12;
    const octave = Math.floor(midi / 12) - 1;
    if (spell[pc]) return { step: spell[pc].step, alter: spell[pc].alter, octave };
    return { step: SHARP[pc][0], alter: SHARP[pc][1], octave };
  }

  _prettySym(s) {
    return String(s).replace(/^([A-G])b/, '$1♭').replace(/^([A-G])#/, '$1♯').replace(/°/g, '°').replace(/b5/g, '♭5');
  }

  render() {
    const app = this.app;
    const spell = {};
    app.scaleNotes.forEach((n) => { spell[n.pc] = { step: n.letter, alter: n.accOff }; });
    const prog = app.state.progression;
    const melody = app._melodyByCol();
    const seqSteps = app.state.seqSteps;
    const songBars = Math.max(prog.length, Math.ceil(seqSteps / 16), 1);

    const width = Math.max(560, this.container.clientWidth || 900);
    const bpr = width < 600 ? 2 : width < 920 ? 3 : 4;
    const barW = Math.max(150, (width - LEFT - 12) / bpr);
    const rows = Math.ceil(songBars / bpr);
    const height = rows * ROW_H + 30;

    let svg = `<svg viewBox="0 0 ${width} ${height}" class="score-svg" xmlns="${NS}">`;

    for (let m = 0; m < songBars; m++) {
      const row = Math.floor(m / bpr);
      const colInRow = m % bpr;
      const isRowStart = colInRow === 0;
      const x0 = LEFT + colInRow * barW;
      const y0 = 56 + row * ROW_H;          // línea superior
      const yBottom = y0 + STAFF_H;          // línea inferior (E4)

      // Pentagrama (5 líneas).
      if (isRowStart) {
        for (let i = 0; i < 5; i++) {
          const y = y0 + i * GAP;
          svg += `<line x1="${LEFT}" y1="${y}" x2="${width - 6}" y2="${y}" class="staff-line"/>`;
        }
        svg += `<text x="14" y="${yBottom + 4}" class="clef">𝄞</text>`;
        svg += `<text x="${LEFT + 4}" y="${y0 + GAP * 1.7}" class="timesig">4</text>`;
        svg += `<text x="${LEFT + 4}" y="${y0 + GAP * 3.7}" class="timesig">4</text>`;
      }

      // Barra de compás (izquierda).
      svg += `<line x1="${x0}" y1="${y0}" x2="${x0}" y2="${yBottom}" class="barline"/>`;

      // Cifrado de acorde.
      const chord = prog.length ? prog[m % prog.length] : null;
      if (chord) svg += `<text x="${x0 + (isRowStart ? 30 : 8)}" y="${y0 - 12}" class="chord-sym">${this._prettySym(chord.symbol)}</text>`;

      // Notas del compás.
      const padL = isRowStart ? 40 : 12;
      const usable = barW - padL - 10;
      const onsets = [];
      for (let p = 0; p < 16; p++) {
        const notes = melody[(m * 16 + p) % seqSteps];
        if (notes && notes.length) onsets.push({ p, midi: Math.max(...notes) });
      }
      onsets.forEach((on, i) => {
        const end = i + 1 < onsets.length ? onsets[i + 1].p : 16;
        const dur = end - on.p;
        const nx = x0 + padL + (on.p / 16) * usable;
        svg += this._note(nx, on.midi, dur, spell, y0, yBottom);
      });
    }

    // Barra final.
    const lastRow = Math.floor((songBars - 1) / bpr);
    const yEnd0 = 56 + lastRow * ROW_H;
    svg += `<line x1="${width - 6}" y1="${yEnd0}" x2="${width - 6}" y2="${yEnd0 + STAFF_H}" class="barline final"/>`;
    svg += '</svg>';

    this.container.innerHTML = svg;
  }

  _note(x, midi, dur, spell, y0, yBottom) {
    const p = this._pitch(midi, spell);
    const v = p.octave * 7 + LETTER_ORDER[p.step];
    const refE4 = 4 * 7 + LETTER_ORDER.E;       // E4 = línea inferior
    const halfSteps = v - refE4;                 // posiciones (línea/espacio) sobre E4
    const y = yBottom - halfSteps * (GAP / 2);
    const midY = y0 + GAP * 2;                   // línea central (B4)
    const open = dur >= 8;
    let out = '';

    // Líneas adicionales.
    if (halfSteps < 0) for (let h = -2; h >= halfSteps; h -= 2) out += this._ledger(x, yBottom - h * (GAP / 2));
    if (halfSteps > 8) for (let h = 10; h <= halfSteps; h += 2) out += this._ledger(x, yBottom - h * (GAP / 2));

    // Alteración.
    if (p.alter) {
      const acc = p.alter === 1 ? '♯' : p.alter === -1 ? '♭' : p.alter === 2 ? '𝄪' : '𝄫';
      out += `<text x="${x - 14}" y="${y + 4}" class="accidental">${acc}</text>`;
    }

    // Cabeza de nota.
    out += `<ellipse cx="${x}" cy="${y}" rx="6.2" ry="4.6" transform="rotate(-20 ${x} ${y})" class="notehead ${open ? 'open' : ''}"/>`;

    // Puntillo.
    if (dur === 3 || dur === 6 || dur === 12) out += `<circle cx="${x + 10}" cy="${y - 2}" r="1.6" class="dot"/>`;

    // Plica + corchetes.
    if (dur < 16) {
      const up = y > midY;
      const sx = up ? x + 6 : x - 6;
      const sy2 = up ? y - GAP * 3.4 : y + GAP * 3.4;
      out += `<line x1="${sx}" y1="${y}" x2="${sx}" y2="${sy2}" class="stem"/>`;
      const flags = dur <= 1 ? 2 : dur <= 3 ? 1 : 0;   // 16th=2, 8th/8th.=1
      for (let f = 0; f < flags; f++) {
        const fy = sy2 + (up ? 1 : -1) * f * 7;
        const dir = up ? 1 : -1;
        out += `<path d="M${sx} ${fy} q 9 ${dir * 4} 7 ${dir * 13}" class="flag"/>`;
      }
    }
    return out;
  }

  _ledger(x, y) {
    return `<line x1="${x - 10}" y1="${y}" x2="${x + 10}" y2="${y}" class="ledger"/>`;
  }
}
