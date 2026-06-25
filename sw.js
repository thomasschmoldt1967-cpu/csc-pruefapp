const CACHE_NAME = 'csc-pruef-v74';
const CACHE = CACHE_NAME;
const ASSETS = ['./index.html','./style.css','./app.js','./config.js','./manifest.json','./logo.png','./firebase.js','./icon-192.png','./icon-512.png'];

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

// FEATURE 7: Push-Benachrichtigungen empfangen
self.addEventListener('push', e => {
  let data = { title: 'CSC Prüf-App', body: 'Neue Benachrichtigung' };
  try { if (e.data) data = e.data.json(); } catch(err) {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './logo.png',
      badge: './logo.png',
      tag: 'csc-pruef',
      data: { url: data.url || '/' }
    })
  );
});

// Klick auf Push-Benachrichtigung → App öffnen
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      return clients.openWindow(e.notification.data?.url || '/');
    })
  );
});
