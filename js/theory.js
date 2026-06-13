/* ============================================================================
 * Sonus · theory.js
 * Motor de teoría musical: deletreo enarmónico, escalas/modos, acordes
 * diatónicos, cifrado romano, préstamo modal y progresiones.
 * Sin dependencias. Todo es pitch-class (0..11, C = 0).
 * ==========================================================================*/

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// Representación de pitch-class con sostenidos y bemoles (para fallback).
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const FLAT_ROOTS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'B♭', 'E♭', 'A♭', 'D♭', 'G♭']);

/** Convierte un desplazamiento de alteración en su símbolo. */
function accidental(off) {
  if (off === 0) return '';
  if (off === 1) return '#';
  if (off === -1) return 'b';
  if (off === 2) return 'x';      // doble sostenido
  if (off === -2) return 'bb';    // doble bemol
  return off > 0 ? '#'.repeat(off) : 'b'.repeat(-off);
}

/** Normaliza símbolos unicode (♯ ♭) a ascii. */
function normalizeName(name) {
  return name.replace(/♯/g, '#').replace(/♭/g, 'b').trim();
}

/** Parsea un nombre de nota → { letter, letterIdx, pc, accOff }. */
export function parseNote(name) {
  name = normalizeName(name);
  const letter = name[0].toUpperCase();
  const rest = name.slice(1);
  let accOff = 0;
  for (const ch of rest) {
    if (ch === '#') accOff += 1;
    else if (ch === 'b') accOff -= 1;
    else if (ch === 'x') accOff += 2;
  }
  const letterIdx = LETTERS.indexOf(letter);
  const pc = ((LETTER_PC[letter] + accOff) % 12 + 12) % 12;
  return { letter, letterIdx, pc, accOff };
}

function preferFlats(rootName) {
  rootName = normalizeName(rootName);
  if (rootName.includes('b')) return true;
  if (rootName.includes('#')) return false;
  return FLAT_ROOTS.has(rootName);
}

/** Deletrea un pitch-class libremente (fallback no diatónico). */
function spellPc(pc, useFlats) {
  pc = ((pc % 12) + 12) % 12;
  const name = useFlats ? FLAT_NAMES[pc] : SHARP_NAMES[pc];
  return { name, pc, letter: name[0], accOff: name.length > 1 ? (name[1] === '#' ? 1 : -1) : 0 };
}

/* ----------------------------------------------------------------------------
 * Definición de escalas / modos.
 * steps = intervalos en semitonos entre notas consecutivas (suma 12).
 * --------------------------------------------------------------------------*/
