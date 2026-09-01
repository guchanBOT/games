/* 离线缓存：把游戏文件全部缓存到设备上，装到主屏幕后不联网也能玩。
   注意：以后如果更新了游戏文件，把下面的版本号 v1 改成 v2、v3……
   设备才会重新拉取新版本。 */
var CACHE = 'game2048-v1';
var FILES = ['./', './index.html', './manifest.json',
             './icon-180.png', './icon-192.png', './icon-512.png'];

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
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
      return hit || fetch(e.request);
    })
  );
});
