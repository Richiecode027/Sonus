/* ============================================================================
 * Sonus · app.js · Orquestador principal.
 * Estado, datos derivados, controles, reproducción, exportación y PWA.
 * ==========================================================================*/

import * as T from './theory.js';
import { AudioEngine, Transport, INSTRUMENTS } from './audio.js';
import { Piano } from './ui/piano.js';
import { CircleOfFifths } from './ui/circle.js';
import { ChordsPanel } from './ui/chords.js';
import { Sequencer } from './ui/sequencer.js';
import { Notation } from './ui/notation.js';
import { MidiInput } from './ui/midiInput.js';
import { SectionsBar } from './ui/sections.js';
import { downloadMidi } from './midi.js';
import { buildSongLayout, chordEvents } from './song.js';
import { generateMelody } from './generator.js';
import { reharmonize } from './reharmonize.js';
import { renderWavFromEvents } from './recorder.js';
import * as Cloud from './cloud.js';
import { buildMusicXML } from './musicxml.js';
import { triggerDownload } from './midi.js';
import * as Store from './storage.js';

class App {
  constructor() {
    this.engine = new AudioEngine();
    this.transport = new Transport(this.engine);
    this.state = Store.loadProject() || Store.defaultProject();
    this._saveTimer = null;
    this._installEvent = null;
  }

  /* ---------------------------------------------------------------- init */
  init() {
    this._buildSelects();
    this._bindTopbar();
    this._bindTabs();
    this._bindProject();

    this.circle = new CircleOfFifths(document.getElementById('circle'), this);
    this.piano = new Piano(document.getElementById('piano'), this, { startMidi: 48, endMidi: 84 });
    this.chords = new ChordsPanel(document.getElementById('chordsPanel'), this);
    this.sequencer = new Sequencer(document.getElementById('sequencer'), this);
    this.notation = new Notation(document.getElementById('notation'), this);
    this.midi = new MidiInput(this);
    this.sections = new SectionsBar(document.getElementById('sectionsBar'), this);

    this._ensureSections();

    this.transport.bpm = this.state.bpm;
    this.transport.swing = this.state.swing;
    this.engine.masterVol = this.state.volume;
    this.engine.reverbWet = this.state.reverb;
    this.engine.setInstrument(this.state.instrument);

    this._bindPlayback();
    this._bindCompose();
    this._bindMidi();
    this._bindMenu();
    this._syncControls();
    this.recompute();
    this.refreshAll();
    this._bindCloud();
    this._registerSW();
    this._bindInstall();
    window.addEventListener('resize', () => { if (this._scoreVisible()) this.notation.render(); });

    // Si llega un enlace compartido (?id=…), abre esa sesión de la nube.
    const sharedId = new URLSearchParams(location.search).get('id');
    if (sharedId) this.openSession(sharedId);
    else this._renderCloudInfo();
  }

  _scoreVisible() {
    const v = document.getElementById('view-score');
    return v && v.classList.contains('active');
  }

  /* ----------------------------------------------------- secciones (estructura) */
  _uid() { return 's' + Math.random().toString(36).slice(2, 8); }
  currentSection() { return this.state.sections[this.state.activeSection] || this.state.sections[0]; }

  _wireActiveSection() {
    const s = this.currentSection();
    this.state.progression = s.progression;   // referencias vivas a la sección activa
    this.state.sequence = s.sequence;
  }
  _setProgression(arr) { this.currentSection().progression = arr; this.state.progression = arr; }
  _setSequence(obj) { this.currentSection().sequence = obj; this.state.sequence = obj; }

  _ensureSections() {
    const st = this.state;
    if (!Array.isArray(st.sections) || !st.sections.length) {
      const prog = Array.isArray(st.progression) ? st.progression : [];
      const seq = (st.sequence && typeof st.sequence === 'object') ? st.sequence : {};
      st.sections = (prog.length || Object.keys(seq).length)
        ? [{ id: this._uid(), name: 'Sección 1', progression: prog, sequence: seq }]
        : [
            { id: this._uid(), name: 'Intro', progression: [], sequence: {} },
            { id: this._uid(), name: 'Verso 1', progression: [], sequence: {} },
            { id: this._uid(), name: 'Coro', progression: [], sequence: {} },
          ];
      st.activeSection = 0;
    }
    st.sections.forEach((s) => {
      if (!Array.isArray(s.progression)) s.progression = [];
      if (!s.sequence || typeof s.sequence !== 'object') s.sequence = {};
      if (!s.id) s.id = this._uid();
      if (!s.name) s.name = 'Sección';
    });
    if (st.activeSection == null || st.activeSection < 0 || st.activeSection >= st.sections.length) st.activeSection = 0;
    this._wireActiveSection();
  }

