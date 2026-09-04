/* cloud-account.js —— 孩子游戏站"按账号的云进度"客户端（配合云端 kids-api 后端）
 *
 * 职责：
 *  - 当前账号：本地同步可读（localStorage kid_current），页面启动立刻能用，不依赖网络
 *  - 命名空间：已登录时游戏 key 落在 ka/<uid>/<game>/…，未登录回落到原 key（旧行为，纯本地）
 *  - 登录/登出/切换；云端读档(pull)/存档(touch→防抖 push)
 *  - 迁移：首次登录的账号自动收走本设备旧的无前缀进度（全局只发生一次，旧进度归第一个登录的账号）
 *  - 断网/后端不可达：全部静默降级为"仅本地"，游戏照常玩
 *
 * 游戏接入只需四件事：
 *  1) <script src="/js/cloud-account.js"></script>（放游戏主体脚本之前）
 *  2) 所有本地读写的 key 换成 KidAcct.key(game, k)
 *  3) 每次写入后调 KidAcct.touch(game)
 *  4) 启动时 KidAcct.ready(game, applyFn) —— 从云端拉最新并刷新界面
 */
(function (w) {
  'use strict';
  // 后端 = 云函数 kids-api（调函数网关）。孩子设备绿网白名单需加：*.tcb-api.tencentcloudapi.com
  var API = 'https://dudu-d5ggdwobce3add3f0-1300661794.ap-shanghai.tcb-api.tencentcloudapi.com/web';
  var FN = 'kids-api';
  var LS_CUR = 'kid_current';      // 当前账号
  var LS_MIG = 'ka_migrated_v1';   // 旧进度迁移标记（全局一次）
  var META = '__meta';             // 命名空间内最后写入时间戳 key

  function ls() { try { return w.localStorage; } catch (e) { return null; } }
  function cur() {
    var s = ls(); if (!s) return null;
    try { var j = s.getItem(LS_CUR); return j ? JSON.parse(j) : null; } catch (e) { return null; }
  }
  function uid() { var c = cur(); return c && c.id ? String(c.id) : null; }
  function ns(game) { var u = uid(); return u ? ('ka/' + u + '/' + game + '/') : ''; }
  function key(game, k) { return ns(game) + k; }   // 未登录 ns='' → 原 key

  function apiPost(data, timeout) {
    var t = timeout || 6000;
    var p = new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', API, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = function () {
        var j = null; try { j = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status >= 200 && xhr.status < 300 && j && j.ok !== undefined) resolve(j);
        else reject(new Error('api ' + xhr.status));
      };
      xhr.onerror = function () { reject(new Error('network')); };
      xhr.ontimeout = function () { reject(new Error('timeout')); };
      xhr.timeout = t;
      xhr.send(JSON.stringify(data));
    });
    return p;
  }
  // XHR 跨域：kids-api 已返回 CORS 头；timeout 用 xhr.timeout，无需 AbortController

  // ---- 本地命名空间 dump / apply ----
  function dumpNs(game) {
    var s = ls(), p = ns(game); if (!s || !p) return null;
    var o = {}, meta = 0, i;
    for (i = 0; i < s.length; i++) {
      var k = s.key(i);
      if (k && k.indexOf(p) === 0) {
        var raw = s.getItem(k), short = k.slice(p.length);
        if (short === META) meta = Number(raw) || 0; else o[short] = raw;
      }
    }
    return { state: o, meta: meta };
  }

  // ---- 存档（防抖） ----
  var dirty = {}, timer = null;
  function touch(game) {
    dirty[game] = 1;
    if (timer) return;
    timer = setTimeout(function () {
      timer = null;
      var gs = Object.keys(dirty); dirty = {};
      gs.forEach(pushNow);
    }, 1500);
  }
  function pushNow(game) {
    var c = cur(); if (!c || !c.token) return;
    var d = dumpNs(game); if (!d) return;
    var s = ls(); s.setItem(ns(game) + META, String(Date.now()));
    return apiPost({ action: 'save', token: c.token, game: game, state: d.state })
      .catch(function () { /* 离线/后端不可达：静默 */ });
  }

  // ---- 读档 ----
  // ready(game, applyFn)：登录过→从云端拉；云端更新则写回本命名空间并调 applyFn() 刷新界面
  function ready(game, applyFn) {
    var c = cur();
    if (c && c.token) {
      apiPost({ action: 'load', token: c.token, game: game })
        .then(function (r) {
          if (!r.ok || !r.state) return;
          var d = dumpNs(game);
          if (r.updatedAtMs && d && d.meta && d.meta > r.updatedAtMs) return; // 本地更新
          var s = ls(), p = ns(game), k;
          for (k in r.state) {
            var nv = String(r.state[k]);
            // 每日限时是"单调累计"：取较大的那个，避免一台设备的旧值覆盖另一台的已用时长（时间锁被重置）
            if (k === 't2048secs' || k.indexOf('cm_time_') === 0) {
              var cv = s.getItem(p + k);
              if (cv !== null && parseInt(nv, 10) <= parseInt(cv, 10)) continue;
            }
            s.setItem(p + k, nv);
          }
          s.setItem(p + META, String(r.updatedAtMs || Date.now()));
          if (applyFn) { try { applyFn(); } catch (e) {} }
        }).catch(function () {});
    }
  }

  // ---- 迁移旧进度（全局一次，归第一个登录账号） ----
  var LEGACY_2048 = ['best2048', 'coins2048', 'sound2048', 't2048secs', 't2048date'];
  function migrate() {
    var s = ls(), u = uid(); if (!s || !u || s.getItem(LS_MIG)) return;
    var p2048 = 'ka/' + u + '/2048/', pcm = 'ka/' + u + '/cm/', k;
    var moved = false;
    for (var i = 0; i < LEGACY_2048.length; i++) {
      k = LEGACY_2048[i];
      var v = s.getItem(k);
      if (v !== null && s.getItem(p2048 + k) === null) { s.setItem(p2048 + k, v); moved = true; }
    }
    // 归零标记沿用：正式版已是 w2，新账号预置 w2 防止误触发清零
    s.setItem(p2048 + '__wipe2048', s.getItem('__wipe2048') || 'w2');
    // cm_* 全部旧 key
    var cmKeys = [];
    for (i = 0; i < s.length; i++) { var kk = s.key(i); if (kk && kk.indexOf('cm_') === 0) cmKeys.push(kk); }
    if (cmKeys.length) {
      cmKeys.forEach(function (kk) { if (s.getItem(pcm + kk) === null) s.setItem(pcm + kk, s.getItem(kk)); });
      moved = true;
    }
    // 清掉旧无前缀 key（游客态不再读它们）
    cmKeys.forEach(function (kk) { s.removeItem(kk); });
    for (i = 0; i < LEGACY_2048.length; i++) s.removeItem(LEGACY_2048[i]);
    s.removeItem('__wipe2048');
    s.setItem(LS_MIG, '1');
    if (moved) { touch('2048'); touch('cm'); }
  }

  // ---- 登录 / 登出 / 状态 ----
  function login(name, password) {
    return apiPost({ action: 'login', name: name, password: password })
      .then(function (r) {
        if (r.ok) {
          ls().setItem(LS_CUR, JSON.stringify({ token: r.token, id: String(r.id), name: r.name, nickname: r.nickname }));
          migrate();
          fire();
          return { ok: true };
        }
        return { ok: false, msg: r.msg };
      })
      .catch(function () { return { ok: false, msg: '网络不通，连不上云端' }; });
  }
  function logout() { var s = ls(); if (s) s.removeItem(LS_CUR); fire(); }

  // ---- 通知 ----
  var subs = [];
  function onChange(fn) { if (fn) subs.push(fn); }
  function fire() { subs.forEach(function (f) { try { f(cur()); } catch (e) {} }); }

  w.KidAcct = {
    API: API,
    current: cur, uid: uid, key: key,
    login: login, logout: logout, onChange: onChange,
    touch: touch, pushNow: pushNow, ready: ready, migrate: migrate,
    dump: dumpNs
  };
})(window);
