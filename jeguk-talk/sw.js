/* 오프라인에서도 열리도록 앱 파일을 저장해 둔다 */
var CACHE = 'jeguk-talk-v2';
var ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/storage.js',
  'js/weather.js',
  'js/speech.js',
  'js/engine.js',
  'js/app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(ASSETS).catch(function () {});
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
        return null;
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (ev) {
  var req = ev.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return; /* 날씨 API는 그대로 지나가게 */

  if (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') >= 0) {
    ev.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (r) {
          return r || caches.match('index.html');
        });
      })
    );
    return;
  }

  ev.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) {
        fetch(req).then(function (res) {
          if (res && res.ok) caches.open(CACHE).then(function (c) { c.put(req, res); });
        }).catch(function () {});
        return cached;
      }
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
