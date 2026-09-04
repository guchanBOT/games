/* 离线缓存（网络优先）：有网时永远拿最新版，断网才用缓存。
   版本号由 bump-version.sh 统一管理（count-master <part>），
   改游戏代码后跑一下脚本再部署，缓存名变化会清掉旧缓存。 */
var CACHE = 'countmaster-v1.0.4';
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
        // 规范：只清本游戏的历史缓存，不误删大厅或其它游戏的缓存
        return k.indexOf('countmaster-') === 0 && k !== CACHE ? caches.delete(k) : null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  e.respondWith(
    fetch(e.request).then(function (resp) {
      // 拿到新响应就顺手更新缓存（只缓存 GET 成功响应）
      if (e.request.method === 'GET' && resp && resp.status === 200) {
        var copy = resp.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return resp;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true });
    })
  );
});
