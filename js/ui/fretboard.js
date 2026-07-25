/* ============================================================================
 * Sonus · ui/fretboard.js
 * Diagramas de instrumentos: mástil de guitarra, bajo de 4 y 5 cuerdas, y
 * teclado de piano. Muestran las notas de la escala y, si se elige un acorde,
 * resaltan sus notas con el grado (R, 3, 5, 7…) para músicos que no dominan
 * las escalas en su instrumento.
 * ==========================================================================*/

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK = new Set([1, 3, 6, 8, 10]);

/** Afinaciones estándar, de cuerda aguda a grave (MIDI). */
export const INSTRUMENT_DEFS = {
  guitar: { name: 'Guitarra', kind: 'fret', strings: [64, 59, 55, 50, 45, 40], frets: 15 },
  bass4:  { name: 'Bajo 4',   kind: 'fret', strings: [43, 38, 33, 28],        frets: 15 },
  bass5:  { name: 'Bajo 5',   kind: 'fret', strings: [43, 38, 33, 28, 23],    frets: 15 },
  piano:  { name: 'Piano',    kind: 'keys', low: 48, high: 84 },
};

const MARKERS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);

/** Grado del acorde a partir del intervalo en semitonos desde su fundamental. */
function degreeLabel(semi) {
  switch (((semi % 12) + 12) % 12) {
    case 0: return 'R';
    case 1: return 'b9';
    case 2: return '9';
    case 3: return 'b3';
    case 4: return '3';
    case 5: return '11';
    case 6: return 'b5';
    case 7: return '5';
    case 8: return '#5';
    case 9: return '13';
    case 10: return 'b7';
    case 11: return '7';
    default: return '';
  }
}

function noteName(pc, spell) {
  return (spell && spell[pc]) || SHARP[pc];
}

/**
 * @param {object} o
 * @param {string} o.instrument   clave de INSTRUMENT_DEFS
 * @param {Set}    o.scalePcs     pitch-classes de la escala
 * @param {number} o.rootPc       tónica de la escala
 * @param {Set}    [o.chordPcs]   pitch-classes del acorde seleccionado
 * @param {number} [o.chordRootPc] fundamental del acorde
 * @param {object} [o.spell]      mapa pc → nombre (deletreo de la escala)
 * @returns {string} SVG
 */
export function renderInstrument(o) {
  const def = INSTRUMENT_DEFS[o.instrument] || INSTRUMENT_DEFS.guitar;
  return def.kind === 'keys' ? renderKeys(def, o) : renderFrets(def, o);
}

/* ------------------------------------------------------------------ mástil */
function renderFrets(def, o) {
  const { scalePcs, rootPc, chordPcs, chordRootPc, spell } = o;
  const nStr = def.strings.length;
  const nFret = def.frets;
  const padL = 40, padT = 22, rowH = 30, fretW = 52;
  const w = padL + (nFret + 1) * fretW + 10;
  const h = padT + nStr * rowH + 24;
  const yOf = (i) => padT + i * rowH + rowH / 2;
  const xOf = (f) => f === 0 ? padL - 20 : padL + (f - 0.5) * fretW + fretW / 2;

  let s = `<svg viewBox="0 0 ${w} ${h}" class="fb-svg" role="img" aria-label="Diagrama de ${def.name}">`;

  // Marcadores de traste.
  for (let f = 1; f <= nFret; f++) {
    if (!MARKERS.has(f) && f !== 12) continue;
    const x = xOf(f);
    s += `<rect x="${x - 16}" y="${padT}" width="32" height="${nStr * rowH}" class="fb-marker"/>`;
    s += `<text x="${x}" y="${h - 7}" class="fb-fretnum">${f}</text>`;
  }
  s += `<text x="${xOf(0)}" y="${h - 7}" class="fb-fretnum">0</text>`;

  // Cuerdas y trastes.
  for (let i = 0; i < nStr; i++) {
    const y = yOf(i);
    s += `<line x1="${padL}" y1="${y}" x2="${padL + nFret * fretW}" y2="${y}" class="fb-string"/>`;
    s += `<text x="${padL - 34}" y="${y + 4}" class="fb-strlabel">${SHARP[((def.strings[i] % 12) + 12) % 12]}</text>`;
  }
  s += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + nStr * rowH}" class="fb-nut"/>`;
  for (let f = 1; f <= nFret; f++) {
    const x = padL + f * fretW;
    s += `<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + nStr * rowH}" class="fb-fret"/>`;
  }

  // Notas.
  const hasChord = chordPcs && chordPcs.size;
  for (let i = 0; i < nStr; i++) {
    for (let f = 0; f <= nFret; f++) {
      const midi = def.strings[i] + f;
      const pc = ((midi % 12) + 12) % 12;
      const inScale = scalePcs.has(pc);
      const inChord = hasChord && chordPcs.has(pc);
      if (!inScale && !inChord) continue;
      const isRoot = pc === rootPc;
      const cls = inChord ? 'chord' : (isRoot ? 'root' : 'scale');
      const dim = hasChord && !inChord ? ' dim' : '';
      const label = inChord && chordRootPc != null ? degreeLabel(pc - chordRootPc) : noteName(pc, spell);
      const x = xOf(f), y = yOf(i);
      s += `<circle cx="${x}" cy="${y}" r="11" class="fb-dot ${cls}${dim}"/>`;
      s += `<text x="${x}" y="${y + 3.5}" class="fb-dotlabel ${cls}${dim}">${label}</text>`;
    }
  }
  return s + '</svg>';
}