  setActiveSection(i) {
    if (i < 0 || i >= this.state.sections.length || i === this.state.activeSection) return;
    this.stopPlayback();
    this.state.activeSection = i;
    this._wireActiveSection();
    this.sections.render();
    this.chords.update();
    this.sequencer.render();
    if (this._scoreVisible()) this.notation.render();
    this.touch();
  }

  addSection() {
    this.state.sections.push({ id: this._uid(), name: 'Sección ' + (this.state.sections.length + 1), progression: [], sequence: {} });
    this.state.activeSection = this.state.sections.length - 1;
    this._wireActiveSection();
    this.sections.render(); this.chords.update(); this.sequencer.render();
    if (this._scoreVisible()) this.notation.render();
    this.touch();
  }

  renameSection(i) {
    const s = this.state.sections[i]; if (!s) return;
    const name = prompt('Nombre de la sección:', s.name);
    if (name != null && name.trim()) { s.name = name.trim(); this.sections.render(); this.touch(); }
  }

  deleteSection(i) {
    const secs = this.state.sections;
    if (secs.length <= 1) { this._toast('Debe quedar al menos una sección'); return; }
    const s = secs[i];
    if ((s.progression.length || Object.keys(s.sequence).length) && !confirm(`¿Eliminar la sección «${s.name}»?`)) return;
    secs.splice(i, 1);
    if (this.state.activeSection >= secs.length) this.state.activeSection = secs.length - 1;
    else if (this.state.activeSection > i) this.state.activeSection--;
    this.stopPlayback();
    this._wireActiveSection();
    this.sections.render(); this.chords.update(); this.sequencer.render();
    if (this._scoreVisible()) this.notation.render();
    this.touch();
  }

  moveSection(i, dir) {
    const secs = this.state.sections;
    const j = i + dir;
    if (j < 0 || j >= secs.length) return;
    [secs[i], secs[j]] = [secs[j], secs[i]];
    if (this.state.activeSection === i) this.state.activeSection = j;
    else if (this.state.activeSection === j) this.state.activeSection = i;
    this._wireActiveSection();
    this.sections.render(); this.touch();
  }

  /* Estado serializable (sin los buffers de la sección activa). */
  serialize() {
    const { progression, sequence, ...rest } = this.state;
    return rest;
  }

  /* ------------------------------------------------ arreglo (canción completa) */
  _voiceSection(sec) {
    if (!sec.progression.length) return [];
    const vl = this.state.voiceLeading
      ? T.voiceLeadProgression(sec.progression, { register: 4 })
      : sec.progression.map((c) => c.midis);
    return vl.map((m, i) => m.map((x) => x + 12 * (sec.progression[i].octaveShift || 0)));
  }

  buildArrangement() {
    const barSteps = this.transport.stepsPerBeat * 4;
    const seqSteps = this.state.seqSteps;
    const barChords = {};
    const melodyByStep = {};
    const marks = [];
    let globalBar = 0;
    for (const sec of this.state.sections) {
      const voiced = this._voiceSection(sec);
      const hasMelody = Object.keys(sec.sequence).length > 0;
      if (!voiced.length && !hasMelody) continue;      // omite secciones vacías
      const sbars = Math.max(voiced.length, Math.ceil(seqSteps / barSteps), 1);
      marks.push({ name: sec.name, startBar: globalBar });
      for (let b = 0; b < sbars; b++) if (voiced.length) barChords[globalBar + b] = voiced[b % voiced.length];
      if (hasMelody) {
        const secMel = {};
        for (const k in sec.sequence) { const [m, c] = k.split(':').map(Number); (secMel[c] = secMel[c] || []).push(m); }
        const startStep = globalBar * barSteps;
        const secSteps = sbars * barSteps;
        for (let ls = 0; ls < secSteps; ls++) { const col = ls % seqSteps; if (secMel[col]) melodyByStep[startStep + ls] = secMel[col]; }
      }
      globalBar += sbars;
    }
    return { barChords, melodyByStep, totalSteps: globalBar * barSteps, barSteps, marks };
  }

  _sectionOfBar(bar, marks) {
    let idx = 0;
    for (let i = 0; i < marks.length; i++) { if (bar >= marks[i].startBar) idx = i; else break; }
    return idx;
  }

  buildArrangementEvents(loops = 1) {
    const arr = this.buildArrangement();
    const stepDur = 60 / this.state.bpm / this.transport.stepsPerBeat;
    const barDur = arr.barSteps * stepDur;
    const events = [];
    const N = loops * arr.totalSteps;
    for (let s = 0; s < N; s++) {
      const within = s % arr.totalSteps;
      const t = s * stepDur;
      if (within % arr.barSteps === 0) {
        const ch = arr.barChords[within / arr.barSteps];
        if (ch) chordEvents(ch, t, barDur, stepDur, this.state.chordStyle, 0.5).forEach((e) => events.push(e));
      }
      const notes = arr.melodyByStep[within];
      if (notes) notes.forEach((m) => events.push({ midi: m, when: t, dur: stepDur * 1.7, vel: 0.9 }));
    }
    return { events, duration: N * stepDur + 2.8 };
  }

