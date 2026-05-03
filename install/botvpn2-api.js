'use strict';

const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');

const PORTS = String(process.env.PORTS || process.env.PORT || '5889,5888')
  .split(',').map(x => Number(x.trim())).filter(Boolean);
const CONFIG_DIR = '/etc/botvpn2-api';
const TOKEN_FILE = `${CONFIG_DIR}/token`;
const LOG_FILE = '/var/log/botvpn2-api.log';
const PATH_ENV = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

function readFile(path, fallback = '') { try { return fs.readFileSync(path, 'utf8').trim(); } catch (_) { return fallback; } }
function appendLog(line) { try { fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${line}\n`); } catch (_) {} }
function getToken() { return readFile(TOKEN_FILE, process.env.BOTVPN2_AUTH || ''); }
function getDomain() { return readFile('/etc/xray/domain', readFile('/root/domain', readFile('/var/lib/ipvps.conf', 'localhost').replace(/^IP=/, '')) || 'localhost'); }
function getNs() { return readFile('/etc/xray/dns', readFile('/etc/xray/slwdomain', '-')); }
function getPubKey() { return readFile('/etc/slowdns/server.pub', readFile('/etc/slowdns/server.pubkey', '-')); }
function getIsp() { return readFile('/etc/xray/isp', '-'); }
function getCity() { return readFile('/etc/xray/city', '-'); }
function b64(s) { return Buffer.from(String(s)).toString('base64'); }
function nowTime() { return new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false }); }
function dateAdd(days) { const n = Number(days || 0); const d = new Date(Date.now() + (Number.isFinite(n) ? n : 0) * 86400000); return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }).replace(/ /g, ' '); }

function send(res, httpCode, body) {
  const data = JSON.stringify(body);
  res.writeHead(httpCode, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
  res.end(data);
}
function ok(res, data, message = 'OK') { return send(res, 200, { status: 'success', meta: { code: 200, message }, data }); }
function fail(res, message, code = 400) { return send(res, 200, { status: 'error', meta: { code, message }, message }); }

function cleanUser(v, fallback = '') {
  v = String(v == null || v === '' ? fallback : v).trim();
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(v)) throw new Error('Username hanya boleh huruf, angka, underscore, strip, maksimal 32 karakter');
  return v;
}
function cleanText(v, fallback = '') { v = String(v == null || v === '' ? fallback : v).trim(); return v.replace(/[\r\n]/g, '').slice(0, 96); }
function cleanNum(v, fallback = '0') { v = String(v == null || v === '' ? fallback : v).trim(); if (!/^\d+$/.test(v)) throw new Error('Parameter angka tidak valid'); return v; }

function cmdExists(cmd) {
  for (const p of PATH_ENV.split(':')) {
    const full = `${p}/${cmd}`;
    try { fs.accessSync(full, fs.constants.X_OK); return full; } catch (_) {}
  }
  return null;
}

function runInteractive(commandName, inputs, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const command = cmdExists(commandName);
    if (!command) return resolve({ ok: false, code: 127, output: `Command tidak ditemukan: ${commandName}` });
    const child = spawn(command, [], { shell: false, env: Object.assign({}, process.env, { TERM: 'xterm', PATH: PATH_ENV }) });
    let output = '';
    let done = false;
    const finish = (obj) => { if (done) return; done = true; clearTimeout(timer); resolve(obj); };
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} finish({ ok: false, code: 124, output: output + '\nTimeout menjalankan script' }); }, timeoutMs);
    child.stdout.on('data', d => { output += d.toString(); });
    child.stderr.on('data', d => { output += d.toString(); });
    child.on('error', err => finish({ ok: false, code: 1, output: err.message }));
    child.on('close', code => finish({ ok: code === 0, code, output }));
    child.stdin.write(inputs.join('\n') + '\n');
    child.stdin.end();
  });
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); if (body.length > 100000) req.destroy(); });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try { return resolve(JSON.parse(body)); } catch (_) {}
      const params = new URLSearchParams(body);
      const obj = {}; for (const [k, v] of params.entries()) obj[k] = v;
      resolve(obj);
    });
  });
}
function pick(q, body, names, fallback = '') { for (const n of names) { const v = body[n] != null ? body[n] : q.get(n); if (v != null && String(v) !== '') return v; } return fallback; }

function getUuid(user) {
  const cfg = readFile('/etc/xray/config.json', '');
  if (cfg) {
    const idx = cfg.indexOf(`"email": "${user}"`);
    const area = idx >= 0 ? cfg.slice(Math.max(0, idx - 350), idx + 120) : cfg;
    const m = area.match(/"(?:id|password)"\s*:\s*"([^"]+)"/);
    if (m) return m[1];
  }
  return crypto.randomUUID();
}
function linkBundle(kind, user, uuid, host) {
  const path = {
    vmess: '/vmess', vless: '/vless', trojan: '/trojan-ws', shadowsocks: '/shadowsocks'
  }[kind] || `/${kind}`;
  const grpcName = { vmess: 'vmess-grpc', vless: 'vless-grpc', trojan: 'trojan-grpc', shadowsocks: 'shadowsocks-grpc' }[kind] || `${kind}-grpc`;
  if (kind === 'vmess') {
    return {
      tls: `vmess://${b64(JSON.stringify({ v:'2', ps:user, add:host, port:'443', id:uuid, aid:'0', net:'ws', path, type:'none', host, tls:'tls' }))}`,
      none: `vmess://${b64(JSON.stringify({ v:'2', ps:user, add:host, port:'80', id:uuid, aid:'0', net:'ws', path, type:'none', host, tls:'none' }))}`,
      grpc: `vmess://${b64(JSON.stringify({ v:'2', ps:user, add:host, port:'443', id:uuid, aid:'0', net:'grpc', path:grpcName, type:'none', host, tls:'tls' }))}`,
      uptls: `vmess://${b64(JSON.stringify({ v:'2', ps:user, add:host, port:'443', id:uuid, aid:'0', net:'ws', path:'/whatever', type:'none', host, tls:'tls' }))}`,
      upntls: `vmess://${b64(JSON.stringify({ v:'2', ps:user, add:host, port:'80', id:uuid, aid:'0', net:'ws', path:'/whatever', type:'none', host, tls:'none' }))}`
    };
  }
  if (kind === 'vless') {
    return {
      tls: `vless://${uuid}@${host}:443?path=${encodeURIComponent(path)}&security=tls&encryption=none&type=ws&sni=${host}#${user}`,
      none: `vless://${uuid}@${host}:80?path=${encodeURIComponent(path)}&security=none&encryption=none&type=ws&host=${host}#${user}`,
      grpc: `vless://${uuid}@${host}:443?mode=gun&security=tls&encryption=none&type=grpc&serviceName=${grpcName}&sni=${host}#${user}`,
      uptls: `vless://${uuid}@${host}:443?path=%2Fwhatever&security=tls&encryption=none&type=ws&sni=${host}#${user}`,
      upntls: `vless://${uuid}@${host}:80?path=%2Fwhatever&security=none&encryption=none&type=ws&host=${host}#${user}`
    };
  }
  if (kind === 'trojan') {
    return {
      tls: `trojan://${uuid}@${host}:443?path=${encodeURIComponent(path)}&security=tls&type=ws&host=${host}&sni=${host}#${user}`,
      none: `trojan://${uuid}@${host}:80?path=${encodeURIComponent(path)}&security=none&type=ws&host=${host}#${user}`,
      grpc: `trojan://${uuid}@${host}:443?mode=gun&security=tls&type=grpc&serviceName=${grpcName}&sni=${host}#${user}`,
      uptls: `trojan://${uuid}@${host}:443?path=%2Fwhatever&security=tls&type=ws&host=${host}&sni=${host}#${user}`
    };
  }
  return {};
}
function ssLinks(user, uuid, host) {
  const enc = b64(`aes-128-gcm:${uuid}`);
  return {
    ss_link_ws: `ss://${enc}@${host}:443?path=%2Fshadowsocks&security=tls&type=ws&host=${host}&sni=${host}#${user}`,
    ss_link_grpc: `ss://${enc}@${host}:443?mode=gun&security=tls&type=grpc&serviceName=shadowsocks-grpc&sni=${host}#${user}`,
    ss_link_nontls: `ss://${enc}@${host}:80?path=%2Fshadowsocks&security=none&type=ws&host=${host}#${user}`
  };
}
function xrayData(kind, user, exp, quota, limitip) {
  const host = getDomain();
  const uuid = getUuid(user);
  return {
    username: user,
    hostname: host,
    domain: host,
    uuid,
    expired: dateAdd(exp),
    exp: dateAdd(exp),
    time: nowTime(),
    quota: String(quota),
    limitip: String(limitip),
    ip_limit: String(limitip),
    ISP: getIsp(), CITY: getCity(), pubkey: getPubKey(), ns_domain: getNs(),
    port: { tls: '443', none: '80', any: '443,80', ovpntcp: '1194', ovpnudp: '2200', sshohp: '8181', udpcustom: '1-65535' },
    path: { stn: `/${kind}`, multi: `/${kind}`, grpc: `${kind}-grpc`, up: '/whatever' },
    link: linkBundle(kind, user, uuid, host)
  };
}
function sshData(user, pass, exp, limitip) {
  const host = getDomain();
  return {
    username: user, password: pass || user, hostname: host, domain: host,
    exp: dateAdd(exp), expired: dateAdd(exp), time: nowTime(), limitip: String(limitip), ip_limit: String(limitip),
    ISP: getIsp(), CITY: getCity(), pubkey: getPubKey(), ns_domain: getNs(),
    port: { tls: '443', none: '80', ovpntcp: '1194', ovpnudp: '2200', sshohp: '8181', udpcustom: '1-65535' }
  };
}

