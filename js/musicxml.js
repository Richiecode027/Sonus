/* ============================================================================
 * Sonus · musicxml.js
 * Exporta la composición como MusicXML 3.1 (partwise): pentagrama de melodía
 * en clave de sol + símbolos de acorde (harmony). Se abre en MuseScore,
 * Finale, Sibelius, Dorico… para editar e imprimir partitura/PDF.
 * ==========================================================================*/

import { parseNote } from './theory.js';

const SHARP = [['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0]];
const MAJOR_FIFTHS = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6 };

const KIND = {
  maj: 'major', min: 'minor', dim: 'diminished', aug: 'augmented',
  maj7: 'major-seventh', dom7: 'dominant', min7: 'minor-seventh',
  minMaj7: 'major-minor', m7b5: 'half-diminished', dim7: 'diminished-seventh',
  aug7: 'augmented-seventh', augMaj7: 'augmented',
};

const STD = [[16, 'whole', false], [12, 'half', true], [8, 'half', false], [6, 'quarter', true], [4, 'quarter', false], [3, 'eighth', true], [2, 'eighth', false], [1, '16th', false]];

function decompose(d) {
  const out = []; let r = d;
  for (const [v, t, dot] of STD) while (r >= v) { out.push({ div: v, type: t, dot }); r -= v; }
  return out;
}

function midiToPitch(midi, spell) {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  if (spell[pc]) return { step: spell[pc].step, alter: spell[pc].alter, octave };
  return { step: SHARP[pc][0], alter: SHARP[pc][1], octave };
}

function emitRest(d) {
  return decompose(d).map((c) =>
    `<note><rest/><duration>${c.div}</duration><type>${c.type}</type>${c.dot ? '<dot/>' : ''}</note>`).join('');
}

function emitNote(p, d) {
  const comps = decompose(d);
  return comps.map((c, i) => {
    const tieStart = i < comps.length - 1, tieStop = i > 0;
    const tie = (tieStop ? '<tie type="stop"/>' : '') + (tieStart ? '<tie type="start"/>' : '');
    const tied = (tieStop ? '<tied type="stop"/>' : '') + (tieStart ? '<tied type="start"/>' : '');
    const pitch = `<pitch><step>${p.step}</step>${p.alter ? `<alter>${p.alter}</alter>` : ''}<octave>${p.octave}</octave></pitch>`;
    return `<note>${pitch}<duration>${c.div}</duration>${tie}<type>${c.type}</type>${c.dot ? '<dot/>' : ''}${tied ? `<notations>${tied}</notations>` : ''}</note>`;
  }).join('');
}

function harmonyXML(chord) {
  if (!chord || !chord.root) return '';
  const r = parseNote(chord.root.name || chord.rootName);
  const step = r.letter;
  const alter = r.accOff;
  const kind = KIND[chord.quality] || 'major';
  return `<harmony print-frame="no"><root><root-step>${step}</root-step>${alter ? `<root-alter>${alter}</root-alter>` : ''}</root><kind text="${(chord.symbol || '').replace(/[<>&]/g, '')}">${kind}</kind></harmony>`;
}

/**
 * @param {object} o
 * @param {string} o.title
 * @param {number} o.bpm
 * @param {string} o.rootName        tónica (para armadura aproximada)
 * @param {Array}  o.scaleNotes      notas de la escala (deletreo)
 * @param {Array}  o.progression     acordes (1 por compás)
 * @param {object} o.melodyByCol     { col: [midis] }
 * @param {number} o.seqSteps
 * @param {number} o.songBars
 * @returns {string} XML
 */
export function buildMusicXML({ title = 'Sonus', bpm = 100, rootName = 'C', scaleNotes = [], progression = [], melodyByCol = {}, seqSteps = 16, songBars = 1 }) {
  const spell = {};
  scaleNotes.forEach((n) => { spell[n.pc] = { step: n.letter, alter: n.accOff }; });
  const fifths = MAJOR_FIFTHS[rootName] ?? 0;
  const bars = Math.max(songBars, progression.length || 1, 1);

  let measures = '';
  for (let m = 0; m < bars; m++) {
    // Onsets de melodía dentro del compás (patrón repetido).
    const onsets = [];
    for (let p = 0; p < 16; p++) {
      const col = m * 16 + p;
      const notes = melodyByCol[col % seqSteps];
      if (notes && notes.length) onsets.push({ p, midi: Math.max(...notes) });
    }

    let body = '';
    const chord = progression.length ? progression[m % progression.length] : null;
    body += harmonyXML(chord);

    if (!onsets.length) {
      body += emitRest(16);
    } else {
      if (onsets[0].p > 0) body += emitRest(onsets[0].p);
      onsets.forEach((on, i) => {
        const end = i + 1 < onsets.length ? onsets[i + 1].p : 16;
        body += emitNote(midiToPitch(on.midi, spell), end - on.p);
      });
    }

    const attributes = m === 0
      ? `<attributes><divisions>4</divisions><key><fifths>${fifths}</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>`
      : '';
    const tempo = m === 0
      ? `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type><sound tempo="${bpm}"/></direction>`
      : '';
    measures += `<measure number="${m + 1}">${attributes}${tempo}${body}</measure>`;
  }

  const safeTitle = String(title).replace(/[<>&]/g, '');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>${safeTitle}</work-title></work>
  <identification><encoding><software>Sonus</software></encoding></identification>
  <part-list><score-part id="P1"><part-name>Melodía</part-name></score-part></part-list>
  <part id="P1">${measures}</part>
</score-partwise>`;
}
