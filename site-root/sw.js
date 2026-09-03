/* 游戏大厅离线缓存（网络优先）：
   作用域：网站根目录，各游戏子目录（g2048/、count-master/…）由它们自己的 sw 负责。
   在线时每次先向服务器要最新文件 → 大厅更新后自动生效，不用清缓存；断网才用缓存兜底。 */
var CACHE = 'lobby-v4';
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
        // 规范：只清大厅自己的历史缓存，不碰任何游戏子目录的缓存
        return k.indexOf('lobby-') === 0 && k !== CACHE ? caches.delete(k) : null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var path = new URL(req.url).pathname;
  var mine = FILES.some(function (f) { return path === '/' + f.replace('./', ''); }) || path === '/';
  if (!mine) return;   // 子目录（各游戏）的请求放行给它们自己的 SW
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
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
