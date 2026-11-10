// Owner API for snepking.com, called from src/worker.js for /api/* requests.
//
// Needs two things on the Worker:
//   - a KV namespace bound as SITE   (declared in wrangler.jsonc; created automatically on first deploy)
//   - a secret named ADMIN_PASSWORD  (set in the dashboard: Settings > Variables and Secrets)
// Without them the public site still works from the static files; logging in is disabled.
//
// Routes:
//   GET    /api/data              public: the saved gallery data (404 until the first save)
//   POST   /api/login             { password } -> sets the session cookie
//   POST   /api/logout            clears the session cookie
//   GET    /api/admin/me          200 when logged in
//   PUT    /api/admin/data        save the whole gallery (JSON)
//   POST   /api/admin/img         upload one image (raw body, image/* content type) -> { id, url }
//   DELETE /api/admin/img/:id     delete an uploaded image

const COOKIE = 'snep_session';
const FLAG = 'snep_admin'; // readable by the page so it only checks the session when one may exist
const MAX_AGE = 30 * 24 * 3600;
const MAX_IMG = 24 * 1024 * 1024; // KV values max out at 25 MiB
const MAX_DATA = 2 * 1024 * 1024;
const MAX_TRIES = 10; // wrong passwords per IP per hour
const IMG_TYPES = { 'image/jpeg': 1, 'image/png': 1, 'image/gif': 1, 'image/webp': 1, 'image/avif': 1 };

const enc = new TextEncoder();

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}
const fail = (status, error) => json({ error }, status);

function b64u(buf) {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64u(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
async function sessionKey(secret) {
  // Derived from the password, so changing the password logs out every session.
  const raw = await crypto.subtle.digest('SHA-256', enc.encode('snepking-session:' + secret));
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function makeToken(env) {
  const exp = String(Date.now() + MAX_AGE * 1000);
  const sig = await crypto.subtle.sign('HMAC', await sessionKey(env.ADMIN_PASSWORD), enc.encode(exp));
  return exp + '.' + b64u(sig);
}
async function validToken(env, token) {
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || !(Number(exp) > Date.now())) return false;
  try {
    return await crypto.subtle.verify('HMAC', await sessionKey(env.ADMIN_PASSWORD), fromB64u(sig), enc.encode(exp));
  } catch {
    return false;
  }
}
async function samePassword(a, b) {
  // Compare fixed-length digests so the check takes the same time whatever was typed.
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i];
  return d === 0;
}
function cookie(req, name) {
  for (const part of (req.headers.get('Cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}
function sessionCookies(token, maxAge) {
  const h = new Headers();
  h.append('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`);
  h.append('Set-Cookie', `${FLAG}=${maxAge ? '1' : ''}; Path=/; Secure; SameSite=Strict; Max-Age=${maxAge}`);
  return h;
}
const configured = (env) => !!(env.SITE && env.ADMIN_PASSWORD);

async function readLimited(request, limit) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > limit) return null;
  const buf = await request.arrayBuffer();
  return buf.byteLength > limit ? null : buf;
}

async function login(request, env) {
  if (!configured(env)) return fail(503, "Logging in isn't set up on Cloudflare yet.");
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const rlKey = 'rl:' + ip;
  const tries = Number((await env.SITE.get(rlKey)) || 0);
  if (tries >= MAX_TRIES) return fail(429, 'Too many wrong passwords. Wait an hour and try again.');
  let body = {};
  try { body = await request.json(); } catch {}
  const password = typeof body.password === 'string' ? body.password : '';
  if (!password || !(await samePassword(password, env.ADMIN_PASSWORD))) {
    await env.SITE.put(rlKey, String(tries + 1), { expirationTtl: 3600 });
    return fail(401, "That password isn't right.");
  }
  await env.SITE.delete(rlKey);
  const token = await makeToken(env);
  const headers = sessionCookies(token, MAX_AGE);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

function logout() {
  const headers = sessionCookies('', 0);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

function validSite(d) {
  return d && typeof d === 'object' && !Array.isArray(d) && Array.isArray(d.pieces) && Array.isArray(d.genres) && Array.isArray(d.links) && d.profile && typeof d.profile === 'object';
}

async function admin(request, env, rest) {
  if (!configured(env)) return fail(503, "Logging in isn't set up on Cloudflare yet.");
  if (!(await validToken(env, cookie(request, COOKIE)))) return fail(401, "You're logged out. Log in again to make changes.");
  const method = request.method;
  // Writes must come from the site's own script: a custom header can't be sent cross-site without CORS, which this API never allows.
  if (method !== 'GET' && request.headers.get('X-Snep-Admin') !== '1') return fail(403, 'Request refused.');

  if (rest[0] === 'me' && method === 'GET') return json({ ok: true });

  if (rest[0] === 'data' && method === 'PUT') {
    const buf = await readLimited(request, MAX_DATA);
    if (!buf) return fail(413, 'That save is too large.');
    let data;
    try { data = JSON.parse(new TextDecoder().decode(buf)); } catch { return fail(400, "That save wasn't valid."); }
    if (!validSite(data)) return fail(400, "That save wasn't valid.");
    const prev = await env.SITE.get('site');
    if (prev) await env.SITE.put('site:prev', prev); // one-step backup
    await env.SITE.put('site', JSON.stringify(data));
    return json({ ok: true });
  }

  if (rest[0] === 'img' && rest.length === 1 && method === 'POST') {
    const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (!IMG_TYPES[type]) return fail(415, 'Only JPG, PNG, GIF, WebP or AVIF images can be uploaded.');
    const buf = await readLimited(request, MAX_IMG);
    if (!buf) return fail(413, 'That image is over 24 MB.');
    if (!buf.byteLength) return fail(400, 'That image was empty.');
    const id = crypto.randomUUID().replace(/-/g, '');
    await env.SITE.put('img:' + id, buf, { metadata: { type, size: buf.byteLength } });
    return json({ id, url: '/img/' + id, sizeBytes: buf.byteLength, contentType: type });
  }

  if (rest[0] === 'img' && rest.length === 2 && method === 'DELETE') {
    const id = rest[1];
    if (!/^[a-f0-9]{32}$/.test(id)) return fail(404, 'No such image.');
    await env.SITE.delete('img:' + id);
    try { await caches.default.delete(new Request(new URL('/img/' + id, request.url).toString())); } catch {}
    return json({ ok: true });
  }

  return fail(404, 'Not found.');
}

export async function handleApi(request, env, parts) {
  const method = request.method;
  try {
    if (parts[0] === 'data' && parts.length === 1) {
      if (method !== 'GET') return fail(405, 'Method not allowed.');
      if (!env.SITE) return fail(404, 'No saved data.');
      const saved = await env.SITE.get('site');
      if (!saved) return fail(404, 'No saved data.');
      return new Response(saved, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    if (parts[0] === 'login' && parts.length === 1 && method === 'POST') return login(request, env);
    if (parts[0] === 'logout' && parts.length === 1 && method === 'POST') return logout();
    if (parts[0] === 'admin') return admin(request, env, parts.slice(1));
    return fail(404, 'Not found.');
  } catch (err) {
    return fail(500, 'Something went wrong on the server. Try again.');
  }
}
