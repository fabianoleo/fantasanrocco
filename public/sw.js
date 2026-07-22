/* ===================================================================
   FantaSanRocco — Service Worker
   • Offline: pagine (network-first + fallback cache/offline) e statici
     same-origin (cache-first) → il programma resta consultabile offline.
   • I tile della mappa (CARTO) e i font NON vengono intercettati: sono
     risorse cross-origin e passarle dal SW le rompeva (tile grigi / font
     sballati). Le gestisce direttamente il browser, come deve essere.
   • Notifiche push (Web Push): mostra la notifica e gestisce il click.
   =================================================================== */
const VERSION = 'fsr-v6';
const CORE = ['/offline.html', '/icons/icon-192.png', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Solo statici SAME-ORIGIN: mai risorse cross-origin (tile mappa, font…),
// che passate dal SW diventano opache e possono rompersi / avvelenare la cache.
function isStatic(url) {
  return url.origin === self.location.origin &&
    /\.(css|js|png|jpe?g|webp|avif|svg|gif|woff2?|ttf|mp3|ico|json)$/i.test(url.pathname);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // solo GET, mai POST
  const url = new URL(req.url);

  // Pagine (navigazioni): rete prima, poi cache, poi pagina offline.
  // Le pagine sensibili (admin/2FA/login) non vengono mai salvate in cache:
  // su un dispositivo condiviso non deve restare una copia offline dello
  // storico del pannello admin o dei flussi di autenticazione.
  if (req.mode === 'navigate') {
    const noStore = /^\/(admin|2fa|login)(\/|$|\?)/.test(url.pathname + '');
    if (noStore) { e.respondWith(fetch(req).catch(() => caches.match('/offline.html'))); return; }
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/offline.html')))
    );
    return;
  }

  // Solo statici SAME-ORIGIN: cache-first con aggiornamento in background.
  // Le risorse cross-origin (tile mappa CARTO, font) NON si toccano → le
  // gestisce il browser, così non si rompono dopo la prima visita.
  if (isStatic(url)) {
    e.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && (res.ok || res.type === 'opaque')) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});

// ── Notifiche push ─────────────────────────────────────────────────
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = { body: e.data ? e.data.text() : '' }; }
  const title = data.title || 'FantaSanRocco';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || '/' },
    vibrate: [80, 40, 80],
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) { try { c.navigate(target); } catch (err) {} return c.focus(); }
      }
      return self.clients.openWindow(target);
    })
  );
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
