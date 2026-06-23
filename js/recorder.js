/* ============================================================================
 * Sonus · recorder.js
 * Render del tema a WAV de alta calidad con OfflineAudioContext (no en tiempo
 * real: rápido y determinista). Reutiliza el mismo sintetizador y arreglo.
 * ==========================================================================*/

import { buildMasterChain, spawnVoice, INSTRUMENTS } from './audio.js';
import { buildSongEvents } from './song.js';
import { triggerDownload } from './midi.js';

/** Renderiza una lista de eventos {midi, when, dur, vel} a un WAV descargable. */
export async function renderWavFromEvents(events, { duration, instrumentKey, reverbWet = 0.25, volume = 0.8, filename = 'sonus' } = {}) {
  if (!events || !events.length) return false;
  const rate = 44100;
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Offline) throw new Error('OfflineAudioContext no disponible');
  const ctx = new Offline(2, Math.ceil(duration * rate), rate);
  const { master } = buildMasterChain(ctx, { volume, reverbWet });
  const inst = INSTRUMENTS[instrumentKey] || INSTRUMENTS.grand;
  for (const e of events) spawnVoice(ctx, master, inst, e.midi, e.when, e.dur, e.vel);
  const buffer = await ctx.startRendering();
  triggerDownload(new Blob([encodeWav(buffer)], { type: 'audio/wav' }), (filename || 'sonus') + '.wav');
  return true;
}

/** Render a partir de la estructura de canción (compatibilidad). */
export async function renderSongWav(opts) {
  const { events, duration } = buildSongEvents(opts);
  return renderWavFromEvents(events, { duration, ...opts });
}

function encodeWav(buffer) {
  const numCh = buffer.numberOfChannels, len = buffer.length, rate = buffer.sampleRate;
  const blockAlign = numCh * 2;
  const dataLen = len * blockAlign;
  const ab = new ArrayBuffer(44 + dataLen);
  const dv = new DataView(ab);
  let o = 0;
  const ws = (s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o++, s.charCodeAt(i)); };
  ws('RIFF'); dv.setUint32(o, 36 + dataLen, true); o += 4; ws('WAVE');
  ws('fmt '); dv.setUint32(o, 16, true); o += 4;
  dv.setUint16(o, 1, true); o += 2; dv.setUint16(o, numCh, true); o += 2;
  dv.setUint32(o, rate, true); o += 4; dv.setUint32(o, rate * blockAlign, true); o += 4;
  dv.setUint16(o, blockAlign, true); o += 2; dv.setUint16(o, 16, true); o += 2;
  ws('data'); dv.setUint32(o, dataLen, true); o += 4;
  const chans = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, chans[c][i]));
      dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
    }
  }
  return ab;
}
