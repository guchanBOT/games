/* 2048 正式版离线缓存（网络优先）：
   在线时每次先向服务器要最新文件 → 部署完新版本后自动生效，不用清缓存；
   只有断网/出错时才用本地缓存兜底。 */
var CACHE = 'test2048-v5';
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
        // 规范：只清本游戏历史缓存(game2048-* 及废弃的 g2048-*)，不碰其它游戏
        var mine = k.indexOf('game2048-') === 0 || k.indexOf('g2048-') === 0;
        return mine && k !== CACHE ? caches.delete(k) : null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && new URL(req.url).origin === location.origin) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || caches.match(req, { ignoreSearch: true }).then(function (h2) {
          return h2 || (req.mode === 'navigate' ? caches.match('./index.html') : undefined);
        });
      });
    })
  );
});
