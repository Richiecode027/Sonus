# 🎼 Sonus — Estudio de composición musical (PWA)

**Sonus** es una aplicación web instalable (PWA) que reúne las herramientas que necesitas
para componer *como un maestro*: explorar tonalidades y modos, construir progresiones con
préstamo modal, dibujar melodías en un piano roll y exportar todo a MIDI — **sin conexión,
sin instalar nada, sin dependencias externas**.

![Sonus](icons/icon-192.png)

## ✨ Qué incluye

### 🎹 Motor de teoría musical (riguroso)
- **Escalas y los 7 modos griegos**: jónico, dórico, frigio, lidio, mixolidio, eólico, locrio.
- **Menor armónica y melódica**, pentatónicas mayor/menor, blues, tonos enteros, disminuida y cromática.
- **Deletreo enarmónico correcto** según la tonalidad (F♯ mayor = F♯ G♯ A♯ B C♯ D♯ E♯, no con bemoles).
- **Acordes diatónicos** (tríadas y séptimas) con **cifrado romano** relativo al mayor paralelo
  (i, ii°, ♭III, iv, v, ♭VI, ♭VII…), detectando mayor, menor, disminuido, aumentado, maj7, 7, m7, ø7, °7…

### 🔀 Préstamo modal (modal interchange)
El recurso que distingue a los grandes: Sonus calcula los acordes **prestados de los modos
paralelos** (♭VI, ♭VII, iv, ♭II napolitana, II lidia…) y los ofrece etiquetados por su origen.

### 🎯 Armonía funcional avanzada
- **Acordes de novena** diatónicos (maj9, 9, m9, **7♭9**…) — detecta correctamente el ♭9 del iii.
- **Dominantes secundarias** (V7/ii, V7/V, V7/vi…) para tonicizar cualquier grado.
- **Disminuidos secundarios** (vii°7/x) y **sustitución tritonal** (subV7/x), con deletreo enarmónico correcto.
- **Detección de tonalidad** a partir de tu melodía y progresión (perfiles Krumhansl-Kessler), con candidatos ordenados por confianza — un clic y cambias de tonalidad.

### ♻️ Rearmonización automática
Pulsa **✨ Rearmonizar** y Sonus reinterpreta tu progresión en 8 estilos — escúchalos y aplica el que prefieras:
**Séptimas**, **Dominantes secundarias** (V7/x), **Sustitución tritonal** (subV7/x),
**ii–V relacionados** (con iiø7 para objetivos menores), **Color modal** (iv), **Disminuidos de paso**,
**Sustitución diatónica** (relativos/mediantes de igual función) y **Backdoor** (♭VII7→I).

### ↕️ Octava por acorde
Cada acorde de la progresión tiene controles **▲/▼** para subirlo o bajarlo de octava (hasta ±2),
con indicador visual. Afecta a la reproducción (respetando la conducción de voces) y a la exportación.

### 🎚️ Conducción de voces e inversiones automáticas
Activa **Voces** y Sonus elige la inversión y la octava de cada acorde para **minimizar el
movimiento entre voces** (mantiene notas comunes, mueve por grados) — voicings de profesional sin esfuerzo.

### ✨ Generador de melodías consciente de la armonía
Un clic crea una melodía cantábile: **notas de acorde en los tiempos fuertes**, movimiento por
grados conjuntos, motivo rítmico repetido y cierre en una nota estable. Genera cuantas quieras.

### 🥁 Estilos, metrónomo y swing
Reproduce la progresión en **bloque, arpegio o rasgueo**, con **metrónomo** y **swing** ajustable.

### 🧭 Círculo de quintas interactivo
Cambia de tonalidad con un clic. Resalta la tónica, sus dominante/subdominante vecinas y su relativa.

### 🎛️ Constructor de progresiones
- Plantillas clásicas por familia (Pop axis, Canon, Doo-wop, ii–V–I, Andaluza, Blues…).
- **Sugerencias de continuación** según la función armónica de lo que llevas escrito.
- Línea de tiempo editable; clic para escuchar cada acorde.

### 🎼 Piano roll / secuenciador
Dibuja melodías sobre la progresión. Las filas en escala se iluminan; la armonía suena de fondo.

### 🔊 Sintetizador propio (Web Audio API)
Polifónico, con envolvente ADSR, filtro, reverb y 6 timbres (Piano, E-Piano, Pad, Pluck, Órgano, Synth).
Reproducción con *scheduler* de precisión (lookahead) para un timing impecable.

### 🎼 Partitura en vivo + entrada MIDI
- **Vista de partitura** (clave de sol con melodía y cifrado de acordes) renderizada en SVG.
- **Teclado MIDI físico** (Web MIDI API): toca en vivo y **graba al piano roll** cuantizado.

### 💾 Exportación y persistencia
- **MIDI** (Standard MIDI File real) para cualquier DAW: Logic, Ableton, FL Studio, MuseScore…
- **WAV** de alta calidad (render *offline*, idéntico a lo que oyes).
- **MusicXML** para editar la partitura en MuseScore/Finale/Sibelius/Dorico, o **imprimir a PDF**.
- Exporta/importa el proyecto en `.json`. Autoguardado en el navegador (`localStorage`).

### 📱 PWA completa
Instalable, **funciona sin conexión** (service worker + app-shell cacheado), iconos y manifiesto.

## 🚀 Cómo ejecutarla

Necesita servirse por HTTP (los módulos ES y el service worker no funcionan abriendo el archivo directamente).

**Con Python** (ya instalado en tu equipo):
```powershell
cd C:\Users\rc_ju\Desktop\Sonus
python -m http.server 8123
```
Luego abre **http://localhost:8123** en Chrome/Edge.

**Con Node:**
```powershell
npx serve -l 8123
```

Para **instalarla como app**, abre la URL en Chrome/Edge y pulsa el icono de instalar de la barra
de direcciones (o el botón “Instalar app” cuando aparezca).

## ⌨️ Atajos
- **Barra espaciadora**: reproducir / pausar.
- Teclas **A S D F G H J…** (y **W E T Y U**): tocar el piano. **Z / X**: bajar / subir octava.

## 🗂️ Estructura
```
Sonus/
├── index.html
├── manifest.webmanifest
├── sw.js                  # service worker (offline)
├── gen-icons.ps1          # generador de iconos (System.Drawing)
├── css/styles.css
├── icons/                 # 192, 512 y maskable
└── js/
    ├── app.js             # orquestador
    ├── theory.js          # teoría: escalas, acordes, voice-leading
    ├── audio.js           # sintetizador + transporte (swing, metrónomo)
    ├── song.js            # arreglo compartido (estilos de acorde)
    ├── generator.js       # generador de melodías
    ├── recorder.js        # render a WAV (OfflineAudioContext)
    ├── midi.js            # escritor de archivos MIDI
    ├── musicxml.js        # exportador MusicXML
    ├── storage.js         # guardado de proyectos
    └── ui/                # piano, círculo, acordes, secuenciador,
                           #   partitura (notation), entrada MIDI
```

## 🛠️ Tecnología
Vanilla JS (módulos ES), Web Audio API, SVG, Service Worker. **Cero dependencias.**

---
*Hecho con Sonus para que componer sea tan natural como tararear.*
