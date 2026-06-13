/* ============================================================================
 * Sonus · ui/chords.js · Paleta de acordes + constructor de progresiones.
 * Acordes diatónicos (tríada/séptima/novena), préstamo modal, armonía
 * funcional (dominantes secundarias, vii°7/x, sustitución tritonal),
 * detección de tonalidad, sugerencias y línea de tiempo editable.
 * ==========================================================================*/

export class ChordsPanel {
  constructor(container, app) {
    this.container = container;
    this.app = app;
    this.size = 3;                 // 3=tríada, 4=séptima, 5=novena
    this.build();
  }

  build() {
    this.container.innerHTML = `
      <div class="panel-head">
        <h2>Acordes & Progresión</h2>
        <div class="seg-toggle" id="chordType">
          <button data-v="3" class="active">Tríadas</button>
          <button data-v="4">Séptimas</button>
          <button data-v="5">Novenas</button>
        </div>
      </div>

      <div class="chord-section">
        <h3>Diatónicos <span class="hint">de la escala actual · click para añadir</span></h3>
        <div class="chord-grid" id="diatonicGrid"></div>
      </div>

      <div class="chord-section">
        <h3>Préstamo modal <span class="hint">prestados de modos paralelos · el toque maestro</span></h3>
        <div class="chord-grid borrowed" id="borrowedGrid"></div>
      </div>

      <div class="chord-section">
        <h3>Armonía funcional <span class="hint">dominantes secundarias · vii°7/x · sustitución tritonal</span></h3>
        <div class="chord-grid borrowed" id="functionalGrid"></div>
      </div>

      <div class="chord-section">
        <div class="prog-head">
          <h3>Progresión</h3>
          <div class="prog-actions">
            <button id="detectBtn" class="btn ghost">🔎 Detectar tonalidad</button>
            <button id="reharmBtn" class="btn accent">✨ Rearmonizar</button>
            <button id="progPlay" class="btn">▶ Reproducir</button>
            <button id="progStop" class="btn ghost">■ Parar</button>
            <button id="progClear" class="btn ghost">Limpiar</button>
          </div>
        </div>
        <div class="key-results" id="keyResults"></div>
        <div class="prog-presets" id="progPresets"></div>
        <div class="prog-strip" id="progStrip"></div>
        <div class="suggest-line" id="suggestLine"></div>
        <div class="reharm-results" id="reharmResults"></div>
      </div>
    `;

    this.diatonicGrid = this.container.querySelector('#diatonicGrid');
    this.borrowedGrid = this.container.querySelector('#borrowedGrid');
    this.functionalGrid = this.container.querySelector('#functionalGrid');
    this.progStrip = this.container.querySelector('#progStrip');
    this.progPresets = this.container.querySelector('#progPresets');
    this.suggestLine = this.container.querySelector('#suggestLine');
    this.keyResults = this.container.querySelector('#keyResults');
    this.reharmResults = this.container.querySelector('#reharmResults');

    this.container.querySelector('#chordType').addEventListener('click', (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      this.size = +btn.dataset.v;
      this.container.querySelectorAll('#chordType button').forEach((b) => b.classList.toggle('active', b === btn));
      this.renderPalette();
    });

    this.container.querySelector('#progPlay').addEventListener('click', () => this.app.playProgression());
    this.container.querySelector('#progStop').addEventListener('click', () => this.app.stopPlayback());
    this.container.querySelector('#progClear').addEventListener('click', () => this.app.clearProgression());
    this.container.querySelector('#detectBtn').addEventListener('click', () => this.renderKeyDetection());
    this.container.querySelector('#reharmBtn').addEventListener('click', () => this.renderReharm());
  }

  renderReharm() {
    this.reharmResults.innerHTML = '';
    if (!this.app.state.progression.length) {
      this.reharmResults.innerHTML = '<div class="prog-empty">Crea una progresión primero ↑</div>';
      return;
    }
    const variants = this.app.getReharmonizations();
    if (!variants.length) {
      this.reharmResults.innerHTML = '<div class="prog-empty">No hay nuevas variantes para esta progresión.</div>';
      return;
    }
    const head = document.createElement('div');
    head.className = 'reharm-head hint';
    head.textContent = 'Variantes — escúchalas y aplica la que prefieras:';
    this.reharmResults.appendChild(head);

    variants.forEach((v) => {
      const card = document.createElement('div');
      card.className = 'reharm-card';
      const chips = v.chords.map((c) => `<span class="rh-chip" style="--c:${c.color}"><b>${c.roman}</b><i>${c.symbol}</i></span>`).join('');
      card.innerHTML = `
        <div class="rh-info"><b>${v.name}</b><span class="hint">${v.desc}</span></div>
        <div class="rh-chords">${chips}</div>
        <div class="rh-actions">
          <button class="btn ghost rh-play">▶ Escuchar</button>
          <button class="btn rh-apply">Aplicar</button>
        </div>`;
      card.querySelector('.rh-play').addEventListener('click', () => this.app.auditionProgression(v.chords));
      card.querySelector('.rh-apply').addEventListener('click', () => { this.app.applyReharmonization(v.chords); this.reharmResults.innerHTML = ''; });
      this.reharmResults.appendChild(card);
    });
  }

