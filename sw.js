const CACHE_NAME = 'tecnosistem-pwa-v3';
const urlsToCache = [
  './',
  './index.html',
  './style.css?v=3',
  './app.js?v=3',
  './firebase-db.js',
  './manifest.json',
  'https://www.gstatic.com/firebasejs/10.9.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore-compat.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Network First, fallback to cache
self.addEventListener('fetch', event => {
  // Ignoriamo le chiamate API dirette (come Firestore) per le quali il client Firestore gestisce l'offline nativamente
  if (event.request.url.includes('firestore.googleapis.com')) return;
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Se la richiesta va a buon fine (siamo online), aggiorniamo la cache in background
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        return response;
      })
      .catch(() => {
        // Se la rete è assente, serviamo i file locali salvati dalla cache! (Modalità Aereo)
        return caches.match(event.request);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});
