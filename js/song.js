/* ============================================================================
 * Sonus · song.js
 * Lógica de arreglo compartida entre la reproducción en vivo y el render
 * offline (WAV/MIDI), para que todo suene exactamente igual.
 * Modelo: un acorde por compás; el patrón de melodía se repite bajo la
 * progresión. Estilos de acorde: bloque, arpegio, rasgueo.
 * ==========================================================================*/

export function buildSongLayout(progLen, seqSteps, stepsPerBeat = 4) {
  const barSteps = stepsPerBeat * 4;
  const songBars = Math.max(progLen || 1, Math.ceil(seqSteps / barSteps));
  return { barSteps, songBars, totalSteps: songBars * barSteps };
}

/** Eventos de un acorde según el estilo de reproducción. */
export function chordEvents(midis, start, barDur, stepDur, style = 'block', vel = 0.5) {
  const ev = [];
  if (!midis || !midis.length) return ev;
  if (style === 'arp') {
    const pulses = Math.max(2, Math.round(barDur / (stepDur * 2)));
    for (let p = 0; p < pulses; p++) {
      ev.push({ midi: midis[p % midis.length], when: start + p * stepDur * 2, dur: stepDur * 2 * 1.1, vel });
    }
  } else if (style === 'strum') {
    midis.forEach((m, i) => ev.push({ midi: m, when: start + i * 0.022, dur: barDur * 0.96, vel: vel - i * 0.02 }));
  } else {
    midis.forEach((m, i) => ev.push({ midi: m, when: start, dur: barDur * 0.96, vel: vel - i * 0.02 }));
  }
  return ev;
}

/** Lista completa de eventos del tema para render offline. */
export function buildSongEvents({ voiced = [], melodyByCol = {}, seqSteps = 16, stepsPerBeat = 4, bpm = 100, style = 'block', loops = 2 }) {
  const stepDur = 60 / bpm / stepsPerBeat;
  const { barSteps, totalSteps } = buildSongLayout(voiced.length, seqSteps, stepsPerBeat);
  const barDur = barSteps * stepDur;
  const events = [];
  const N = loops * totalSteps;
  for (let s = 0; s < N; s++) {
    const within = s % totalSteps;
    const t = s * stepDur;
    if (voiced.length && within % barSteps === 0) {
      const bar = within / barSteps;
      chordEvents(voiced[bar % voiced.length], t, barDur, stepDur, style, 0.5).forEach((e) => events.push(e));
    }
    const notes = melodyByCol[within % seqSteps];
    if (notes) notes.forEach((m) => events.push({ midi: m, when: t, dur: stepDur * 1.7, vel: 0.9 }));
  }
  return { events, duration: N * stepDur + 2.8 };
}