/* ------------------------------------------------------------------ teclado */
function renderKeys(def, o) {
  const { scalePcs, rootPc, chordPcs, chordRootPc, spell } = o;
  const hasChord = chordPcs && chordPcs.size;
  const whites = [];
  for (let m = def.low; m <= def.high; m++) if (!BLACK.has(((m % 12) + 12) % 12)) whites.push(m);
  const wW = 34, wH = 128, bW = 21, bH = 80, padT = 6;
  const w = whites.length * wW + 2, h = wH + padT + 20;

  const style = (pc) => {
    const inScale = scalePcs.has(pc), inChord = hasChord && chordPcs.has(pc);
    if (!inScale && !inChord) return null;
    const cls = inChord ? 'chord' : (pc === rootPc ? 'root' : 'scale');
    return { cls: cls + (hasChord && !inChord ? ' dim' : ''), label: inChord && chordRootPc != null ? degreeLabel(pc - chordRootPc) : noteName(pc, spell) };
  };

  let s = `<svg viewBox="0 0 ${w} ${h}" class="kb-svg" role="img" aria-label="Diagrama de teclado">`;
  // Blancas.
  whites.forEach((m, i) => {
    const pc = ((m % 12) + 12) % 12, x = i * wW + 1;
    s += `<rect x="${x}" y="${padT}" width="${wW - 2}" height="${wH}" rx="4" class="kb-white"/>`;
    const st = style(pc);
    if (st) {
      s += `<circle cx="${x + wW / 2 - 1}" cy="${padT + wH - 26}" r="12" class="kb-dot ${st.cls}"/>`;
      s += `<text x="${x + wW / 2 - 1}" y="${padT + wH - 22}" class="kb-dotlabel ${st.cls}">${st.label}</text>`;
    }
    if (pc === 0) s += `<text x="${x + wW / 2 - 1}" y="${h - 5}" class="kb-oct">C${Math.floor(m / 12) - 1}</text>`;
  });
  // Negras.
  whites.forEach((m, i) => {
    const pc = ((m % 12) + 12) % 12;
    if (pc === 4 || pc === 11) return;            // no hay negra tras E ni B
    const bm = m + 1;
    if (bm > def.high) return;
    const bpc = ((bm % 12) + 12) % 12;
    const x = (i + 1) * wW - bW / 2 + 1;
    s += `<rect x="${x}" y="${padT}" width="${bW}" height="${bH}" rx="3" class="kb-black"/>`;
    const st = style(bpc);
    if (st) {
      s += `<circle cx="${x + bW / 2}" cy="${padT + bH - 16}" r="9.5" class="kb-dot ${st.cls}"/>`;
      s += `<text x="${x + bW / 2}" y="${padT + bH - 12.5}" class="kb-dotlabel small ${st.cls}">${st.label}</text>`;
    }
  });
  return s + '</svg>';
}
