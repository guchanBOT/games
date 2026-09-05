/* 游戏大厅离线缓存（缓存优先 + 后台更新）：
   开门先用本机缓存 → 断网或平台风控（"风险提醒"/强制下载）都能正常玩；
   后台悄悄拉新版，只有 resp.ok 才更新缓存（风控 404 不会污染缓存），下次打开自动用新版。
   只有首次使用、或设备缓存被清时才必须联网成功一次。 */
var CACHE = 'lobby-v7';
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
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      // 后台拉新版：成功才更新缓存；失败（断网/风控 404）静默丢弃
      var net = fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return null; });
      if (hit) {   // 有缓存：立即用缓存开门，本次不碰网络结果
        e.waitUntil(net.then(function () {}));
        return hit;
      }
      // 无缓存（首次/缓存被清）：只能走网络
      return net.then(function (res) {
        if (res) return res;
        return caches.match('./index.html').then(function (home) {
          return home || new Response('当前无网络，且本机还没有缓存，请联网后重试', {
            status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        });
      });
    })
  );
});
