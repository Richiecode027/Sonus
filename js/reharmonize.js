/* ============================================================================
 * Sonus · reharmonize.js
 * Toma una progresión y genera variantes enriquecidas (séptimas, dominantes
 * secundarias, sustitución tritonal, ii–V, color modal, disminuidos de paso).
 * Cada variante es un array de acordes listo para reproducir/aplicar.
 * ==========================================================================*/

import {
  buildSecondaryDominant, buildTritoneSub, buildRelatedTwo, buildPassingDim,
  buildMinorSubdominant, buildBackdoorDominant, sharpenRoot,
} from './theory.js';

// Sustitutos diatónicos de igual función (tónica/subdominante/dominante).
const DIATONIC_SUB = { 0: 5, 1: 3, 2: 0, 3: 1, 4: 4, 5: 2, 6: 4 };

function romanBase(r) {
  const m = String(r).match(/^[b#♭♯]*[IVXivx]+/);
  return m ? m[0] : String(r);
}

export function reharmonize(progression, ctx) {
  if (!progression.length) return [];
  const { scaleNotes, diatonic4 } = ctx;
  const variants = [];

  const isDia = (c) => c.degree != null && c.degree >= 0;
  const sev = (c) => (isDia(c) && diatonic4[c.degree]) ? diatonic4[c.degree] : c;
  const tonicizable = (c) => isDia(c) && c.degree !== 0 && c.quality !== 'dim' && c.quality !== 'aug';
  const minorTarget = (c) => c.quality === 'min' || c.quality === 'min7';

  // 1 · Séptimas
  variants.push({
    name: 'Séptimas (jazz suave)',
    desc: 'Cada acorde diatónico pasa a su séptima. Mismo largo, más color.',
    chords: progression.map(sev),
  });

  // 2 · Dominantes secundarias
  {
    const out = [];
    progression.forEach((c) => {
      if (tonicizable(c)) out.push(buildSecondaryDominant(c.root.name, 'V7/' + romanBase(c.roman)));
      out.push(sev(c));
    });
    variants.push({ name: 'Dominantes secundarias', desc: 'Inserta V7/x para tonicizar cada acorde.', chords: out });
  }

  // 3 · Sustitución tritonal
  {
    const out = [];
    progression.forEach((c) => {
      if (tonicizable(c)) out.push(buildTritoneSub(c.root.name, 'subV7/' + romanBase(c.roman)));
      out.push(sev(c));
    });
    variants.push({ name: 'Sustitución tritonal', desc: 'Aproximación cromática descendente (subV7/x → x).', chords: out });
  }

  // 4 · ii–V relacionados
  {
    const out = [];
    progression.forEach((c) => {
      if (tonicizable(c)) {
        const mt = minorTarget(c);
        out.push(buildRelatedTwo(c.root.name, mt, (mt ? 'iiø7/' : 'ii7/') + romanBase(c.roman)));
        out.push(buildSecondaryDominant(c.root.name, 'V7/' + romanBase(c.roman)));
      }
      out.push(sev(c));
    });
    variants.push({ name: 'ii–V (jazz)', desc: 'Inserta el ii–V relacionado antes de cada objetivo.', chords: out });
  }

  // 5 · Color modal (iv menor + séptimas)
  if (scaleNotes.length === 7) {
    const iv = buildMinorSubdominant(scaleNotes);
    const chords = progression.map((c) => (c.degree === 3 && c.quality === 'maj') ? iv : sev(c));
    variants.push({ name: 'Color modal', desc: 'Subdominante menor (iv): un giro melancólico tipo «cinemático».', chords });
  }

  // 6 · Disminuidos de paso
  {
    const out = [];
    for (let i = 0; i < progression.length; i++) {
      out.push(sev(progression[i]));
      const a = progression[i], b = progression[i + 1];
      if (b && a.root && b.root) {
        const up = ((b.root.pc - a.root.pc) + 12) % 12;
        if (up === 2) {
          const dr = sharpenRoot(a.root.name);
          out.push(buildPassingDim(dr, '#' + romanBase(a.roman) + '°7'));
        }
      }
    }
    variants.push({ name: 'Disminuidos de paso', desc: 'Conecta grados a distancia de tono con un disminuido cromático.', chords: out });
  }

  // 7 · Sustitución diatónica (igual función, otro color)
  if (scaleNotes.length === 7) {
    const chords = progression.map((c) => {
      const t = isDia(c) ? DIATONIC_SUB[c.degree] : null;
      return (t != null && diatonic4[t]) ? diatonic4[t] : sev(c);
    });
    variants.push({ name: 'Sustitución diatónica', desc: 'Sustituye por acordes diatónicos de igual función (relativos/mediantes).', chords });
  }

  // 8 · Backdoor (♭VII7 → I)
  if (scaleNotes.length === 7) {
    const out = []; let inserted = false;
    const tonicName = scaleNotes[0].name;
    progression.forEach((c, i) => {
      if (i > 0 && c.degree === 0) { out.push(buildBackdoorDominant(tonicName)); inserted = true; }
      out.push(sev(c));
    });
    if (inserted) variants.push({ name: 'Backdoor (♭VII7)', desc: 'Inserta ♭VII7 antes del I: el giro «backdoor» del soul y el cine.', chords: out });
  }

  // Descarta variantes idénticas al original.
  const sig = (cs) => cs.map((c) => c.symbol).join('|');
  const original = sig(progression);
  return variants.filter((v) => v.chords.length && sig(v.chords) !== original);
}
