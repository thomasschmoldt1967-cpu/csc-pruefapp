const CACHE = 'csc-pruef-v16';
const ASSETS = ['./index.html','./style.css','./app.js','./config.js','./manifest.json','./logo.png'];

// Install: neuen Cache befüllen
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting(); // sofort aktiv werden, nicht auf Tab-Schließen warten
});

// Activate: alte Caches löschen
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim()) // alle offenen Tabs übernehmen
  );
});

// Fetch: Network-first → bei Fehler Cache
self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request)
      .then(response => {
        // Erfolgreiche Antwort auch im Cache aktualisieren
        const clone = response.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return response;
      })
      .catch(() => caches.match(e.request)) // offline: aus Cache
  );
});