  /** Reproduce la canción entera (todas las secciones encadenadas). */
  playArrangement() {
    this.stopPlayback();
    const arr = this.buildArrangement();
    if (!arr.totalSteps) { this._toast('Añade acordes o melodía a alguna sección'); return; }
    const style = this.state.chordStyle;
    this.engine.init().then(() => {
      this.transport.totalSteps = arr.totalSteps;
      this.transport.loop = true;
      const barDur = arr.barSteps * this.transport.stepDur;
      this.transport.onStep = (step, time) => {
        this._metroAt(step, time);
        if (step % arr.barSteps === 0) {
          const ch = arr.barChords[step / arr.barSteps];
          if (ch) chordEvents(ch, time, barDur, this.transport.stepDur, style, 0.5).forEach((e) => this.engine.playNote(e.midi, e.dur, e.when, e.vel));
        }
        const notes = arr.melodyByStep[step];
        if (notes) notes.forEach((m) => this.engine.playNote(m, this.transport.stepDur * 1.7, time, 0.9));
      };
      this.transport.onTick = (step) => {
        if (step < 0) { this.sections.setPlaying(-1); return; }
        this.sections.setPlaying(this._sectionOfBar(Math.floor(step / arr.barSteps), arr.marks));
      };
      this.transport.start();
      this._setPlayUI(true);
    });
  }

  /* --------------------------------------------------------- derived data */
  recompute() {
    this.scaleNotes = T.buildScale(this.state.root, this.state.scale);
    this.scalePcSet = new Set(this.scaleNotes.map((n) => n.pc));
    this.rootPc = T.parseNote(this.state.root).pc;
    this.scaleDef = T.SCALES[this.state.scale];
    this.family = this.scaleDef.family === 'menor' ? 'menor' : 'mayor';
  }

  getDiatonic(size = 3) { return T.diatonicChords(this.scaleNotes, this.rootPc, { size }); }
  getBorrowed(size = 3) {
    if (this.scaleNotes.length !== 7) return [];
    return T.borrowedChords(this.state.root, this.state.scale, { size });
  }
  getFunctional() { return T.functionalChords(this.state.root, this.state.scale); }

  detectKey() {
    const w = new Array(12).fill(0);
    for (const key in this.state.sequence) { const m = +key.split(':')[0]; w[((m % 12) + 12) % 12] += 1; }
    this.state.progression.forEach((c) => { w[c.root.pc] += 0.6; c.notes.forEach((n) => { w[n.pc] += 0.25; }); });
    if (w.every((x) => x === 0)) return [];
    return T.detectKey(w);
  }

  attachMidis(chord) {
    const shift = chord.octaveShift || 0;
    return { ...chord, octaveShift: shift, midis: T.chordToMidi(chord).map((m) => m + 12 * shift), rootName: chord.root.name };
  }

  setChordOctave(i, delta) {
    const c = this.state.progression[i];
    if (!c) return;
    c.octaveShift = Math.max(-2, Math.min(2, (c.octaveShift || 0) + delta));
    c.midis = T.chordToMidi(c).map((m) => m + 12 * c.octaveShift);
    this.previewChord(c);
    this.chords.renderProgression();
    this.touch();
  }

  getProgressionPresets() {
    if (this.scaleNotes.length !== 7) return [];
    return T.PROGRESSIONS[this.family] || [];
  }

  suggestNextDegrees() {
    const prog = this.state.progression;
    if (!prog.length) return [];
    const last = prog[prog.length - 1];
    if (last.source !== 'diatónico' || last.degree == null) return [];
    return T.suggestNext(last.degree, this.family);
  }

  suggestNextChords() {
    const dia = this.getDiatonic(3);
    return this.suggestNextDegrees().map((d) => dia[d]).filter(Boolean);
  }

  /* --------------------------------------------------------------- audio */
  playMidi(midi, dur = 0.5) {
    this.engine.init().then(() => this.engine.playNote(midi, dur, null, 0.85));
    if (this.piano) this.piano.flash(midi);
  }

  previewChord(chord) {
    const midis = chord.midis || T.chordToMidi(chord);
    this.engine.init().then(() => this.engine.playChord(midis, 1.1, null, 0.7));
    if (this.piano) midis.forEach((m) => this.piano.flash(m));
  }

