/* 游戏大厅的离线缓存（作用域：网站根目录，不管各游戏子目录，它们有自己的 sw.js）。
   大厅有改动时把 lobby-v1 改成 lobby-v2、v3…… */
var CACHE = 'lobby-v2';
var FILES = ['./', './index.html', './manifest.json',
             './lobby-icon-180.png', './lobby-icon-192.png', './lobby-icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(FILES); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k.indexOf('lobby-') === 0 && k !== CACHE ? caches.delete(k) : null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  // 只处理大厅自己的文件，子目录（各游戏）的请求直接放行
  var path = new URL(e.request.url).pathname;
  var mine = FILES.some(function (f) { return path === '/' + f.replace('./', ''); }) || path === '/';
  if (!mine) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
      return hit || fetch(e.request);
    })
  );
});
