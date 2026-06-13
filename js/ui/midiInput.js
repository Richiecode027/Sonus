/* ============================================================================
 * Sonus · ui/midiInput.js · Entrada de teclado MIDI físico (Web MIDI API).
 * Toca el sintetizador en vivo y, en modo grabación, escribe las notas
 * cuantizadas en el piano roll.
 * ==========================================================================*/

export class MidiInput {
  constructor(app) {
    this.app = app;
    this.access = null;
    this.recording = false;
    this.onStatus = null;       // (text, connected) => void
    this.devices = [];
  }

  get supported() { return typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess; }

  async enable() {
    if (!this.supported) { this._status('Web MIDI no soportado en este navegador', false); return false; }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (e) {
      this._status('Permiso MIDI denegado', false); return false;
    }
    this._bind();
    this.access.onstatechange = () => this._bind();
    return true;
  }

  _bind() {
    this.devices = [];
    for (const input of this.access.inputs.values()) {
      this.devices.push(input.name);
      input.onmidimessage = (e) => this._onMessage(e);
    }
    if (this.devices.length) this._status('🎹 ' + this.devices.join(', '), true);
    else this._status('Sin dispositivos MIDI conectados', true);
  }

  _onMessage(e) {
    const [status, data1, data2] = e.data;
    const cmd = status & 0xf0;
    if (cmd === 0x90 && data2 > 0) {
      const midi = data1;
      const vel = data2 / 127;
      this.app.engine.init().then(() => this.app.engine.playNote(midi, 0.6, null, Math.max(0.4, vel)));
      if (this.app.piano) this.app.piano.flash(midi);
      if (this.recording && this.app.transport.playing) {
        const col = this.app.transport.nearestStep();
        this.app.recordNote(midi, col);
      }
    }
  }

  setRecording(on) { this.recording = on; }

  _status(text, connected) { if (this.onStatus) this.onStatus(text, connected); }
}
