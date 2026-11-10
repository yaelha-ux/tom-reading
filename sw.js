// שומר את האפליקציה בטאבלט כדי שתעבוד גם בלי אינטרנט.
// כשמשנים קבצים, מעלים את מספר הגרסה כדי שהטאבלט יקבל את העדכון.
const CACHE = 'tom-reading-v7';
const FILES = [
  './', 'index.html', 'style.css', 'app.js', 'content.js', 'manifest.json',
  'images/turtle.png', 'images/fox.png', 'images/rabbit.png', 'images/bear.png',
  'images/icon-192.png', 'images/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) =>
    c.addAll(FILES.map((f) => new Request(f, { cache: 'no-cache' })))
  ));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
  ));
  self.clients.claim();
});

// קודם מהרשת (כדי שעדכונים יגיעו מיד), ובלי אינטרנט מהמטמון
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    // no-cache: לא להשתמש בעותק הישן ש-GitHub מבקש לשמור 10 דקות
    fetch(e.request, { cache: e.request.url.startsWith(self.location.origin) ? 'no-cache' : 'default' }).then((res) => {
      if (res.ok || res.type === 'opaque') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
