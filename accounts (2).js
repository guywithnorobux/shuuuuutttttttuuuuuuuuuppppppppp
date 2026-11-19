'use strict';
/*
  Shuttlemon accounts: usernames + passwords, sessions, and one save blob per account.
  No dependencies. Everything lives in one JSON file at DATA_DIR/accounts.json
  (written atomically, debounced). Passwords are hashed with scrypt and a per-user salt;
  session tokens are random and only their SHA-256 is stored.
*/
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'accounts.json');
const SESSION_DAYS = 60;
const MAX_BODY = 300 * 1024;
const MAX_FIELD = 120 * 1024;

let db = { users: {}, sessions: {} };
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(FILE)) db = Object.assign(db, JSON.parse(fs.readFileSync(FILE, 'utf8')));
} catch (e) { console.error('accounts: could not read', FILE, e.message); }

let timer = null;
function flush() {
  timer = null;
  try {
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, FILE);
  } catch (e) { console.error('accounts: could not write', e.message); }
}
function scheduleWrite() { if (!timer) { timer = setTimeout(flush, 800); timer.unref(); } }
function flushNow() { if (timer) { clearTimeout(timer); } flush(); }

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
function hashPw(pw, salt) { return crypto.scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex'); }
function validName(n) { return typeof n === 'string' && /^[A-Za-z0-9_]{3,16}$/.test(n); }
function validPw(p) { return typeof p === 'string' && p.length >= 6 && p.length <= 100; }

/* crude brute-force limiter: 12 failures per 10 minutes per IP */
const fails = new Map();
function tooMany(ip) {
  const now = Date.now(), a = (fails.get(ip) || []).filter((t) => now - t < 600000);
  fails.set(ip, a);
  return a.length >= 12;
}
function noteFail(ip) { const a = fails.get(ip) || []; a.push(Date.now()); fails.set(ip, a); }

function newSession(userKey) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[sha(token)] = { user: userKey, exp: Date.now() + SESSION_DAYS * 86400000 };
  const keys = Object.keys(db.sessions);
  if (keys.length > 5000) { // prune expired
    const now = Date.now();
    keys.forEach((k) => { if (db.sessions[k].exp < now) delete db.sessions[k]; });
  }
  scheduleWrite();
  return token;
}
function userFromReq(req) {
  const h = String(req.headers.authorization || '');
  const m = /^Bearer ([0-9a-f]{64})$/.exec(h);
  if (!m) return null;
  const s = db.sessions[sha(m[1])];
  if (!s || s.exp < Date.now()) return null;
  const u = db.users[s.user];
  return u ? { key: s.user, u, token: m[1] } : null;
}
function readBody(req, cb) {
  let size = 0; const chunks = []; let done = false;
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_BODY) { if (!done) { done = true; cb(new Error('too big')); } req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    if (done) return; done = true;
    try { cb(null, JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { cb(new Error('bad json')); }
  });
  req.on('error', () => { if (!done) { done = true; cb(new Error('read')); } });
}
function cleanData(d) {
  if (!d || typeof d !== 'object') return null;
  const out = {};
  for (const k of ['save', 'forage']) {
    if (d[k] == null) continue;
    if (typeof d[k] !== 'string' || d[k].length > MAX_FIELD) return null;
    try { JSON.parse(d[k]); } catch (e) { return null; }
    out[k] = d[k];
  }
  return out;
}
function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

/* returns true when it handled the request */
function handle(req, res, pathname) {
  if (!pathname.startsWith('/api/')) return false;
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (pathname === '/api/ping') { send(res, 200, { ok: true, accounts: true }); return true; }

  if (pathname === '/api/me' && req.method === 'GET') {
    const a = userFromReq(req);
    if (!a) { send(res, 401, { error: 'Please sign in again.' }); return true; }
    send(res, 200, { user: a.u.name, data: a.u.data || {}, updated: a.u.updated || 0 });
    return true;
  }
  if (req.method !== 'POST' && req.method !== 'PUT') { send(res, 405, { error: 'Method not allowed' }); return true; }

  readBody(req, (err, body) => {
    if (err) { send(res, 400, { error: 'Bad request' }); return; }
    if (pathname === '/api/register' || pathname === '/api/login') {
      if (tooMany(ip)) { send(res, 429, { error: 'Too many attempts. Wait a few minutes and try again.' }); return; }
      const name = body.username, pw = body.password;
      if (!validName(name)) { send(res, 400, { error: 'Username must be 3–16 letters, numbers or underscores.' }); return; }
      if (!validPw(pw)) { send(res, 400, { error: 'Password must be at least 6 characters.' }); return; }
      const key = name.toLowerCase();
      if (pathname === '/api/register') {
        if (db.users[key]) { send(res, 409, { error: 'That username is taken.' }); return; }
        if (Object.keys(db.users).length >= 20000) { send(res, 503, { error: 'Sign-ups are closed right now.' }); return; }
        const salt = crypto.randomBytes(16).toString('hex');
        db.users[key] = { name, salt, hash: hashPw(pw, salt), created: Date.now(), updated: 0, data: cleanData(body.data) || {} };
        const token = newSession(key);
        flushNow();
        send(res, 200, { token, user: name, data: db.users[key].data, updated: db.users[key].updated });
        return;
      }
      const u = db.users[key];
      const ok = u && crypto.timingSafeEqual(Buffer.from(hashPw(pw, u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
      if (!ok) { noteFail(ip); send(res, 401, { error: 'Wrong username or password.' }); return; }
      const token = newSession(key);
      send(res, 200, { token, user: u.name, data: u.data || {}, updated: u.updated || 0 });
      return;
    }
    const a = userFromReq(req);
    if (!a) { send(res, 401, { error: 'Please sign in again.' }); return; }
    if (pathname === '/api/save') {
      const d = cleanData(body.data);
      if (!d) { send(res, 400, { error: 'Bad save data' }); return; }
      a.u.data = Object.assign({}, a.u.data || {}, d);
      a.u.updated = Date.now();
      scheduleWrite();
      send(res, 200, { ok: true, updated: a.u.updated });
      return;
    }
    if (pathname === '/api/logout') {
      delete db.sessions[sha(a.token)];
      scheduleWrite();
      send(res, 200, { ok: true });
      return;
    }
    send(res, 404, { error: 'Not found' });
  });
  return true;
}

module.exports = { handle, flushNow, DATA_DIR };
