const CACHE = 'shiguangji-v5';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=5',
  './app.js?v=5',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './assets/flower2/07-spray-amber.png',
  './assets/flower2/08-sprig-rust.png',
  './assets/flower2/10-ranunculus-white.png',
  './assets/flower2/11-poppy-red.png',
  './assets/flower2/12-blossom-cream.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.url.includes('api.github.com')) return;

  e.respondWith(
    fetch(req).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(req, clone));
      return res;
    }).catch(() => caches.match(req))
  );
});