  _chip(chord, { add = true, borrowed = false, suggested = false } = {}) {
    const chip = document.createElement('button');
    chip.className = 'chord-chip' + (borrowed ? ' borrowed' : '') + (suggested ? ' suggested' : '');
    chip.style.setProperty('--c', chord.color);
    chip.innerHTML = `
      <span class="roman">${chord.roman}</span>
      <span class="sym">${chord.symbol}</span>
      ${borrowed ? `<span class="src">${chord.source}</span>` : ''}
      ${suggested ? '<span class="star">★</span>' : ''}
    `;
    chip.title = `${chord.symbol} — ${chord.notes.map((n) => n.name).join(' · ')}`;
    chip.addEventListener('click', () => {
      this.app.previewChord(chord);
      if (add) this.app.addToProgression(chord);
    });
    return chip;
  }

  renderPalette() {
    const diatonic = this.app.getDiatonic(this.size);
    const borrowed = this.app.getBorrowed(this.size);
    const suggestedDegrees = new Set(this.app.suggestNextDegrees());

    this.diatonicGrid.innerHTML = '';
    diatonic.forEach((c) => this.diatonicGrid.appendChild(this._chip(c, { suggested: suggestedDegrees.has(c.degree) })));

    this.borrowedGrid.innerHTML = '';
    borrowed.slice(0, 14).forEach((c) => this.borrowedGrid.appendChild(this._chip(c, { borrowed: true })));

    this.renderFunctional();
    this.renderPresets();
  }

  renderFunctional() {
    const f = this.app.getFunctional();
    this.functionalGrid.innerHTML = '';
    if (!f.secondary.length) {
      this.functionalGrid.innerHTML = '<div class="prog-empty">Disponible en escalas de 7 notas.</div>';
      return;
    }
    [...f.secondary, ...f.tritone, ...f.leading].forEach((c) =>
      this.functionalGrid.appendChild(this._chip(c, { borrowed: true })));
  }

  renderKeyDetection() {
    const results = this.app.detectKey();
    this.keyResults.innerHTML = '';
    if (!results.length) {
      this.keyResults.innerHTML = '<span class="hint">Añade melodía o acordes para analizar la tonalidad.</span>';
      return;
    }
    const top = results[0].score || 1;
    const label = document.createElement('span');
    label.className = 'hint';
    label.textContent = 'Tonalidad probable:';
    this.keyResults.appendChild(label);
    results.forEach((r, i) => {
      const pct = Math.max(0, Math.round((r.score / top) * 100));
      const b = document.createElement('button');
      b.className = 'key-chip' + (i === 0 ? ' best' : '');
      b.innerHTML = `<b>${r.root} ${r.family}</b><span class="bar"><i style="width:${pct}%"></i></span>`;
      b.addEventListener('click', () => this.app.setKey(r.pc, r.scale, r.root));
      this.keyResults.appendChild(b);
    });
  }

  renderPresets() {
    const presets = this.app.getProgressionPresets();
    this.progPresets.innerHTML = '';
    presets.forEach((p) => {
      const b = document.createElement('button');
      b.className = 'preset-chip';
      b.textContent = p.name;
      b.addEventListener('click', () => this.app.loadProgressionPreset(p));
      this.progPresets.appendChild(b);
    });
  }

  renderProgression() {
    const prog = this.app.state.progression;
    this.progStrip.innerHTML = '';
    if (!prog.length) this.progStrip.innerHTML = '<div class="prog-empty">Añade acordes desde arriba o elige una plantilla ↑</div>';
    prog.forEach((chord, i) => {
      const cell = document.createElement('div');
      cell.className = 'prog-cell';
      cell.style.setProperty('--c', chord.color || '#888');
      const shift = chord.octaveShift || 0;
      cell.innerHTML = `
        ${shift ? `<span class="oct-badge">${shift > 0 ? '↑' : '↓'}${Math.abs(shift)}</span>` : ''}
        <span class="roman">${chord.roman}</span>
        <span class="sym">${chord.symbol}</span>
        <div class="oct-ctrl">
          <button class="oct-up" title="Octava arriba">▲</button>
          <button class="oct-dn" title="Octava abajo">▼</button>
        </div>
        <button class="del" title="Quitar">×</button>
      `;
      cell.querySelector('.del').addEventListener('click', (e) => { e.stopPropagation(); this.app.removeFromProgression(i); });
      cell.querySelector('.oct-up').addEventListener('click', (e) => { e.stopPropagation(); this.app.setChordOctave(i, +1); });
      cell.querySelector('.oct-dn').addEventListener('click', (e) => { e.stopPropagation(); this.app.setChordOctave(i, -1); });
      cell.addEventListener('click', () => { this.app.previewChord(chord); this._highlight(i); });
      this.progStrip.appendChild(cell);
    });

    const sug = this.app.suggestNextChords();
    this.suggestLine.innerHTML = sug.length ? '<span class="hint">Sugerencias:</span>' : '';
    sug.forEach((c) => this.suggestLine.appendChild(this._chip(c, { suggested: true })));
  }

  _highlight(i) {
    this.progStrip.querySelectorAll('.prog-cell').forEach((c, idx) => c.classList.toggle('playing', idx === i));
  }

  setPlayhead(i) { this._highlight(i); }

  update() { this.renderPalette(); this.renderProgression(); }
}
