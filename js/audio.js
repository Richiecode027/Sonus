/* ============================================================================
 * Sonus · audio.js
 * Sintetizador polifónico (Web Audio API) + reverb + transporte con scheduler
 * lookahead, swing y metrónomo. Las voces se generan con una función pura
 * reutilizable tanto en tiempo real como en render offline (export WAV).
 * ==========================================================================*/

import { midiToFreq } from './theory.js';

export const INSTRUMENTS = {
  grand: {
    name: 'Piano',
    layers: [{ type: 'triangle', gain: 0.9, detune: 0 }, { type: 'sine', gain: 0.35, detune: 0, octave: 1 }],
    filter: { type: 'lowpass', freq: 5200, q: 0.6, track: 0.35 },
    env: { a: 0.004, d: 0.9, s: 0.0, r: 0.35 },
  },
  epiano: {
    name: 'E-Piano',
    layers: [{ type: 'sine', gain: 0.9, detune: 0 }, { type: 'sine', gain: 0.3, detune: 0, octave: 2 }],
    filter: { type: 'lowpass', freq: 3200, q: 1.2, track: 0.4 },
    env: { a: 0.005, d: 1.4, s: 0.0, r: 0.5 },
  },
  pad: {
    name: 'Pad',
    layers: [{ type: 'sawtooth', gain: 0.5, detune: -7 }, { type: 'sawtooth', gain: 0.5, detune: 7 }, { type: 'sine', gain: 0.3, octave: -1 }],
    filter: { type: 'lowpass', freq: 1800, q: 0.8, track: 0.5 },
    env: { a: 0.5, d: 0.6, s: 0.8, r: 1.4 },
  },
  pluck: {
    name: 'Pluck',
    layers: [{ type: 'sawtooth', gain: 0.7, detune: 0 }],
    filter: { type: 'lowpass', freq: 4000, q: 2, track: 0.3 },
    env: { a: 0.002, d: 0.25, s: 0.0, r: 0.18 },
  },
  organ: {
    name: 'Órgano',
    layers: [{ type: 'sine', gain: 0.6 }, { type: 'sine', gain: 0.4, octave: 1 }, { type: 'sine', gain: 0.25, octave: 2 }],
    filter: { type: 'lowpass', freq: 6000, q: 0.4, track: 0.2 },
    env: { a: 0.01, d: 0.05, s: 0.95, r: 0.12 },
  },
  synth: {
    name: 'Synth',
    layers: [{ type: 'square', gain: 0.5, detune: -5 }, { type: 'sawtooth', gain: 0.5, detune: 6 }],
    filter: { type: 'lowpass', freq: 2600, q: 3, track: 0.5 },
    env: { a: 0.01, d: 0.3, s: 0.6, r: 0.3 },
  },
};

/** Crea un impulso de reverb sintético. */
export function createImpulse(ctx, duration = 2.6, decay = 2.5) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * duration);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

/** Construye la cadena maestra (gain → seco/reverb → compresor → salida). */
export function buildMasterChain(ctx, { volume = 0.8, reverbWet = 0.25 } = {}) {
  const master = ctx.createGain();
  master.gain.value = volume;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.25;
  const out = ctx.createGain(); out.gain.value = 0.82;   // techo de seguridad
  const dry = ctx.createGain();
  const wet = ctx.createGain(); wet.gain.value = reverbWet;
  const convolver = ctx.createConvolver(); convolver.buffer = createImpulse(ctx);
  master.connect(dry); master.connect(convolver); convolver.connect(wet);
  dry.connect(comp); wet.connect(comp); comp.connect(out); out.connect(ctx.destination);
  return { master, wet, comp };
}

