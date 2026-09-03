/* 离线缓存（网络优先）：
   在线时每次都先向服务器要最新文件，部署完新版本后用户下次打开自动就是新版，
   不用清缓存、也不用每次改版本号；只有断网/服务器出错时才用本地缓存兜底。
   注意：本文件本身改动后，建议顺手把下面的版本号 +1，能更快唤醒旧 Service Worker。 */
var CACHE = 'test2048-v1';
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
  var req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    fetch(req).then(function (res) {
      // 同源且成功的响应才顺手写进缓存（下次断网可用）
      if (res && res.ok && new URL(req.url).origin === location.origin) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      // 断网兜底：先精确、再忽略查询串；页面请求最后退回首页
      return caches.match(req).then(function (hit) {
        return hit || caches.match(req, { ignoreSearch: true }).then(function (h2) {
          return h2 || (req.mode === 'navigate' ? caches.match('./index.html') : undefined);
        });
      });
    })
  );
});