export const SCALES = {
  ionian:        { name: 'Jónico (Mayor)',       steps: [2, 2, 1, 2, 2, 2, 1], diatonic: true,  family: 'mayor',  mood: 'Brillante, estable, resolutivo.' },
  dorian:        { name: 'Dórico',               steps: [2, 1, 2, 2, 2, 1, 2], diatonic: true,  family: 'menor',  mood: 'Menor con 6ª mayor: sofisticado, jazzístico.' },
  phrygian:      { name: 'Frigio',               steps: [1, 2, 2, 2, 1, 2, 2], diatonic: true,  family: 'menor',  mood: 'Oscuro y tenso (b2): flamenco, épico.' },
  lydian:        { name: 'Lidio',                steps: [2, 2, 2, 1, 2, 2, 1], diatonic: true,  family: 'mayor',  mood: 'Soñador y flotante (#4): cine, fantasía.' },
  mixolydian:    { name: 'Mixolidio',            steps: [2, 2, 1, 2, 2, 1, 2], diatonic: true,  family: 'mayor',  mood: 'Mayor con b7: rock, blues, dominante.' },
  aeolian:       { name: 'Eólico (menor nat.)',  steps: [2, 1, 2, 2, 1, 2, 2], diatonic: true,  family: 'menor',  mood: 'Melancólico, introspectivo.' },
  locrian:       { name: 'Locrio',               steps: [1, 2, 2, 1, 2, 2, 2], diatonic: true,  family: 'menor',  mood: 'Inestable (b2, b5): tensión extrema.' },
  harmonicMinor: { name: 'Menor armónica',       steps: [2, 1, 2, 2, 1, 3, 1], diatonic: true,  family: 'menor',  mood: 'Exótica y dramática (7ª mayor + b6).' },
  melodicMinor:  { name: 'Menor melódica',       steps: [2, 1, 2, 2, 2, 2, 1], diatonic: true,  family: 'menor',  mood: 'Menor con 6ª y 7ª mayores: jazz moderno.' },
  majorPent:     { name: 'Pentatónica mayor',    steps: [2, 2, 3, 2, 3],       diatonic: false, family: 'mayor',  mood: 'Universal, sin tensiones.' },
  minorPent:     { name: 'Pentatónica menor',    steps: [3, 2, 2, 3, 2],       diatonic: false, family: 'menor',  mood: 'Rock, blues, solos.' },
  blues:         { name: 'Blues',                steps: [3, 2, 1, 1, 3, 2],    diatonic: false, family: 'menor',  mood: 'Expresiva (blue note).' },
  wholeTone:     { name: 'Tonos enteros',        steps: [2, 2, 2, 2, 2, 2],    diatonic: false, family: 'aug',    mood: 'Etérea, ambigua (Debussy).' },
  diminished:    { name: 'Disminuida (T-S)',     steps: [2, 1, 2, 1, 2, 1, 2, 1], diatonic: false, family: 'dim', mood: 'Simétrica, tensa.' },
  chromatic:     { name: 'Cromática',            steps: [1,1,1,1,1,1,1,1,1,1,1,1], diatonic: false, family: 'all', mood: 'Las 12 notas.' },
};

export const MODE_ORDER = ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian'];

/** Construye las notas de una escala con deletreo correcto. */
export function buildScale(rootName, scaleKey) {
  const scale = SCALES[scaleKey];
  if (!scale) throw new Error('Escala desconocida: ' + scaleKey);
  const root = parseNote(rootName);
  const notes = [];
  let cum = 0;

  if (scale.diatonic && scale.steps.length === 7) {
    for (let i = 0; i < 7; i++) {
      const letterIdx = (root.letterIdx + i) % 7;
      const letter = LETTERS[letterIdx];
      const targetPc = ((root.pc + cum) % 12 + 12) % 12;
      const naturalPc = LETTER_PC[letter];
      let diff = targetPc - naturalPc;
      while (diff > 6) diff -= 12;
      while (diff < -6) diff += 12;
      notes.push({ name: letter + accidental(diff), pc: targetPc, letter, accOff: diff, degree: i });
      cum += scale.steps[i];
    }
  } else {
    const useFlats = preferFlats(rootName);
    let pc = root.pc;
    for (let i = 0; i < scale.steps.length; i++) {
      const s = spellPc(pc, useFlats);
      notes.push({ ...s, degree: i });
      pc += scale.steps[i];
    }
  }
  return notes;
}

/* ----------------------------------------------------------------------------
 * Acordes.
 * --------------------------------------------------------------------------*/
export const QUALITIES = {
  maj:     { label: 'Mayor',          suffix: '',     roman: 'upper', color: '#5ad1a8' },
  min:     { label: 'menor',          suffix: 'm',    roman: 'lower', color: '#6aa7ff' },
  dim:     { label: 'disminuido',     suffix: '°',    roman: 'lower', mark: '°', color: '#c98bff' },
  aug:     { label: 'aumentado',      suffix: '+',    roman: 'upper', mark: '+', color: '#ffb16a' },
  maj7:    { label: 'Maj7',           suffix: 'maj7', roman: 'upper', color: '#5ad1a8' },
  dom7:    { label: '7 (dominante)',  suffix: '7',    roman: 'upper', color: '#ffd36a' },
  min7:    { label: 'm7',             suffix: 'm7',   roman: 'lower', color: '#6aa7ff' },
  minMaj7: { label: 'm(maj7)',        suffix: 'm(maj7)', roman: 'lower', color: '#8a9cff' },
  m7b5:    { label: 'ø7 (semidim.)',  suffix: 'm7b5', roman: 'lower', mark: 'ø7', color: '#c98bff' },
  dim7:    { label: '°7',             suffix: '°7',   roman: 'lower', mark: '°7', color: '#c98bff' },
  aug7:    { label: '7#5',            suffix: '7#5',  roman: 'upper', color: '#ffb16a' },
  augMaj7: { label: 'maj7#5',         suffix: 'maj7#5', roman: 'upper', color: '#ffb16a' },
  sus:     { label: 'sus',            suffix: 'sus',  roman: 'upper', color: '#9fb3c8' },
};