  /* ---------------------------------------------------------- progression */
  addToProgression(chord) {
    this.state.progression.push(this.attachMidis(chord));
    this.chords.renderProgression();
    this.sections.render();
    this.touch();
  }
  removeFromProgression(i) {
    this.state.progression.splice(i, 1);
    this.chords.renderProgression();
    this.sections.render();
    this.touch();
  }
  clearProgression() {
    this.stopPlayback();
    this._setProgression([]);
    this.chords.renderProgression();
    this.sections.render();
    this.touch();
  }
  loadProgressionPreset(preset) {
    const dia = this.getDiatonic(preset.seventh ? 4 : 3);
    this._setProgression(preset.degrees.map((d) => this.attachMidis(dia[d % dia.length])));
    this.chords.renderProgression();
    this.sections.render();
    this.touch();
  }

  /* ------------------------------------------------------- rearmonización */
  getReharmonizations() {
    return reharmonize(this.state.progression, {
      rootName: this.state.root, scaleKey: this.state.scale, scaleNotes: this.scaleNotes,
      tonicPc: this.rootPc, family: this.family, diatonic4: this.getDiatonic(4),
    });
  }

  auditionProgression(chords) {
    this.stopPlayback();
    this.engine.init().then(() => {
      const voiced = this.state.voiceLeading
        ? T.voiceLeadProgression(chords) : chords.map((c) => T.chordToMidi(c));
      const dur = 0.72;
      let t = this.engine.now() + 0.05;
      voiced.forEach((m) => { this.engine.playChord(m, dur * 0.95, t, 0.6); t += dur; });
    });
  }

  applyReharmonization(chords) {
    this.stopPlayback();
    this._setProgression(chords.map((c) => this.attachMidis(c)));
    this.chords.renderProgression();
    this.sections.render();
    if (this._scoreVisible()) this.notation.render();
    this.touch();
    this._toast('Progresión rearmonizada ✨');
  }

  /* ------------------------------------------------------------ sequencer */
  setSteps(n) {
    this.state.seqSteps = n;
    this.transport.totalSteps = n;
    this.sequencer.render();
    this.touch();
  }
  shiftOctave(dir) {
    const [lo, hi] = this.state.octaveRange;
    const nlo = Math.max(1, Math.min(7, lo + dir));
    const nhi = Math.max(2, Math.min(8, hi + dir));
    this.state.octaveRange = [nlo, nhi];
    this._applySeqRange();
    this.sequencer.render();
    this.touch();
  }
  clearSequence() { this._setSequence({}); this.sequencer.render(); this.touch(); }

  _applySeqRange() {
    const [lo, hi] = this.state.octaveRange;
    this.sequencer.setRange(12 * (lo + 1), 12 * (hi + 1) + 11);
  }

  /* -------------------------------------------------------------- playback */
  _melodyByCol() {
    const map = {};
    for (const key in this.state.sequence) {
      const [m, c] = key.split(':').map(Number);
      (map[c] = map[c] || []).push(m);
    }
    return map;
  }

  getVoicedProgression() {
    const prog = this.state.progression;
    if (!prog.length) return [];
    if (this.state.voiceLeading) {
      const voiced = T.voiceLeadProgression(prog, { register: 4 });
      return voiced.map((m, i) => m.map((x) => x + 12 * (prog[i].octaveShift || 0)));
    }
    return prog.map((c) => c.midis);
  }

  _metroAt(step, time) {
    if (!this.state.metronome) return;
    const spb = this.transport.stepsPerBeat;
    if (step % spb === 0) this.engine.click(time, step % (spb * 4) === 0);
  }

  playProgression() {
    const prog = this.state.progression;
    if (!prog.length) return;
    this.stopPlayback();
    const voiced = this.getVoicedProgression();
    const style = this.state.chordStyle;
    this.engine.init().then(() => {
      const barSteps = this.transport.stepsPerBeat * 4;
      this.transport.totalSteps = prog.length * barSteps;
      this.transport.loop = true;
      const barDur = barSteps * this.transport.stepDur;
      this.transport.onStep = (step, time) => {
        this._metroAt(step, time);
        if (step % barSteps === 0) {
          const bar = step / barSteps;
          chordEvents(voiced[bar % voiced.length], time, barDur, this.transport.stepDur, style, 0.62)
            .forEach((e) => this.engine.playNote(e.midi, e.dur, e.when, e.vel));
        }
      };
      this.transport.onTick = (step) => this.chords.setPlayhead(step < 0 ? -1 : Math.floor(step / barSteps) % prog.length);
      this.transport.start();
      this._setPlayUI(true);
    });
  }

