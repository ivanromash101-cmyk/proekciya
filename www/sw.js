// Офлайн-режим: файлы приложения кэшируются при установке,
// распознавание фигуры и шрифты — при первой загрузке.
const CACHE = 'proekciya-v40';
const SHELL = ['./', 'index.html', 'css/app.css', 'css/fonts.css', 'js/i18n.js', 'js/config.js', 'js/chat.js', 'js/tryon.js', 'js/brands.js', 'js/shop.js', 'js/geo.js', 'js/weather.js', 'js/deals.js', 'js/cart.js', 'js/profiles.js', 'js/photofit.js', 'js/aitryon.js', 'js/welcome.js', 'js/music.js', 'i18n/ru.txt', 'i18n/en.txt', 'i18n/nl.txt', 'i18n/fr.txt', 'i18n/de.txt', 'i18n/pl.txt',
  'models/man.obj', 'models/man.mtl', 'models/woman.obj', 'models/woman.mtl', 'models/textures/brown_eye.png', 'js/native.js', 'js/body.js', 'js/template.js', 'js/viewer.js',
  'js/scan.js', 'js/camera.js', 'js/stylist.js', 'js/app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const own = url.origin === location.origin;
  const cdn = /cdn\.jsdelivr\.net|storage\.googleapis\.com|fonts\.(googleapis|gstatic)\.com/.test(url.host);
  if (!own && !cdn) return;
  // свои файлы: сначала сеть (чтобы обновления доходили), без сети — кэш
  // внешние библиотеки и шрифты: сначала кэш
  e.respondWith(own
    ? fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return r; })
        .catch(() => caches.match(req).then(r => r || caches.match('index.html')))
    : caches.match(req).then(hit => hit || fetch(req).then(r => {
        if (r.ok || r.type === 'opaque') { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return r;
      })));
});