async function create(kind, p, isTrial = false) {
  const user = isTrial ? `trial${Math.floor(1000 + Math.random() * 9000)}` : cleanUser(p.user || p.username);
  const exp = cleanNum(p.exp || p.expired, isTrial ? '1' : '30');
  const quota = cleanNum(p.quota || p.kuota, '0');
  const limitip = cleanNum(p.iplimit || p.limitip, '0');
  const pass = cleanText(p.password, user);
  let command, inputs;
  if (kind === 'ssh') { command = isTrial ? 'bot-trial-ssh' : 'bot-add-ssh'; inputs = isTrial ? ['180'] : [user, pass, limitip, exp]; }
  else if (kind === 'vmess') { command = isTrial ? 'bot-trial-vme' : 'bot-add-vme'; inputs = isTrial ? ['180'] : [user, quota, limitip, exp]; }
  else if (kind === 'vless') { command = isTrial ? 'bot-trial-vle' : 'bot-add-vle'; inputs = isTrial ? ['180'] : [user, quota, limitip, exp]; }
  else if (kind === 'trojan') { command = isTrial ? 'bot-trial-tro' : 'bot-add-tro'; inputs = isTrial ? ['180'] : [user, quota, limitip, exp]; }
  else if (kind === 'shadowsocks') { command = isTrial ? 'trialss' : 'addss'; inputs = isTrial ? [] : [user, exp, quota]; }
  else throw new Error('Tipe akun tidak didukung');
  const r = await runInteractive(command, inputs);
  appendLog(`${command} ${user} code=${r.code}`);
  if (!r.ok) throw new Error(r.output.split('\n').slice(-6).join(' ').trim() || 'Gagal menjalankan script');
  if (kind === 'ssh') return Object.assign(sshData(user, pass, exp, limitip), { output: r.output.slice(-1500) });
  if (kind === 'shadowsocks') return Object.assign({ username: user, domain: getDomain(), ns_domain: getNs(), pubkey: getPubKey(), expired: dateAdd(exp), quota: `${quota} GB`, ip_limit: String(limitip), limitip: String(limitip) }, ssLinks(user, getUuid(user), getDomain()), { output: r.output.slice(-1500) });
  return Object.assign(xrayData(kind, user, exp, quota, limitip), { output: r.output.slice(-1500) });
}
async function renew(kind, user, exp, p) {
  user = cleanUser(user);
  exp = cleanNum(exp || p.exp || p.expired, '30');
  const quota = cleanNum(p.quota || p.kuota, '0');
  const limitip = cleanNum(p.iplimit || p.limitip, '0');
  let command, inputs;
  if (kind === 'ssh') { command = 'bot-renew-ssh'; inputs = [user, exp]; }
  else if (kind === 'vmess') { command = 'bot-renew-vme'; inputs = [user, exp, quota, limitip]; }
  else if (kind === 'vless') { command = 'bot-renew-vle'; inputs = [user, exp, quota, limitip]; }
  else if (kind === 'trojan') { command = 'bot-renew-tro'; inputs = [user, exp, quota, limitip]; }
  else if (kind === 'shadowsocks') { command = 'renewss'; inputs = [user, exp]; }
  else throw new Error('Tipe akun tidak didukung');
  const r = await runInteractive(command, inputs);
  appendLog(`${command} ${user} code=${r.code}`);
  if (!r.ok) throw new Error(r.output.split('\n').slice(-6).join(' ').trim() || 'Gagal menjalankan script');
  return { username: user, hostname: getDomain(), domain: getDomain(), from: nowTime(), to: dateAdd(exp), exp: dateAdd(exp), quota: String(quota), limitip: String(limitip), ip_limit: String(limitip), output: r.output.slice(-1500) };
}
async function oneUserAction(action, kind, user, p) {
  user = cleanUser(user || p.user || p.username);
  const map = {
    delete: { ssh:'bot-del-ssh', vmess:'bot-del-vme', vless:'bot-del-vle', trojan:'bot-del-tro', shadowsocks:'delss' },
    lock: { ssh:'bot-lock', vmess:'bot-lock-vm', vless:'bot-lock-vl', trojan:'bot-lock-tr' },
    unlock: { ssh:'bot-unlock', vmess:'bot-unlock-vm', vless:'bot-unlock-vl', trojan:'bot-unlock-tr' }
  };
  const cmd = map[action] && map[action][kind];
  if (!cmd) return { username: user, hostname: getDomain(), domain: getDomain(), message: `${action} ${kind} tidak tersedia di v7` };
  const r = await runInteractive(cmd, [user]);
  appendLog(`${cmd} ${user} code=${r.code}`);
  if (!r.ok) throw new Error(r.output.split('\n').slice(-6).join(' ').trim() || 'Gagal menjalankan script');
  return { username: user, hostname: getDomain(), domain: getDomain(), message: `${action} ${kind} success`, output: r.output.slice(-1200) };
}
async function changeIp(kind, user, limitip) {
  return { username: cleanUser(user), hostname: getDomain(), domain: getDomain(), limitip: cleanNum(limitip, '0'), ip_limit: cleanNum(limitip, '0'), message: 'Limit IP diterima. Jika script v7 belum punya command change IP, nilai ini tidak mengubah file limit lama.' };
}
function checkConfig(kind, user) {
  user = cleanUser(user);
  const data = kind === 'ssh' ? sshData(user, user, 30, 0) : xrayData(kind, user, 30, 0);
  return Object.assign(data, { message: 'Config berhasil dibaca/dibuat ulang dari data VPS' });
}