/** Genera una voz (nota) en cualquier contexto. Función pura reutilizable. */
export function spawnVoice(ctx, dest, inst, midi, when, duration = 0.6, velocity = 0.85) {
  const freq = midiToFreq(midi);
  const voice = ctx.createGain();
  voice.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = inst.filter.type;
  const fenv = inst.filter.freq + (midi - 60) * inst.filter.freq * inst.filter.track / 60;
  filter.frequency.value = Math.max(200, Math.min(fenv, 16000));
  filter.Q.value = inst.filter.q;

  const oscs = [];
  for (const layer of inst.layers) {
    const osc = ctx.createOscillator();
    osc.type = layer.type;
    osc.frequency.value = freq * Math.pow(2, layer.octave || 0);
    if (layer.detune) osc.detune.value = layer.detune;
    const g = ctx.createGain(); g.gain.value = layer.gain;
    osc.connect(g).connect(filter); oscs.push(osc);
  }
  filter.connect(voice).connect(dest);

  const { a, d, s, r } = inst.env;
  const peak = velocity, sustain = peak * s;
  voice.gain.setValueAtTime(0, when);
  voice.gain.linearRampToValueAtTime(peak, when + a);
  voice.gain.linearRampToValueAtTime(Math.max(sustain, 0.0001), when + a + d);
  const relStart = when + Math.max(duration, a + d);
  if (s > 0) voice.gain.setValueAtTime(Math.max(sustain, 0.0001), relStart);
  voice.gain.linearRampToValueAtTime(0.0001, relStart + r);
  const stop = relStart + r + 0.05;
  for (const osc of oscs) { osc.start(when); osc.stop(stop); }
  return stop;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.instrument = 'grand';
    this.masterVol = 0.8;
    this.reverbWet = 0.25;
    this._ready = false;
  }

  async init() {
    if (this._ready) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    const chain = buildMasterChain(this.ctx, { volume: this.masterVol, reverbWet: this.reverbWet });
    this.master = chain.master; this.wet = chain.wet;
    this._ready = true;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  get ready() { return this._ready; }
  now() { return this.ctx ? this.ctx.currentTime : 0; }
  setInstrument(key) { if (INSTRUMENTS[key]) this.instrument = key; }
  setVolume(v) { this.masterVol = v; if (this.master) this.master.gain.setTargetAtTime(v, this.now(), 0.02); }
  setReverb(v) { this.reverbWet = v; if (this.wet) this.wet.gain.setTargetAtTime(v, this.now(), 0.02); }

  playNote(midi, duration = 0.6, when = null, velocity = 0.85) {
    if (!this._ready) return;
    spawnVoice(this.ctx, this.master, INSTRUMENTS[this.instrument], midi, when ?? this.now(), duration, velocity);
  }
  playChord(midis, duration = 1.2, when = null, velocity = 0.7) {
    const t = when ?? this.now();
    midis.forEach((m, i) => this.playNote(m, duration, t, velocity - i * 0.03));
  }

  /** Click del metrónomo (acentuado en el primer tiempo). */
  click(when, accent = false) {
    if (!this._ready) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.frequency.value = accent ? 1600 : 1000;
    osc.type = 'square';
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(accent ? 0.28 : 0.16, when + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    osc.connect(g).connect(this.master);
    osc.start(when); osc.stop(when + 0.06);
  }
}

/* ----------------------------------------------------------------------------
 * Transport con scheduler lookahead + swing.
 * --------------------------------------------------------------------------*/
export class Transport {
  constructor(engine) {
    this.engine = engine;
    this.bpm = 100;
    this.stepsPerBeat = 4;
    this.totalSteps = 16;
    this.swing = 0;            // 0..0.6
    this.playing = false;
    this.loop = true;
    this.onStep = null;
    this.onTick = null;
    this._step = 0;
    this._nextTime = 0;
    this._loopStart = 0;
    this._timer = null;
    this._lookahead = 0.025;
    this._scheduleAhead = 0.12;
  }

  get stepDur() { return 60 / this.bpm / this.stepsPerBeat; }
  get beatDur() { return 60 / this.bpm; }

  _swungTime(step, base) {
    return (step % 2 === 1) ? base + this.swing * this.stepDur * 0.66 : base;
  }

  start() {
    if (this.playing) return;
    this.engine.init().then(() => {
      this.playing = true;
      this._step = 0;
      this._nextTime = this.engine.now() + 0.08;
      this._loopStart = this._nextTime;
      this._scheduler();
    });
  }

  stop() {
    this.playing = false;
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
    if (this.onTick) this.onTick(-1);
  }

  toggle() { this.playing ? this.stop() : this.start(); }

  /** Paso más cercano al instante actual (para cuantizar grabación MIDI). */
  nearestStep() {
    const elapsed = this.engine.now() - this._loopStart;
    const s = Math.round(elapsed / this.stepDur);
    return ((s % this.totalSteps) + this.totalSteps) % this.totalSteps;
  }

  _scheduler() {
    if (!this.playing) return;
    while (this._nextTime < this.engine.now() + this._scheduleAhead) {
      const step = this._step;
      const time = this._swungTime(step, this._nextTime);
      if (step === 0) this._loopStart = this._nextTime;
      if (this.onStep) this.onStep(step, time);
      this._uiTick(step, time);
      this._nextTime += this.stepDur;
      this._step++;
      if (this._step >= this.totalSteps) {
        if (this.loop) this._step = 0;
        else { this._finishAfter(time); return; }
      }
    }
    this._timer = setTimeout(() => this._scheduler(), this._lookahead * 1000);
  }

  _uiTick(step, time) {
    if (!this.onTick) return;
    const delay = (time - this.engine.now()) * 1000;
    setTimeout(() => { if (this.playing) this.onTick(step); }, Math.max(0, delay));
  }

  _finishAfter(time) {
    const delay = (time - this.engine.now()) * 1000 + this.stepDur * 1000;
    this._timer = setTimeout(() => this.stop(), Math.max(0, delay));
  }
}