/** Determina la calidad del acorde a partir de sus intervalos (semitonos desde la raíz). */
function chordQuality(intervals) {
  const has = (x) => intervals.includes(x);
  const third = has(4) ? 4 : has(3) ? 3 : null;
  const fifth = has(7) ? 7 : has(6) ? 6 : has(8) ? 8 : 7;
  const seventh = has(11) ? 11 : has(10) ? 10 : has(9) ? 9 : null;

  if (seventh === null) {
    if (third === 4 && fifth === 7) return 'maj';
    if (third === 3 && fifth === 7) return 'min';
    if (third === 3 && fifth === 6) return 'dim';
    if (third === 4 && fifth === 8) return 'aug';
    if (third === 4 && fifth === 6) return 'maj';
    return third === 3 ? 'min' : 'maj';
  }
  if (third === 4 && fifth === 7 && seventh === 11) return 'maj7';
  if (third === 4 && fifth === 7 && seventh === 10) return 'dom7';
  if (third === 3 && fifth === 7 && seventh === 10) return 'min7';
  if (third === 3 && fifth === 7 && seventh === 11) return 'minMaj7';
  if (third === 3 && fifth === 6 && seventh === 10) return 'm7b5';
  if (third === 3 && fifth === 6 && seventh === 9)  return 'dim7';
  if (third === 4 && fifth === 8 && seventh === 10) return 'aug7';
  if (third === 4 && fifth === 8 && seventh === 11) return 'augMaj7';
  return 'maj7';
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const MAJOR_OFFSETS = [0, 2, 4, 5, 7, 9, 11];

/** Cifrado romano relativo al MAYOR paralelo (muestra alteraciones b/#). */
function romanNumeral(tonicPc, chordRootPc, degreeIdx, quality) {
  const q = QUALITIES[quality];
  let base = ROMAN[degreeIdx % 7];
  base = q.roman === 'lower' ? base.toLowerCase() : base;

  const actual = ((chordRootPc - tonicPc) % 12 + 12) % 12;
  let acc = actual - MAJOR_OFFSETS[degreeIdx % 7];
  while (acc > 6) acc -= 12;
  while (acc < -6) acc += 12;
  const prefix = acc === 0 ? '' : acc < 0 ? 'b'.repeat(-acc) : '#'.repeat(acc);

  let suffix = '';
  if (q.mark) suffix = q.mark;
  else if (quality === 'maj7') suffix = 'maj7';
  else if (quality === 'dom7') suffix = '7';
  else if (quality === 'min7') suffix = '7';
  else if (quality === 'minMaj7') suffix = '(maj7)';

  return prefix + base + suffix;
}

/** Transforma símbolo/cifrado de séptima en su versión de novena. */
function extendNinth(baseSym, baseRoman, baseQuality, ninthDiff) {
  const nine = ninthDiff === 1 ? 'b9' : ninthDiff === 3 ? '#9' : '9';
  let sym;
  if (baseQuality === 'maj7') sym = baseSym.replace('maj7', 'maj9');
  else if (baseQuality === 'dom7') sym = baseSym.replace(/7$/, ninthDiff === 2 ? '9' : '7' + nine);
  else if (baseQuality === 'min7') sym = baseSym.replace('m7', ninthDiff === 2 ? 'm9' : 'm7' + nine);
  else if (baseQuality === 'm7b5') sym = baseSym.replace('m7b5', 'm9b5');
  else if (baseQuality === 'dim7') sym = baseSym.replace('°7', '°9');
  else if (baseQuality === 'minMaj7') sym = baseSym.replace('m(maj7)', 'm(maj9)');
  else sym = baseSym + 'add9';

  let rom;
  if (baseRoman.includes('maj7')) rom = baseRoman.replace('maj7', 'maj9');
  else if (baseRoman.includes('ø7')) rom = baseRoman.replace('ø7', 'ø9');
  else if (baseRoman.includes('°7')) rom = baseRoman.replace('°7', '°9');
  else if (baseRoman.includes('(maj7)')) rom = baseRoman.replace('(maj7)', '(maj9)');
  else if (/7$/.test(baseRoman)) rom = baseRoman.replace(/7$/, ninthDiff === 2 ? '9' : '7' + nine);
  else rom = baseRoman + 'add9';
  return { sym, rom };
}

/**
 * Acordes diatónicos de una escala. size = 3 (tríada) | 4 (séptima) | 5 (novena).
 * Devuelve [{ degree, root, notes, intervals, quality, roman, symbol, color }].
 */
export function diatonicChords(scaleNotes, tonicPc, { size = 3 } = {}) {
  const n = scaleNotes.length;
  const out = [];
  if (n < 3) return out;
  const idxs = size >= 5 ? [0, 2, 4, 6, 8] : size === 4 ? [0, 2, 4, 6] : [0, 2, 4];
  for (let i = 0; i < n; i++) {
    const tones = idxs.map((k) => scaleNotes[(i + k) % n]);
    const rootPc = tones[0].pc;
    const intervals = tones.map((t) => ((t.pc - rootPc) % 12 + 12) % 12);
    const baseQuality = chordQuality(intervals.slice(0, 4));
    const q = QUALITIES[baseQuality];
    let symbol = tones[0].name + q.suffix;
    let roman = romanNumeral(tonicPc, rootPc, i, baseQuality);
    if (size >= 5) {
      const ninthDiff = ((tones[4].pc - rootPc) % 12 + 12) % 12;
      const ext = extendNinth(symbol, roman, baseQuality, ninthDiff);
      symbol = ext.sym; roman = ext.rom;
    }
    out.push({ degree: i, root: tones[0], notes: tones, intervals, quality: baseQuality, roman, symbol, color: q.color, source: 'diatónico' });
  }
  return out;
}

/* ----------------------------------------------------------------------------
 * Préstamo modal (modal interchange).
 * Genera acordes de los modos paralelos (misma tónica) que NO están en la
 * escala actual. El recurso favorito de los grandes compositores.
 * --------------------------------------------------------------------------*/
const BORROW_SOURCES = [
  { key: 'aeolian',       label: 'menor' },
  { key: 'dorian',        label: 'dórico' },
  { key: 'phrygian',      label: 'frigio' },
  { key: 'lydian',        label: 'lidio' },
  { key: 'mixolydian',    label: 'mixolidio' },
  { key: 'ionian',        label: 'mayor' },
  { key: 'harmonicMinor', label: 'menor arm.' },
  { key: 'melodicMinor',  label: 'menor mel.' },
];

export function borrowedChords(rootName, currentScaleKey, { size = 3 } = {}) {
  const root = parseNote(rootName);
  const current = diatonicChords(buildScale(rootName, currentScaleKey), root.pc, { size });
  const ownSymbols = new Set(current.map((c) => c.symbol));
  const seen = new Set(ownSymbols);
  const out = [];

  for (const src of BORROW_SOURCES) {
    if (src.key === currentScaleKey) continue;
    const notes = buildScale(rootName, src.key);
    if (notes.length !== 7) continue;
    const chords = diatonicChords(notes, root.pc, { size });
    for (const c of chords) {
      if (seen.has(c.symbol)) continue;
      seen.add(c.symbol);
      out.push({ ...c, source: src.label });
    }
  }
  // Priorizamos los préstamos más usados (acordes mayores/menores antes que rarezas).
  const priority = { maj: 0, min: 1, dom7: 1, maj7: 1, min7: 1, aug: 3, dim: 3, dim7: 4, m7b5: 4 };
  out.sort((a, b) => (priority[a.quality] ?? 2) - (priority[b.quality] ?? 2));
  return out;
}

/* ----------------------------------------------------------------------------
 * Armonía funcional avanzada: deletreo de acordes a partir de una raíz.
 * --------------------------------------------------------------------------*/
/** Nombre de la nota a `letterStep` letras y `semis` semitonos sobre rootName. */
function intervalAbove(rootName, letterStep, semis) {
  const r = parseNote(rootName);
  const letterIdx = (r.letterIdx + letterStep) % 7;
  const letter = LETTERS[letterIdx];
  const targetPc = ((r.pc + semis) % 12 + 12) % 12;
  let diff = targetPc - LETTER_PC[letter];
  while (diff > 6) diff -= 12; while (diff < -6) diff += 12;
  return letter + accidental(diff);
}

/** Deletrea un acorde: semis = intervalos en semitonos; letterOffsets = saltos de letra. */
function spellChord(rootName, semis, letterOffsets) {
  const root = parseNote(rootName);
  return semis.map((semi, k) => {
    const letterIdx = (root.letterIdx + letterOffsets[k]) % 7;
    const letter = LETTERS[letterIdx];
    const targetPc = ((root.pc + semi) % 12 + 12) % 12;
    let diff = targetPc - LETTER_PC[letter];
    while (diff > 6) diff -= 12; while (diff < -6) diff += 12;
    return { name: letter + accidental(diff), pc: targetPc, letter, accOff: diff };
  });
}

function makeChord(notes, quality, symbol, roman, source) {
  const rootPc = notes[0].pc;
  const intervals = notes.map((t) => ((t.pc - rootPc) % 12 + 12) % 12);
  return { degree: null, root: notes[0], notes, intervals, quality, roman, symbol, color: QUALITIES[quality].color, source };
}

/**
 * Acordes funcionales que tonicizan los grados diatónicos:
 * { secondary: V7/x, leading: vii°7/x, tritone: subV7/x }.
 */
export function functionalChords(rootName, scaleKey) {
  const scaleNotes = buildScale(rootName, scaleKey);
  const empty = { secondary: [], leading: [], tritone: [] };
  if (scaleNotes.length !== 7) return empty;
  const tonicPc = parseNote(rootName).pc;
  const dia = diatonicChords(scaleNotes, tonicPc, { size: 3 });
  const res = { secondary: [], leading: [], tritone: [] };

  dia.forEach((tc, i) => {
    if (i === 0 || tc.quality === 'dim' || tc.quality === 'aug') return; // no tonicizamos I ni disminuidos
    const tRoman = tc.roman;
    const tName = tc.root.name;

    const domRoot = intervalAbove(tName, 4, 7);   // 5ª justa arriba
    res.secondary.push(makeChord(spellChord(domRoot, [0, 4, 7, 10], [0, 2, 4, 6]), 'dom7', domRoot + '7', 'V7/' + tRoman, 'dom. secundaria'));

    const ltRoot = intervalAbove(tName, 6, 11);   // sensible (semitono abajo)
    res.leading.push(makeChord(spellChord(ltRoot, [0, 3, 6, 9], [0, 2, 4, 6]), 'dim7', ltRoot + '°7', 'vii°7/' + tRoman, 'sensible sec.'));

    const subRoot = intervalAbove(tName, 1, 1);    // semitono arriba (♭II del objetivo)
    res.tritone.push(makeChord(spellChord(subRoot, [0, 4, 7, 10], [0, 2, 4, 6]), 'dom7', subRoot + '7', 'subV7/' + tRoman, 'sust. tritonal'));
  });
  return res;
}

/* ----------------------------------------------------------------------------
 * Constructores de acordes para rearmonización (a partir de la raíz objetivo).
 * --------------------------------------------------------------------------*/
export function buildSecondaryDominant(targetRootName, romanLabel) {
  const dr = intervalAbove(targetRootName, 4, 7);
  return makeChord(spellChord(dr, [0, 4, 7, 10], [0, 2, 4, 6]), 'dom7', dr + '7', romanLabel || ('V7/' + targetRootName), 'dom. secundaria');
}
export function buildTritoneSub(targetRootName, romanLabel) {
  const sr = intervalAbove(targetRootName, 1, 1);
  return makeChord(spellChord(sr, [0, 4, 7, 10], [0, 2, 4, 6]), 'dom7', sr + '7', romanLabel || ('subV7/' + targetRootName), 'sust. tritonal');
}
export function buildRelatedTwo(targetRootName, minorTarget, romanLabel) {
  const tr = intervalAbove(targetRootName, 1, 2);
  if (minorTarget) return makeChord(spellChord(tr, [0, 3, 6, 10], [0, 2, 4, 6]), 'm7b5', tr + 'm7b5', romanLabel || ('iiø7/' + targetRootName), 'ii relacionado');
  return makeChord(spellChord(tr, [0, 3, 7, 10], [0, 2, 4, 6]), 'min7', tr + 'm7', romanLabel || ('ii7/' + targetRootName), 'ii relacionado');
}
export function buildPassingDim(rootName, romanLabel) {
  return makeChord(spellChord(rootName, [0, 3, 6, 9], [0, 2, 4, 6]), 'dim7', rootName + '°7', romanLabel || (rootName + '°7'), 'dim. de paso');
}
export function buildMinorSubdominant(scaleNotes, romanLabel) {
  const r = scaleNotes[3].name;
  return makeChord(spellChord(r, [0, 3, 7], [0, 2, 4]), 'min', r + 'm', romanLabel || 'iv', 'menor');
}
/** Dominante «backdoor»: ♭VII7 que resuelve subiendo al I. */
export function buildBackdoorDominant(tonicName, romanLabel) {
  const r = intervalAbove(tonicName, 6, 10); // ♭VII (tono por debajo de la tónica)
  return makeChord(spellChord(r, [0, 4, 7, 10], [0, 2, 4, 6]), 'dom7', r + '7', romanLabel || 'bVII7', 'backdoor');
}
/** Sube una nota un semitono manteniendo coherencia de letra. */
export function sharpenRoot(rootName) { return intervalAbove(rootName, 0, 1); }

/* ----------------------------------------------------------------------------
 * Detección de tonalidad (perfiles Krumhansl-Kessler) a partir de un
 * histograma de pitch-classes ponderado.
 * --------------------------------------------------------------------------*/
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlate(a, b) {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

const PC_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Devuelve los candidatos de tonalidad ordenados por correlación. */
export function detectKey(weights) {
  const results = [];
  for (let t = 0; t < 12; t++) {
    const rotMaj = KK_MAJOR.map((_, i) => KK_MAJOR[(i - t + 12) % 12]);
    const rotMin = KK_MINOR.map((_, i) => KK_MINOR[(i - t + 12) % 12]);
    results.push({ pc: t, root: PC_NAMES[t], scale: 'ionian', family: 'mayor', score: correlate(weights, rotMaj) });
    results.push({ pc: t, root: PC_NAMES[t], scale: 'aeolian', family: 'menor', score: correlate(weights, rotMin) });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 4);
}

/* ----------------------------------------------------------------------------
 * Voicing: convierte un acorde en números MIDI cómodos (root position).
 * --------------------------------------------------------------------------*/
export function chordToMidi(chord, baseOctave = 3) {
  let prev = -1;
  return chord.notes.map((note) => {
    let midi = note.pc + 12 * (baseOctave + 1); // C3 = 48
    if (prev >= 0) while (midi <= prev) midi += 12;
    prev = midi;
    return midi;
  });
}

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/* ----------------------------------------------------------------------------
 * Conducción de voces (voice leading) + inversiones.
 * Para cada acorde se generan todas las inversiones en varias octavas y se
 * elige la que menos mueve las voces respecto al acorde anterior.
 * --------------------------------------------------------------------------*/
export function chordVoicings(chord, register = 4) {
  const pcs = chord.notes.map((n) => n.pc);
  const variants = [];
  for (let inv = 0; inv < pcs.length; inv++) {
    const rot = pcs.slice(inv).concat(pcs.slice(0, inv));
    for (let oct = -1; oct <= 1; oct++) {
      const baseMidi = 12 * (register + 1) + 12 * oct;
      const midis = [];
      let prev = -1;
      rot.forEach((pc, i) => {
        let m;
        if (i === 0) m = pc + 12 * Math.round((baseMidi - pc) / 12);
        else { m = pc + 12 * Math.round((prev - pc) / 12); while (m <= prev) m += 12; }
        prev = m; midis.push(m);
      });
      variants.push({ midis, inversion: inv });
    }
  }
  return variants;
}

function voicingDistance(a, b) {
  const sa = [...a].sort((x, y) => x - y), sb = [...b].sort((x, y) => x - y);
  const n = Math.min(sa.length, sb.length);
  let cost = 0;
  for (let i = 0; i < n; i++) cost += Math.abs(sa[i] - sb[i]);
  cost += Math.abs(sa.length - sb.length) * 3;
  const avg = sb.reduce((s, x) => s + x, 0) / sb.length;
  cost += Math.abs(avg - 60) * 0.15;
  return cost;
}

/** Devuelve las voicings de toda la progresión con conducción suave. */
export function voiceLeadProgression(progression, { register = 4 } = {}) {
  let prev = null;
  return progression.map((chord) => {
    const variants = chordVoicings(chord, register);
    let best = variants[0].midis, bestCost = Infinity;
    for (const v of variants) {
      const cost = prev ? voicingDistance(prev, v.midis)
        : Math.abs(v.midis.reduce((s, x) => s + x, 0) / v.midis.length - 60);
      if (cost < bestCost) { bestCost = cost; best = v.midis; }
    }
    prev = best;
    return best;
  });
}

const MIDI_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function midiToName(midi) {
  return MIDI_SHARP[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

/* ----------------------------------------------------------------------------
 * Progresiones armónicas clásicas (por familia tonal).
 * degree = índice diatónico (0..6); seventh opcional por acorde.
 * --------------------------------------------------------------------------*/
export const PROGRESSIONS = {
  mayor: [
    { name: 'Pop axis · I–V–vi–IV',     degrees: [0, 4, 5, 3] },
    { name: 'Canon · I–V–vi–iii–IV–I–IV–V', degrees: [0, 4, 5, 2, 3, 0, 3, 4] },
    { name: 'Doo-wop · I–vi–IV–V',      degrees: [0, 5, 3, 4] },
    { name: 'Jazz · ii–V–I',            degrees: [1, 4, 0], seventh: true },
    { name: 'Andaluza inv · I–VII–IV',  degrees: [0, 6, 3] },
    { name: 'Blues 12 (esbozo)',        degrees: [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4], seventh: true },
    { name: 'Triste · vi–IV–I–V',       degrees: [5, 3, 0, 4] },
  ],
  menor: [
    { name: 'Andaluza · i–VII–VI–V',    degrees: [0, 6, 5, 4] },
    { name: 'Pop menor · i–VI–III–VII',  degrees: [0, 5, 2, 6] },
    { name: 'Épica · i–VI–VII',          degrees: [0, 5, 6] },
    { name: 'Jazz menor · iiø–V–i',      degrees: [1, 4, 0], seventh: true },
    { name: 'i–iv–v',                    degrees: [0, 3, 4] },
    { name: 'i–VII–VI–VII',              degrees: [0, 6, 5, 6] },
  ],
};

/** Sugerencias de continuación según tendencias funcionales (mayor / menor). */
const NEXT_MAJOR = {
  0: [4, 3, 5, 1], 1: [4, 6], 2: [5, 3], 3: [4, 0, 1], 4: [0, 5, 2], 5: [3, 1, 4], 6: [0, 2],
};
const NEXT_MINOR = {
  0: [5, 3, 6, 4], 1: [4, 0], 2: [5, 3], 3: [0, 4, 6], 4: [0, 5], 5: [6, 2, 4], 6: [0, 5, 2],
};

export function suggestNext(lastDegree, family) {
  const map = family === 'menor' ? NEXT_MINOR : NEXT_MAJOR;
  return map[lastDegree] ?? [0, 4, 5];
}

/* Notas cromáticas para selectores de tónica. */
export const ROOT_CHOICES = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