function matchRoute(pathname) {
  const routes = [
    [/^\/vps\/sshvpn$/, 'create', 'ssh'], [/^\/vps\/vmessall$/, 'create', 'vmess'], [/^\/vps\/vlessall$/, 'create', 'vless'], [/^\/vps\/trojanall$/, 'create', 'trojan'],
    [/^\/vps\/trialsshvpn$/, 'trial', 'ssh'], [/^\/vps\/trialvmessall$/, 'trial', 'vmess'], [/^\/vps\/trialvlessall$/, 'trial', 'vless'], [/^\/vps\/trialtrojanall$/, 'trial', 'trojan'],
    [/^\/vps\/renewsshvpn\/([^/]+)\/([0-9]+)$/, 'renew', 'ssh'], [/^\/vps\/renewvmess\/([^/]+)\/([0-9]+)$/, 'renew', 'vmess'], [/^\/vps\/renewvless\/([^/]+)\/([0-9]+)$/, 'renew', 'vless'], [/^\/vps\/renewtrojan\/([^/]+)\/([0-9]+)$/, 'renew', 'trojan'],
    [/^\/vps\/deletesshvpn\/([^/]+)$/, 'delete', 'ssh'], [/^\/vps\/deletevmess\/([^/]+)$/, 'delete', 'vmess'], [/^\/vps\/deletevless\/([^/]+)$/, 'delete', 'vless'], [/^\/vps\/deletetrojan\/([^/]+)$/, 'delete', 'trojan'],
    [/^\/vps\/locksshvpn\/([^/]+)$/, 'lock', 'ssh'], [/^\/vps\/lockvmess\/([^/]+)$/, 'lock', 'vmess'], [/^\/vps\/lockvless\/([^/]+)$/, 'lock', 'vless'], [/^\/vps\/locktrojan\/([^/]+)$/, 'lock', 'trojan'],
    [/^\/vps\/unlocksshvpn\/([^/]+)$/, 'unlock', 'ssh'], [/^\/vps\/unlockvmess\/([^/]+)$/, 'unlock', 'vmess'], [/^\/vps\/unlockvless\/([^/]+)$/, 'unlock', 'vless'], [/^\/vps\/unlocktrojan\/([^/]+)$/, 'unlock', 'trojan'],
    [/^\/vps\/changelimipsshvpn$/, 'changeip', 'ssh'], [/^\/vps\/changelimipvmess$/, 'changeip', 'vmess'], [/^\/vps\/changelimipvless$/, 'changeip', 'vless'], [/^\/vps\/changelimiptrojan$/, 'changeip', 'trojan'],
    [/^\/vps\/checkconfigsshvpn\/([^/]+)$/, 'check', 'ssh'], [/^\/vps\/checkconfigvmess\/([^/]+)$/, 'check', 'vmess'], [/^\/vps\/checkconfigvless\/([^/]+)$/, 'check', 'vless'], [/^\/vps\/checkconfigtrojan\/([^/]+)$/, 'check', 'trojan'],
    [/^\/createssh$/, 'create', 'ssh'], [/^\/createvmess$/, 'create', 'vmess'], [/^\/createvless$/, 'create', 'vless'], [/^\/createtrojan$/, 'create', 'trojan'], [/^\/createshadowsocks$/, 'create', 'shadowsocks'],
    [/^\/trialssh$/, 'trial', 'ssh'], [/^\/trialvmess$/, 'trial', 'vmess'], [/^\/trialvless$/, 'trial', 'vless'], [/^\/trialtrojan$/, 'trial', 'trojan'], [/^\/trialshadowsocks$/, 'trial', 'shadowsocks'],
    [/^\/renewssh$/, 'renew_query', 'ssh'], [/^\/renewvmess$/, 'renew_query', 'vmess'], [/^\/renewvless$/, 'renew_query', 'vless'], [/^\/renewtrojan$/, 'renew_query', 'trojan'], [/^\/renewshadowsocks$/, 'renew_query', 'shadowsocks']
  ];
  for (const [re, action, kind] of routes) { const m = pathname.match(re); if (m) return { action, kind, args: m.slice(1) }; }
  return null;
}

