/* ============================================================================
 * Sonus · generator.js
 * Generador de melodías consciente de la armonía. Coloca notas de acorde en
 * los tiempos fuertes, se mueve por grados conjuntos en los débiles, repite un
 * motivo rítmico y cierra la frase en una nota estable.
 * ==========================================================================*/

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function nearestIndex(pool, ref) {
  let bi = 0, bd = Infinity;
  pool.forEach((m, i) => { const d = Math.abs(m - ref); if (d < bd) { bd = d; bi = i; } });
  return bi;
}

function nearestWithPc(pool, pc, ref) {
  const cands = pool.filter((m) => ((m % 12) + 12) % 12 === pc);
  if (!cands.length) return null;
  return cands.reduce((best, m) => Math.abs(m - ref) < Math.abs(best - ref) ? m : best, cands[0]);
}

function nearestChordTone(pool, pcs, ref, rng) {
  const cands = pool
    .filter((m) => pcs.has(((m % 12) + 12) % 12) && Math.abs(m - ref) <= 12)
    .sort((a, b) => Math.abs(a - ref) - Math.abs(b - ref));
  if (!cands.length) return nearestWithPc(pool, [...pcs][0], ref);
  return cands[Math.floor(rng() * Math.min(3, cands.length))];
}

function stepwise(pool, ref, rng) {
  const idx = nearestIndex(pool, ref);
  const steps = [-1, 1, -1, 1, -2, 2, -1, 1];
  const delta = steps[Math.floor(rng() * steps.length)];
  const ni = Math.max(0, Math.min(pool.length - 1, idx + delta));
  return pool[ni];
}

const PATTERNS = [
  [0, 4, 8, 12],
  [0, 4, 6, 8, 12, 14],
  [0, 3, 4, 8, 11, 12],
  [0, 2, 4, 8, 10, 12],
  [0, 4, 8, 10, 12],
  [0, 6, 8, 12, 14],
];

/**
 * @param {object} o
 * @param {Array}  o.chords     acordes activos por compás (objetos con .notes)
 * @param {number} o.steps      pasos totales del patrón
 * @param {Set}    o.scalePcs   pitch-classes de la escala
 * @param {number} o.low,o.high rango MIDI
 * @param {number} [o.stepsPerBeat=4]
 * @param {number} [o.seed]
 * @returns {object} sequence { "midi:col": true }
 */
export function generateMelody({ chords = [], steps, scalePcs, low, high, stepsPerBeat = 4, seed }) {
  const rng = mulberry32((seed ?? Date.now()) >>> 0);
  const pool = [];
  for (let m = low; m <= high; m++) if (scalePcs.has(((m % 12) + 12) % 12)) pool.push(m);
  if (!pool.length) return {};

  const barSteps = stepsPerBeat * 4;
  const totalBars = Math.max(1, Math.ceil(steps / barSteps));
  const seq = {};

  const baseRhythm = PATTERNS[Math.floor(rng() * PATTERNS.length)];
  const center = pool[Math.floor(pool.length / 2)];
  let last = chords[0] ? (nearestWithPc(pool, chords[0].notes[0].pc, center) ?? center) : center;

  for (let bar = 0; bar < totalBars; bar++) {
    const chord = chords.length ? chords[bar % chords.length] : null;
    const pcs = chord ? new Set(chord.notes.map((n) => n.pc)) : null;
    const rhythm = (bar > 0 && rng() < 0.4) ? PATTERNS[Math.floor(rng() * PATTERNS.length)] : baseRhythm;

    rhythm.forEach((pos, idx) => {
      const col = bar * barSteps + pos;
      if (col >= steps) return;
      const strong = pos % 4 === 0;
      const isLast = bar === totalBars - 1 && idx === rhythm.length - 1;
      let note;
      if (isLast && pcs) note = nearestWithPc(pool, chord.notes[0].pc, last);
      else if (pcs && (strong || rng() < 0.35)) note = nearestChordTone(pool, pcs, last, rng);
      else note = stepwise(pool, last, rng);
      if (note == null) return;
      seq[note + ':' + col] = true;
      last = note;
    });
  }
  return seq;
}
