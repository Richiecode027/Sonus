/* ============================================================================
 * Sonus · ui/sections.js · Barra de estructura de la canción.
 * Muestra las secciones (Intro, Verso, Coro…) como fichas: seleccionar,
 * renombrar, eliminar, reordenar y añadir. La sección activa es la que editan
 * las pestañas Acordes / Componer / Partitura.
 * ==========================================================================*/

export class SectionsBar {
  constructor(container, app) {
    this.container = container;
    this.app = app;
    this.chips = [];
  }

  render() {
    const { sections, activeSection } = this.app.state;
    this.container.innerHTML = '';
    this.chips = [];

    const label = document.createElement('span');
    label.className = 'sec-label';
    label.textContent = 'Estructura';
    this.container.appendChild(label);

    sections.forEach((s, i) => {
      const chip = document.createElement('div');
      chip.className = 'sec-chip' + (i === activeSection ? ' active' : '');

      const name = document.createElement('button');
      name.className = 'sec-name';
      name.textContent = s.name;
      name.title = 'Seleccionar · doble clic para renombrar';
      name.addEventListener('click', () => this.app.setActiveSection(i));
      name.addEventListener('dblclick', () => this.app.renameSection(i));
      chip.appendChild(name);

      const count = document.createElement('span');
      count.className = 'sec-count';
      count.textContent = s.progression.length ? s.progression.length + ' ac.' : 'vacía';
      chip.appendChild(count);

      if (i === activeSection) {
        const ctrl = document.createElement('div');
        ctrl.className = 'sec-ctrl';
        ctrl.innerHTML = `
          <button data-a="left" title="Mover a la izquierda">◀</button>
          <button data-a="ren" title="Renombrar">✎</button>
          <button data-a="del" title="Eliminar">×</button>
          <button data-a="right" title="Mover a la derecha">▶</button>`;
        ctrl.addEventListener('click', (e) => {
          const b = e.target.closest('button'); if (!b) return;
          const a = b.dataset.a;
          if (a === 'left') this.app.moveSection(i, -1);
          else if (a === 'right') this.app.moveSection(i, 1);
          else if (a === 'ren') this.app.renameSection(i);
          else if (a === 'del') this.app.deleteSection(i);
        });
        chip.appendChild(ctrl);
      }

      this.container.appendChild(chip);
      this.chips.push(chip);
    });

    const add = document.createElement('button');
    add.className = 'sec-add';
    add.textContent = '+ Sección';
    add.title = 'Añadir una sección nueva';
    add.addEventListener('click', () => this.app.addSection());
    this.container.appendChild(add);
  }

  /** Resalta la sección que suena durante la reproducción de la canción. */
  setPlaying(i) {
    this.chips.forEach((c, idx) => c.classList.toggle('playing', idx === i));
  }
}