async function handler(req, res) {
  try {
    const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (u.pathname === '/' || u.pathname === '/status') return ok(res, { port: PORTS, domain: getDomain(), path: 'BotVPN API v7 aktif' });
    const route = matchRoute(u.pathname);
    if (!route) return fail(res, 'Endpoint tidak ditemukan', 404);
    const t = getToken();
    const auth = req.headers.authorization || u.searchParams.get('auth') || '';
    if (!t || auth !== t) return fail(res, 'Authorization/Auth token salah', 401);
    const body = await parseBody(req);
    const p = {
      user: pick(u.searchParams, body, ['user', 'username']),
      username: pick(u.searchParams, body, ['username', 'user']),
      password: pick(u.searchParams, body, ['password', 'pass']),
      exp: pick(u.searchParams, body, ['exp', 'expired', 'days']),
      expired: pick(u.searchParams, body, ['expired', 'exp', 'days']),
      quota: pick(u.searchParams, body, ['quota', 'kuota']),
      kuota: pick(u.searchParams, body, ['kuota', 'quota']),
      iplimit: pick(u.searchParams, body, ['iplimit', 'limitip']),
      limitip: pick(u.searchParams, body, ['limitip', 'iplimit'])
    };
    let data;
    if (route.action === 'create') data = await create(route.kind, p, false);
    else if (route.action === 'trial') data = await create(route.kind, p, true);
    else if (route.action === 'renew') data = await renew(route.kind, route.args[0], route.args[1], p);
    else if (route.action === 'renew_query') data = await renew(route.kind, p.user || p.username, p.exp || p.expired, p);
    else if (['delete', 'lock', 'unlock'].includes(route.action)) data = await oneUserAction(route.action, route.kind, route.args[0], p);
    else if (route.action === 'changeip') data = await changeIp(route.kind, p.user || p.username, p.iplimit || p.limitip);
    else if (route.action === 'check') data = checkConfig(route.kind, route.args[0]);
    else throw new Error('Route tidak valid');
    return ok(res, data);
  } catch (err) {
    appendLog(`ERROR ${req.method} ${req.url} ${err.stack || err.message}`);
    return fail(res, err.message || 'Internal error', 500);
  }
}

for (const port of PORTS) {
  http.createServer(handler).listen(port, '0.0.0.0', () => appendLog(`BotVPN API listen ${port}`));
}
