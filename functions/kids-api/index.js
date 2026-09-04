// kids-api：孩子游戏站云端存档后端（登录 / 读档 / 存档）
// 通过 CloudBase HTTP 网关 /api 触发（Event 型云函数）。
// 数据库走腾讯云 ExecutePGSql（云函数平台自动注入的临时密钥，函数内不带任何明文密钥）。
// 账号自建在 public.accounts / public.saves（用 ExecutePGSql + cloudbase_admin 角色管理）。
// 无第三方依赖；子账号密码用 scrypt 加盐哈希；会话 token 为 HMAC 自签（TOKEN_SECRET 环境变量）。
'use strict';
const https = require('https');
const crypto = require('crypto');

const sh = s => crypto.createHash('sha256').update(s).digest('hex');
const hm = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
const ENV_ID = process.env.TCB_ENV_ID || 'dudu-d5ggdwobce3add3f0';
const SECRET = process.env.TOKEN_SECRET || 'dev-secret-change-me';
const ROLE = 'cloudbase_admin';   // 库 owner 角色，全权读写 public.accounts / public.saves
const TOKEN_TTL = 30 * 24 * 3600 * 1000;
const GAMES = { 2048: 1, cm: 1 };

// ---------- 腾讯云 ExecutePGSql（TC3 签名，token 不进签名串） ----------
function pgExec(sql) {
  const sid = process.env.TENCENTCLOUD_SECRETID, sk = process.env.TENCENTCLOUD_SECRETKEY,
        tk = process.env.TENCENTCLOUD_SESSIONTOKEN;
  const host = 'tcb.tencentcloudapi.com', service = 'tcb', region = 'ap-shanghai';
  const payload = { EnvId: ENV_ID, Sql: sql, Role: ROLE };
  const body = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000).toString();
  const date = new Date().toISOString().slice(0, 10);
  const ct = 'application/json; charset=utf-8';
  const ch = `content-type:${ct}\nhost:${host}\nx-tc-action:executepgsql\n`;
  const shs = 'content-type;host;x-tc-action';
  const canonicalRequest = `POST\n/\n\n${ch}\n${shs}\n${sh(body)}`;
  const scope = `${date}/${service}/tc3_request`;
  const sts = `TC3-HMAC-SHA256\n${ts}\n${scope}\n${sh(canonicalRequest)}`;
  const sig = crypto.createHmac('sha256', hm(hm(hm('TC3' + sk, date), service), 'tc3_request')).update(sts).digest('hex');
  const headers = {
    'Content-Type': ct, 'X-TC-Action': 'ExecutePGSql', 'X-TC-Version': '2018-06-08',
    'X-TC-Timestamp': ts, 'X-TC-Region': region, 'X-TC-Token': tk,
    'Authorization': `TC3-HMAC-SHA256 Credential=${sid}/${scope}, SignedHeaders=${shs}, Signature=${sig}`
  };
  return new Promise((res, rej) => {
    const req = https.request({ host, path: '/', method: 'POST', headers }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => {
        let j; try { j = JSON.parse(d); } catch (e) { return rej(new Error('bad resp ' + d.slice(0, 120))); }
        if (j.Response && j.Response.Error) return rej(new Error(j.Response.Error.Message));
        res(j.Response);
      });
    });
    req.on('error', rej); req.write(body); req.end();
  });
}
function rowsOf(r) { return (r.Rows || []).map(x => JSON.parse(x)); }

// ---------- 密码 / token ----------
function hashPw(pw, saltHex) { return crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 32).toString('hex'); }
function signToken(payload) {
  const b = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', SECRET).update(b).digest('hex');
  return b + '.' + mac;
}
function verifyToken(tok) {
  if (!tok || typeof tok !== 'string') return null;
  const i = tok.lastIndexOf('.');
  if (i < 0) return null;
  const b = tok.slice(0, i), mac = tok.slice(i + 1);
  const expect = crypto.createHmac('sha256', SECRET).update(b).digest('hex');
  const a = Buffer.from(mac, 'hex'), c = Buffer.from(expect, 'hex');
  if (a.length !== c.length || !crypto.timingSafeEqual(a, c)) return null;
  const p = JSON.parse(Buffer.from(b, 'base64url').toString());
  if (p.exp < Date.now()) return null;
  return p;
}

// ---------- 业务 ----------
function qlit(s) { return `'${String(s).replace(/'/g, "''")}'`; }  // SQL 单引号转义

async function doLogin(body) {
  const name = String(body.name || '').toLowerCase().replace(/[^a-z0-9_\-]/g, '');
  const pw = String(body.password || '');
  if (!name || !pw) return { ok: false, msg: '缺少用户名或密码' };
  const r = await pgExec(`SELECT id, name, nickname, salt, pass_hash FROM public.accounts WHERE name=${qlit(name)} LIMIT 1`);
  const rows = rowsOf(r);
  if (!rows.length) return { ok: false, msg: '用户名或密码不对' };
  const acc = rows[0];
  const h = hashPw(pw, acc.salt);
  if (h !== acc.pass_hash) return { ok: false, msg: '用户名或密码不对' };
  const aid = String(acc.id);
  const token = signToken({ aid, name: acc.name, exp: Date.now() + TOKEN_TTL });
  return { ok: true, token, id: aid, name: acc.name, nickname: acc.nickname };
}

async function doLoad(body) {
  const p = verifyToken(body.token);
  if (!p) return { ok: false, msg: '登录已过期，请重新登录' };
  const g = String(body.game || '');
  if (!GAMES[g]) return { ok: false, msg: '未知游戏' };
  const r = await pgExec(`SELECT state, updated_at FROM public.saves WHERE account_id=${qlit(p.aid)} AND game=${qlit(g)} LIMIT 1`);
  const rows = rowsOf(r);
  if (!rows.length) return { ok: true, state: null };
  const ts = Date.parse(rows[0].updated_at);
  return { ok: true, state: rows[0].state, updatedAtMs: Number.isFinite(ts) ? ts : Date.now() };
}

async function doSave(body) {
  const p = verifyToken(body.token);
  if (!p) return { ok: false, msg: '登录已过期，请重新登录' };
  const g = String(body.game || '');
  if (!GAMES[g]) return { ok: false, msg: '未知游戏' };
  let st;
  try { st = JSON.stringify(body.state); } catch (e) { return { ok: false, msg: '数据格式不对' }; }
  if (st.length > 20000) return { ok: false, msg: '数据太大' };
  await pgExec(`INSERT INTO public.saves(account_id, game, state) VALUES (${qlit(p.aid)}, ${qlit(g)}, ${qlit(st)})
    ON CONFLICT (account_id, game) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`);
  return { ok: true };
}

// ---------- 入口 ----------
exports.main = async (event) => {
  const CORS = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
  if (event && event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  try {
    if (event && event.action === '__ping__') return { statusCode: 200, body: JSON.stringify({ ok: true, keys: Object.keys(event || {}) }) };
    let raw = (event && event.body) || '';
    if (event && event.isBase64Encoded) raw = Buffer.from(raw, 'base64').toString('utf8');
    const body = (typeof raw === 'string' && raw) ? JSON.parse(raw) : {};
    let out;
    switch (body.action) {
      case 'login': out = await doLogin(body); break;
      case 'load': out = await doLoad(body); break;
      case 'save': out = await doSave(body); break;
      default: out = { ok: false, msg: '未知操作' };
    }
    return { statusCode: 200, headers: CORS, body: JSON.stringify(out) };
  } catch (e) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: false, msg: '服务出错：' + (e && e.message) }) };
  }
};