  playSection() {
    this.stopPlayback();
    const seqSteps = this.state.seqSteps;
    const melody = this._melodyByCol();
    const voiced = this.getVoicedProgression();
    const style = this.state.chordStyle;
    this.engine.init().then(() => {
      const { barSteps, totalSteps } = buildSongLayout(voiced.length, seqSteps, this.transport.stepsPerBeat);
      this.transport.totalSteps = totalSteps;
      this.transport.loop = true;
      const barDur = barSteps * this.transport.stepDur;
      this.transport.onStep = (step, time) => {
        this._metroAt(step, time);
        if (voiced.length && step % barSteps === 0) {
          const bar = step / barSteps;
          chordEvents(voiced[bar % voiced.length], time, barDur, this.transport.stepDur, style, 0.5)
            .forEach((e) => this.engine.playNote(e.midi, e.dur, e.when, e.vel));
        }
        const notes = melody[step % seqSteps];
        if (notes) notes.forEach((m) => this.engine.playNote(m, this.transport.stepDur * 1.7, time, 0.9));
      };
      this.transport.onTick = (step) => {
        this.sequencer.setPlayhead(step < 0 ? -1 : step % seqSteps);
        if (voiced.length) this.chords.setPlayhead(step < 0 ? -1 : Math.floor(step / barSteps) % voiced.length);
      };
      this.transport.start();
      this._setPlayUI(true);
    });
  }

  /* ----------------------------------------------------- generar / grabar */
  generateMelodyForSong() {
    const seqSteps = this.state.seqSteps;
    const [lo, hi] = this.state.octaveRange;
    const prog = this.state.progression;
    const { songBars } = buildSongLayout(prog.length, seqSteps, this.transport.stepsPerBeat);
    const chords = prog.length ? prog : [];
    const seq = generateMelody({
      chords, steps: seqSteps, scalePcs: this.scalePcSet,
      low: 12 * (lo + 1), high: 12 * (hi + 1) + 11, stepsPerBeat: this.transport.stepsPerBeat,
    });
    this._setSequence(seq);
    this.sequencer.render();
    if (this._scoreVisible()) this.notation.render();
    this.touch();
    this._toast('Melodía generada ✨');
  }

  recordNote(midi, col) {
    this.state.sequence[midi + ':' + col] = true;
    this.sequencer.render();
    this.touch();
  }

  /* ------------------------------------------------------------- exportar */
  async exportWav() {
    const { events, duration } = this.buildArrangementEvents(1);
    if (!events.length) { this._toast('Nada que exportar todavía'); return; }
    this._toast('Renderizando WAV…');
    try {
      await renderWavFromEvents(events, {
        duration, instrumentKey: this.state.instrument, reverbWet: this.state.reverb, volume: this.state.volume,
        filename: (this.state.name || 'sonus').replace(/[^\w\-]+/g, '_'),
      });
      this._toast('WAV exportado 🔊');
    } catch (e) { this._toast('Error al renderizar: ' + e.message); }
  }

  exportMusicXML() {
    const prog = this.state.progression;
    const melody = this._melodyByCol();
    const { songBars } = buildSongLayout(prog.length, this.state.seqSteps, this.transport.stepsPerBeat);
    const xml = buildMusicXML({
      title: this.state.name, bpm: this.state.bpm, rootName: this.state.root,
      scaleNotes: this.scaleNotes, progression: prog, melodyByCol: melody,
      seqSteps: this.state.seqSteps, songBars,
    });
    triggerDownload(new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' }),
      (this.state.name || 'sonus').replace(/[^\w\-]+/g, '_') + '.musicxml');
    this._toast('MusicXML exportado 🎼');
  }

  stopPlayback() {
    this.transport.stop();
    this._setPlayUI(false);
    if (this.sequencer) this.sequencer.setPlayhead(-1);
    if (this.chords) this.chords.setPlayhead(-1);
  }

  _setPlayUI(playing) {
    const btn = document.getElementById('playBtn');
    if (btn) { btn.classList.toggle('playing', playing); btn.textContent = playing ? '⏸' : '▶'; }
  }

  /* --------------------------------------------------------------- setKey */
  setKey(pc, scaleKey, rootName) {
    this.state.root = rootName || T.ROOT_CHOICES.find((r) => T.parseNote(r).pc === pc) || 'C';
    if (scaleKey) this.state.scale = scaleKey;
    this.stopPlayback();
    this.recompute();
    this.refreshAll();
    this._syncControls();
    this.touch();
  }

  /* ------------------------------------------------------------- refresh */
  refreshAll() {
    this._applySeqRange();
    this.sections.render();
    this.circle.setActive(this.state.root, this.family, this.state.root);
    this.piano.setScale(this.scalePcSet, this.rootPc);
    this.chords.update();
    this.sequencer.render();
    this.renderInfo();
    if (this._scoreVisible()) this.notation.render();
  }

