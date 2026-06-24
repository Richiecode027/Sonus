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
import { downloadMidi } from './midi.js';
import { buildSongLayout, chordEvents } from './song.js';
import { generateMelody } from './generator.js';
import { reharmonize } from './reharmonize.js';
import { renderSongWav } from './recorder.js';
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
    this._registerSW();
    this._bindInstall();
    window.addEventListener('resize', () => { if (this._scoreVisible()) this.notation.render(); });
  }

  _scoreVisible() {
    const v = document.getElementById('view-score');
    return v && v.classList.contains('active');
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
    this.touch();
  }
  removeFromProgression(i) {
    this.state.progression.splice(i, 1);
    this.chords.renderProgression();
    this.touch();
  }
  clearProgression() {
    this.stopPlayback();
    this.state.progression = [];
    this.chords.renderProgression();
    this.touch();
  }
  loadProgressionPreset(preset) {
    const dia = this.getDiatonic(preset.seventh ? 4 : 3);
    this.state.progression = preset.degrees.map((d) => this.attachMidis(dia[d % dia.length]));
    this.chords.renderProgression();
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
    this.state.progression = chords.map((c) => this.attachMidis(c));
    this.chords.renderProgression();
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
  clearSequence() { this.state.sequence = {}; this.sequencer.render(); this.touch(); }

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

  playSong() {
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
    this.state.sequence = seq;
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
    const voiced = this.getVoicedProgression();
    const melody = this._melodyByCol();
    if (!voiced.length && !Object.keys(melody).length) { this._toast('Nada que exportar todavía'); return; }
    this._toast('Renderizando WAV…');
    try {
      await renderSongWav({
        voiced, melodyByCol: melody, seqSteps: this.state.seqSteps, stepsPerBeat: this.transport.stepsPerBeat,
        bpm: this.state.bpm, style: this.state.chordStyle, loops: 2,
        instrumentKey: this.state.instrument, reverbWet: this.state.reverb, volume: this.state.volume,
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
      if (this.transport.playing) this.stopPlayback(); else this.playSong();
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
        if (this.transport.playing) this.stopPlayback(); else this.playSong();
      }
    });
  }

  _bindTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach((tab) => tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + tab.dataset.view));
      if (tab.dataset.view === 'score') this.notation.render();
      if (tab.dataset.view === 'workshop') this.renderWorkshop();
    }));
  }

  /* ------------------------------------------------------------- workshop */
  _uid() { return 'w' + Math.random().toString(36).slice(2, 8); }

  exportToWorkshop() {
    const prog = this.state.progression;
    if (!prog.length) { this._toast('No hay progresión que enviar'); return; }
    const label = prompt('Etiqueta de esta progresión (Verso, Coro, Intro, Outro…):', 'Verso');
    if (label == null) return;
    const chords = prog.map((c) => ({ roman: c.roman, symbol: c.symbol, color: c.color, midis: c.midis || T.chordToMidi(c) }));
    this.state.workshop.push({ id: this._uid(), label: (label.trim() || 'Sin etiqueta'), chords });
    this.touch();
    this._toast('Añadido a Workshop 📥');
  }

  removeWorkshopItem(i) {
    const it = this.state.workshop[i];
    if (it && !confirm(`¿Quitar «${it.label}» del Workshop?`)) return;
    this.state.workshop.splice(i, 1);
    this.renderWorkshop();
    this.touch();
  }

  renameWorkshopItem(i) {
    const it = this.state.workshop[i]; if (!it) return;
    const label = prompt('Nueva etiqueta:', it.label);
    if (label != null && label.trim()) { it.label = label.trim(); this.renderWorkshop(); this.touch(); }
  }

  playWorkshopItem(i) {
    const it = this.state.workshop[i]; if (!it) return;
    this.stopPlayback();
    this.engine.init().then(() => {
      const dur = 0.72;
      let t = this.engine.now() + 0.05;
      it.chords.forEach((c) => { if (c.midis) this.engine.playChord(c.midis, dur * 0.95, t, 0.6); t += dur; });
    });
  }

  renderWorkshop() {
    const box = document.getElementById('workshop');
    if (!box) return;
    const ws = this.state.workshop;
    box.innerHTML = '';
    if (!ws.length) {
      box.innerHTML = '<div class="prog-empty">Aún no hay progresiones. Crea una en «Acordes & Progresión» y pulsa «📥 A Workshop».</div>';
      return;
    }
    ws.forEach((it, i) => {
      const item = document.createElement('div');
      item.className = 'ws-item';
      const cells = it.chords.map((c) =>
        `<div class="ws-cell" style="--c:${c.color || '#888'}"><span class="roman">${this._esc(c.roman)}</span><span class="sym">${this._esc(c.symbol)}</span></div>`).join('');
      item.innerHTML = `
        <div class="ws-head">
          <h3 class="ws-label">${this._esc(it.label)}</h3>
          <div class="ws-actions">
            <button data-a="play" title="Escuchar">▶</button>
            <button data-a="ren" title="Renombrar etiqueta">✎</button>
            <button data-a="del" title="Quitar">×</button>
          </div>
        </div>
        <div class="ws-strip">${cells}</div>`;
      item.querySelector('.ws-actions').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.a === 'play') this.playWorkshopItem(i);
        else if (b.dataset.a === 'ren') this.renameWorkshopItem(i);
        else if (b.dataset.a === 'del') this.removeWorkshopItem(i);
      });
      box.appendChild(item);
    });
  }

  _esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

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
      if (on && !this.transport.playing) this.playSong();
    });
  }

  _bindProject() {
    document.getElementById('projName').addEventListener('input', (e) => { this.state.name = e.target.value; this.touch(); });
    document.getElementById('saveBtn').addEventListener('click', () => { Store.saveProject(this.state); this._toast('Proyecto guardado'); });
    document.getElementById('midiBtn').addEventListener('click', () => this.exportMidi());
    document.getElementById('jsonBtn').addEventListener('click', () => Store.exportJSON(this.state));
    document.getElementById('newBtn').addEventListener('click', () => {
      if (!confirm('¿Empezar un proyecto nuevo? Se perderán los cambios sin guardar.')) return;
      this.state = Store.defaultProject();
      this.stopPlayback();
      this.transport.bpm = this.state.bpm;
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
        this.recompute(); this._syncControls(); this.refreshAll(); this.touch();
        this._toast('Proyecto importado');
      } catch { this._toast('Archivo inválido'); }
      e.target.value = '';
    });
  }

  exportMidi() {
    const prog = this.state.progression;
    const tracks = [];
    if (prog.length) {
      const notes = [];
      prog.forEach((c, i) => c.midis.forEach((m) => notes.push({ midi: m, start: i * 4, duration: 3.9, velocity: 0.7 })));
      tracks.push({ name: 'Acordes', channel: 0, notes });
    }
    if (Object.keys(this.state.sequence).length) {
      const beatPerStep = 1 / this.transport.stepsPerBeat;
      const notes = [];
      for (const key in this.state.sequence) {
        const [m, c] = key.split(':').map(Number);
        notes.push({ midi: m, start: c * beatPerStep, duration: beatPerStep * 1.6, velocity: 0.9 });
      }
      tracks.push({ name: 'Melodía', channel: 1, notes });
    }
    if (!tracks.length) { this._toast('Nada que exportar todavía'); return; }
    downloadMidi({ bpm: this.state.bpm, tracks }, (this.state.name || 'sonus').replace(/[^\w\-]+/g, '_') + '.mid');
    this._toast('MIDI exportado');
  }

  /* ----------------------------------------------------------------- misc */
  touch() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => Store.saveProject(this.state), 600);
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
