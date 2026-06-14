/* ============================================================================
 * Sonus · sw.js · Service Worker.
 * Precarga el app-shell para uso 100% offline; cache-first con actualización.
 * ==========================================================================*/

const CACHE = 'sonus-v5';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/theory.js',
  './js/audio.js',
  './js/midi.js',
  './js/storage.js',
  './js/song.js',
  './js/generator.js',
  './js/reharmonize.js',
  './js/recorder.js',
  './js/musicxml.js',
  './js/ui/piano.js',
  './js/ui/circle.js',
  './js/ui/chords.js',
  './js/ui/sequencer.js',
  './js/ui/notation.js',
  './js/ui/midiInput.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegación: red primero, índice cacheado como respaldo (offline).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Recursos: cache-first con relleno de caché.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