  renderInfo() {
    const el = document.getElementById('scaleInfo');
    if (!el) return;
    const notes = this.scaleNotes;
    const intervals = this.scaleDef.steps;
    const chips = notes.map((n, i) =>
      `<span class="note-chip ${n.pc === this.rootPc ? 'root' : ''}">${n.name}</span>`).join('');
    el.innerHTML = `
      <div class="info-key">${this.state.root} ${this.scaleDef.name}</div>
      <div class="note-row">${chips}</div>
      <div class="info-mood">${this.scaleDef.mood}</div>
      <div class="info-formula">Fórmula (semitonos): ${intervals.join(' · ')}</div>
    `;
  }

  /* --------------------------------------------------------------- UI build */
  _buildSelects() {
    const rootSel = document.getElementById('rootSel');
    T.ROOT_CHOICES.forEach((r) => {
      const o = document.createElement('option'); o.value = r; o.textContent = r; rootSel.appendChild(o);
    });

    const scaleSel = document.getElementById('scaleSel');
    const groups = { 'Modos griegos': T.MODE_ORDER, 'Menores': ['harmonicMinor', 'melodicMinor'], 'Otras': ['majorPent', 'minorPent', 'blues', 'wholeTone', 'diminished', 'chromatic'] };
    for (const [label, keys] of Object.entries(groups)) {
      const og = document.createElement('optgroup'); og.label = label;
      keys.forEach((k) => { const o = document.createElement('option'); o.value = k; o.textContent = T.SCALES[k].name; og.appendChild(o); });
      scaleSel.appendChild(og);
    }

    const instSel = document.getElementById('instSel');
    for (const [k, v] of Object.entries(INSTRUMENTS)) {
      const o = document.createElement('option'); o.value = k; o.textContent = v.name; instSel.appendChild(o);
    }
  }

  _syncControls() {
    document.getElementById('rootSel').value = this.state.root;
    document.getElementById('scaleSel').value = this.state.scale;
    document.getElementById('instSel').value = this.state.instrument;
    document.getElementById('bpm').value = this.state.bpm;
    document.getElementById('bpmVal').textContent = this.state.bpm;
    document.getElementById('vol').value = this.state.volume;
    document.getElementById('rev').value = this.state.reverb;
    const nameInput = document.getElementById('projName');
    if (nameInput) nameInput.value = this.state.name;

    const styleSel = document.getElementById('styleSel');
    if (styleSel) styleSel.value = this.state.chordStyle;
    const swing = document.getElementById('swing');
    if (swing) swing.value = this.state.swing;
    const metro = document.getElementById('metroBtn');
    if (metro) metro.classList.toggle('on', this.state.metronome);
    const vl = document.getElementById('voiceLeadBtn');
    if (vl) vl.classList.toggle('on', this.state.voiceLeading);
    const stepSel = document.getElementById('stepSel');
    if (stepSel) stepSel.querySelectorAll('button').forEach((b) => b.classList.toggle('active', +b.dataset.v === this.state.seqSteps));
  }

