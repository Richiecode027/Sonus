/* ============================================================================
 * Sonus · storage.js
 * Persistencia de proyectos en localStorage + import/export JSON.
 * ==========================================================================*/

const KEY = 'sonus.project.v1';

export const defaultProject = () => ({
  version: 1,
  name: 'Proyecto sin título',
  root: 'C',
  scale: 'ionian',
  bpm: 100,
  instrument: 'grand',
  reverb: 0.25,
  volume: 0.8,
  progression: [],          // [{ degree, seventh, source, symbol, roman, midis, name }]
  sequence: {},             // { "midi:col": true } notas del piano roll
  workshop: [],             // [{ id, label, chords:[{roman,symbol,color,midis}] }]
  seqSteps: 16,
  octaveRange: [4, 5],
  voiceLeading: true,       // conducción de voces suave
  chordStyle: 'block',      // 'block' | 'arp' | 'strum'
  metronome: false,
  swing: 0,                 // 0..0.6
  updated: Date.now(),
});

export function saveProject(project) {
  project.updated = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(project)); return true; }
  catch (e) { console.warn('No se pudo guardar', e); return false; }
}

export function loadProject() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return { ...defaultProject(), ...JSON.parse(raw) };
  } catch (e) { return null; }
}

export function clearProject() { localStorage.removeItem(KEY); }

/* ----------------------------------------------------------------------------
 * Biblioteca: varias canciones guardadas en este navegador.
 * --------------------------------------------------------------------------*/
const LIB = 'sonus.library.v1';

export function listSongs() {
  try { return JSON.parse(localStorage.getItem(LIB) || '[]'); } catch { return []; }
}

function writeLib(songs) {
  try { localStorage.setItem(LIB, JSON.stringify(songs)); return true; }
  catch (e) { console.warn('No se pudo guardar la biblioteca', e); return false; }
}

/** Guarda (o actualiza si coincide el id) una canción en la biblioteca. */
export function saveSong(project, id) {
  const songs = listSongs();
  const songId = id || ('s' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  const entry = { id: songId, name: project.name || 'Sin título', updated: Date.now(), data: project };
  const i = songs.findIndex((s) => s.id === songId);
  if (i >= 0) songs[i] = entry; else songs.unshift(entry);
  writeLib(songs);
  return songId;
}

export function getSong(id) {
  const s = listSongs().find((x) => x.id === id);
  return s ? s.data : null;
}

export function deleteSong(id) {
  writeLib(listSongs().filter((s) => s.id !== id));
}

export function exportJSON(project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (project.name || 'sonus').replace(/[^\w\-]+/g, '_') + '.sonus.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function importJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try { resolve({ ...defaultProject(), ...JSON.parse(reader.result) }); }
      catch (e) { reject(e); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
