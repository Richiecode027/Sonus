/* ============================================================================
 * Sonus · midi.js
 * Escritor de Standard MIDI File (SMF formato 1). Convierte un proyecto en un
 * archivo .mid real, descargable y abrible en cualquier DAW.
 * ==========================================================================*/

function vlq(value) {
  // Variable-Length Quantity.
  const bytes = [value & 0x7f];
  value >>= 7;
  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80);
    value >>= 7;
  }
  return bytes;
}

function str(s) { return Array.from(s).map((c) => c.charCodeAt(0)); }

function chunk(id, data) {
  const len = data.length;
  return [...str(id), (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff, ...data];
}

/**
 * @param {object} project
 * @param {number} project.bpm
 * @param {number} [project.ppq=480]
 * @param {Array}  project.tracks  [{ name, channel?, notes:[{midi,start,duration,velocity}] }]
 *                 start/duration en negras (beats).
 * @returns {Uint8Array}
 */
export function buildMidi({ bpm = 100, ppq = 480, tracks = [] }) {
  const headerData = [0x00, 0x01, ((tracks.length + 1) >> 8) & 0xff, (tracks.length + 1) & 0xff, (ppq >> 8) & 0xff, ppq & 0xff];
  const header = chunk('MThd', headerData);

  // Pista 0: tempo / metadatos.
  const mpqn = Math.round(60000000 / bpm);
  let tempoEvents = [];
  tempoEvents.push(...vlq(0), 0xff, 0x51, 0x03, (mpqn >> 16) & 0xff, (mpqn >> 8) & 0xff, mpqn & 0xff);
  tempoEvents.push(...vlq(0), 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08); // 4/4
  const nameBytes = str('Sonus');
  tempoEvents.push(...vlq(0), 0xff, 0x03, ...vlq(nameBytes.length), ...nameBytes);
  tempoEvents.push(...vlq(0), 0xff, 0x2f, 0x00);
  const chunks = [header, chunk('MTrk', tempoEvents)];

  tracks.forEach((track, ti) => {
    const ch = (track.channel ?? ti) & 0x0f;
    const events = [];
    for (const n of track.notes) {
      const startTick = Math.round(n.start * ppq);
      const endTick = Math.round((n.start + n.duration) * ppq);
      const vel = Math.max(1, Math.min(127, Math.round((n.velocity ?? 0.8) * 127)));
      events.push({ tick: startTick, kind: 1, on: true, midi: n.midi, vel });
      events.push({ tick: endTick, kind: 0, on: false, midi: n.midi, vel: 0 });
    }
    // Ordena por tick; los note-off antes que note-on en el mismo instante.
    events.sort((a, b) => a.tick - b.tick || a.kind - b.kind);

    const data = [];
    if (track.name) {
      const tn = str(track.name);
      data.push(...vlq(0), 0xff, 0x03, ...vlq(tn.length), ...tn);
    }
    let last = 0;
    for (const e of events) {
      const delta = e.tick - last;
      last = e.tick;
      data.push(...vlq(delta), (e.on ? 0x90 : 0x80) | ch, e.midi & 0x7f, e.vel & 0x7f);
    }
    data.push(...vlq(0), 0xff, 0x2f, 0x00);
    chunks.push(chunk('MTrk', data));
  });

  return new Uint8Array(chunks.flat());
}

export function downloadMidi(project, filename = 'sonus.mid') {
  const bytes = buildMidi(project);
  const blob = new Blob([bytes], { type: 'audio/midi' });
  triggerDownload(blob, filename);
}

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