  _bindTopbar() {
    document.getElementById('rootSel').addEventListener('change', (e) => this.setKey(null, null, e.target.value));
    document.getElementById('scaleSel').addEventListener('change', (e) => this.setKey(null, e.target.value, this.state.root));
    document.getElementById('playBtn').addEventListener('click', () => {
      if (this.transport.playing) this.stopPlayback(); else this.playArrangement();
    });
    document.getElementById('bpm').addEventListener('input', (e) => {
      this.state.bpm = +e.target.value; this.transport.bpm = +e.target.value;
      document.getElementById('bpmVal').textContent = e.target.value; this.touch();
    });
    document.getElementById('instSel').addEventListener('change', (e) => { this.state.instrument = e.target.value; this.engine.setInstrument(e.target.value); this.touch(); });
    document.getElementById('vol').addEventListener('input', (e) => { this.state.volume = +e.target.value; this.engine.setVolume(+e.target.value); this.touch(); });
    document.getElementById('rev').addEventListener('input', (e) => { this.state.reverb = +e.target.value; this.engine.setReverb(+e.target.value); this.touch(); });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !/input|textarea|select/i.test(e.target.tagName)) {
        e.preventDefault();
        if (this.transport.playing) this.stopPlayback(); else this.playArrangement();
      }
    });
  }

  _bindTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach((tab) => tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + tab.dataset.view));
      if (tab.dataset.view === 'score') this.notation.render();
    }));
  }

  _bindPlayback() {
    const styleSel = document.getElementById('styleSel');
    if (styleSel) styleSel.addEventListener('change', (e) => { this.state.chordStyle = e.target.value; this.touch(); });
    const metro = document.getElementById('metroBtn');
    if (metro) metro.addEventListener('click', () => {
      this.state.metronome = !this.state.metronome;
      metro.classList.toggle('on', this.state.metronome); this.touch();
    });
    const swing = document.getElementById('swing');
    if (swing) swing.addEventListener('input', (e) => { this.state.swing = +e.target.value; this.transport.swing = +e.target.value; this.touch(); });
    const vl = document.getElementById('voiceLeadBtn');
    if (vl) vl.addEventListener('click', () => {
      this.state.voiceLeading = !this.state.voiceLeading;
      vl.classList.toggle('on', this.state.voiceLeading); this.touch();
    });
  }

  _bindCompose() {
    const gen = document.getElementById('genBtn');
    if (gen) gen.addEventListener('click', () => this.generateMelodyForSong());
    const wav = document.getElementById('wavBtn');
    if (wav) wav.addEventListener('click', () => this.exportWav());
    const xml = document.getElementById('xmlBtn');
    if (xml) xml.addEventListener('click', () => this.exportMusicXML());
    const printBtn = document.getElementById('printBtn');
    if (printBtn) printBtn.addEventListener('click', () => { this.notation.render(); window.print(); });
  }

  _bindMidi() {
    const connect = document.getElementById('midiConnect');
    const rec = document.getElementById('midiRec');
    const status = document.getElementById('midiStatus');
    this.midi.onStatus = (text, connected) => {
      if (status) { status.textContent = text; status.classList.toggle('connected', connected); }
    };
    if (connect) connect.addEventListener('click', async () => {
      const ok = await this.midi.enable();
      if (ok) { connect.textContent = 'MIDI activo'; connect.classList.add('on'); if (rec) rec.disabled = false; }
    });
    if (rec) rec.addEventListener('click', () => {
      const on = !this.midi.recording;
      this.midi.setRecording(on);
      rec.classList.toggle('on', on);
      rec.textContent = on ? '● Grabando' : '● Rec MIDI';
      if (on && !this.transport.playing) this.playSection();
    });
  }

  _bindProject() {
    document.getElementById('projName').addEventListener('input', (e) => { this.state.name = e.target.value; this.touch(); });
    document.getElementById('saveBtn').addEventListener('click', () => { Store.saveProject(this.serialize()); this._toast('Proyecto guardado'); });
    document.getElementById('midiBtn').addEventListener('click', () => this.exportMidi());
    document.getElementById('jsonBtn').addEventListener('click', () => Store.exportJSON(this.serialize()));
    document.getElementById('newBtn').addEventListener('click', () => {
      if (!confirm('¿Empezar un proyecto nuevo? Se perderán los cambios sin guardar.')) return;
      this.state = Store.defaultProject();
      this.stopPlayback();
      this.transport.bpm = this.state.bpm;
      this._ensureSections();
      this.recompute(); this._syncControls(); this.refreshAll(); this.touch();
    });
    const importFile = document.getElementById('importFile');
    document.getElementById('importBtn').addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try {
        this.state = await Store.importJSON(file);
        this.stopPlayback(); this.transport.bpm = this.state.bpm;
        this.engine.setInstrument(this.state.instrument);
        this._ensureSections();
        this.recompute(); this._syncControls(); this.refreshAll(); this.touch();
        this._toast('Proyecto importado');
      } catch { this._toast('Archivo inválido'); }
      e.target.value = '';
    });
  }

  exportMidi() {
    const arr = this.buildArrangement();
    const beatPerStep = 1 / this.transport.stepsPerBeat;
    const chordNotes = [], melNotes = [];
    for (const bar in arr.barChords) arr.barChords[bar].forEach((m) => chordNotes.push({ midi: m, start: +bar * 4, duration: 3.9, velocity: 0.7 }));
    for (const step in arr.melodyByStep) arr.melodyByStep[step].forEach((m) => melNotes.push({ midi: m, start: +step * beatPerStep, duration: beatPerStep * 1.6, velocity: 0.9 }));
    const tracks = [];
    if (chordNotes.length) tracks.push({ name: 'Acordes', channel: 0, notes: chordNotes });
    if (melNotes.length) tracks.push({ name: 'Melodía', channel: 1, notes: melNotes });
    if (!tracks.length) { this._toast('Nada que exportar todavía'); return; }
    downloadMidi({ bpm: this.state.bpm, tracks }, (this.state.name || 'sonus').replace(/[^\w\-]+/g, '_') + '.mid');
    this._toast('MIDI exportado');
  }

  /* ----------------------------------------------------------------- misc */
  touch() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => Store.saveProject(this.serialize()), 600);
  }

  _toast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  _registerSW() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
    }
  }

  _bindMenu() {
    const toggle = document.getElementById('menuToggle');
    const header = document.querySelector('.topbar');
    if (!toggle || !header) return;
    toggle.addEventListener('click', () => {
      const collapsed = header.classList.toggle('collapsed');
      toggle.setAttribute('aria-expanded', String(!collapsed));
    });
  }

  /* ------------------------------------------------------------- nube */
  _tokens() { try { return JSON.parse(localStorage.getItem('sonus.tokens') || '{}'); } catch { return {}; } }
  _getToken(id) { return this._tokens()[id]; }
  _saveToken(id, token) { const t = this._tokens(); t[id] = token; localStorage.setItem('sonus.tokens', JSON.stringify(t)); }
  _setUrlId(id) { try { history.replaceState(null, '', location.pathname + '?id=' + id); } catch {} }

  _bindCloud() {
    const save = document.getElementById('cloudSaveBtn');
    const share = document.getElementById('cloudShareBtn');
    const open = document.getElementById('cloudOpenBtn');
    if (save) save.addEventListener('click', () => this.saveToCloud());
    if (share) share.addEventListener('click', () => this.shareLink());
    if (open) open.addEventListener('click', () => this.openGallery());
  }

  async saveToCloud() {
    this._toast('Guardando en la nube…');
    try {
      const project = this.serialize();
      const id = this.state.cloudId;
      const token = id ? this._getToken(id) : null;
      if (id && token) {
        await Cloud.updateSession(id, token, project);
        this._toast('Actualizado en la nube ☁');
      } else {
        const res = await Cloud.createSession(project);
        this.state.cloudId = res.id;
        this._saveToken(res.id, res.editToken);
        this._setUrlId(res.id);
        this.touch();
        this._toast('Publicado ☁ — enlace listo para compartir');
      }
      this._renderCloudInfo();
    } catch (e) { this._toast('Error nube: ' + e.message); }
  }

  async openSession(id) {
    this._toast('Abriendo sesión…');
    try {
      const project = await Cloud.getSession(id);
      this.state = { ...Store.defaultProject(), ...project };
      this.state.cloudId = id;
      this.stopPlayback();
      this.transport.bpm = this.state.bpm;
      this.transport.swing = this.state.swing || 0;
      this.engine.setInstrument(this.state.instrument);
      this.engine.setVolume(this.state.volume);
      this.engine.setReverb(this.state.reverb);
      this._ensureSections();
      this.recompute();
      this._syncControls();
      this.refreshAll();
      this._setUrlId(id);
      this._renderCloudInfo();
      Store.saveProject(this.serialize());
      this._toast('Sesión abierta ☁');
    } catch (e) { this._toast('No se pudo abrir: ' + e.message); }
  }

  async openGallery() {
    const box = document.getElementById('cloudList');
    if (!box) return;
    box.innerHTML = '<div class="hint">Cargando sesiones…</div>';
    try {
      const sessions = await Cloud.listSessions();
      if (!sessions.length) { box.innerHTML = '<div class="hint">Aún no hay sesiones publicadas. ¡Publica la tuya!</div>'; return; }
      box.innerHTML = '';
      sessions.forEach((s) => {
        const el = document.createElement('button');
        el.className = 'cloud-item';
        const when = s.updated ? new Date(s.updated).toLocaleString() : '';
        el.innerHTML = `<b>${this._esc(s.title)}</b><span>${when}</span>`;
        el.addEventListener('click', () => this.openSession(s.id));
        box.appendChild(el);
      });
    } catch (e) { box.innerHTML = '<div class="hint">Error al cargar: ' + this._esc(e.message) + '</div>'; }
  }

  shareLink() {
    if (!this.state.cloudId) { this._toast('Primero guarda en la nube ☁'); return; }
    const url = location.origin + location.pathname + '?id=' + this.state.cloudId;
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => this._toast('Enlace copiado 🔗'), () => prompt('Copia el enlace:', url));
    else prompt('Copia el enlace:', url);
  }

  _renderCloudInfo() {
    const el = document.getElementById('cloudInfo');
    if (!el) return;
    if (!this.state.cloudId) { el.textContent = 'Esta composición aún no está en la nube.'; return; }
    const owner = !!this._getToken(this.state.cloudId);
    el.innerHTML = `En la nube · id <code>${this._esc(this.state.cloudId)}</code> · ${owner ? 'puedes sobrescribirla' : 'copia de solo lectura (al guardar se crea una nueva)'}`;
  }

  _esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  _bindInstall() {
    const btn = document.getElementById('installBtn');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); this._installEvent = e; if (btn) btn.hidden = false;
    });
    if (btn) btn.addEventListener('click', async () => {
      if (!this._installEvent) return;
      this._installEvent.prompt();
      await this._installEvent.userChoice;
      this._installEvent = null; btn.hidden = true;
    });
  }
}

const app = new App();
window.addEventListener('DOMContentLoaded', () => app.init());
window.sonus = app; // depuración
