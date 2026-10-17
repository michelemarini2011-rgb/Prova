'use strict';
// Server della web app "anteprima del libro".
// Nessuna dipendenza esterna: basta Node.js 18 o superiore.
//
// Variabili d'ambiente:
//   PORT            porta di ascolto (predefinita 3000)
//   ADMIN_EMAILS    email, separate da virgola, che vedono il pannello statistiche
//   SESSION_SECRET  segreto per firmare i cookie (se assente ne viene generato
//                   uno e salvato in data/secret.key)
//   DATA_DIR        cartella dei dati (predefinita ./data)
//   CONTENT_DIR     cartella del libro (predefinita ./content)
//   COOKIE_SECURE   "1" per forzare i cookie Secure (consigliato in HTTPS)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Store } = require('./lib/store');
const auth = require('./lib/auth');
const md = require('./lib/markdown');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const CONTENT_DIR = path.resolve(process.env.CONTENT_DIR || path.join(__dirname, 'content'));
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

fs.mkdirSync(DATA_DIR, { recursive: true });
const SECRET = loadSecret();
const store = new Store(path.join(DATA_DIR, 'db.json'));
const book = loadBook();

function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(DATA_DIR, 'secret.key');
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  }
  return fs.readFileSync(file, 'utf8').trim();
}

// Il libro viene letto all'avvio: per aggiornare i capitoli basta riavviare.
function loadBook() {
  const meta = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'book.json'), 'utf8'));
  const chapters = meta.chapters.map((ch, index) => {
    const source = fs.readFileSync(path.join(CONTENT_DIR, 'chapters', ch.file), 'utf8');
    const words = md.countWords(source);
    return {
      id: ch.id,
      index,
      title: ch.title,
      subtitle: ch.subtitle || '',
      words,
      minutes: Math.max(1, Math.round(words / 230)),
      html: md.render(source),
    };
  });
  return { ...meta, chapters };
}

function publicBook() {
  return {
    title: book.title,
    subtitle: book.subtitle || '',
    author: book.author,
    genre: book.genre || '',
    tagline: book.tagline || '',
    synopsis: book.synopsis || [],
    aboutAuthor: book.aboutAuthor || '',
    totalChapters: book.totalChapters || null,
    totalWords: book.totalWords || null,
    contactEmail: book.contactEmail || '',
    endNote: book.endNote || '',
    chapters: book.chapters.map(({ id, title, subtitle, minutes }) => ({ id, title, subtitle, minutes })),
  };
}

// ---------------------------------------------------------------- utilità HTTP

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
    "font-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

function json(res, status, data, headers = {}) {
  send(res, status, JSON.stringify(data), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function readJson(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'Richiesta troppo grande.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(data && typeof data === 'object' ? data : {});
      } catch {
        reject(new HttpError(400, 'JSON non valido.'));
      }
    });
    req.on('error', reject);
  });
}

function isSecure(req) {
  return process.env.COOKIE_SECURE === '1' || req.headers['x-forwarded-proto'] === 'https';
}

function sessionCookie(req, token, maxAgeSeconds) {
  return [
    `sid=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
    isSecure(req) ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

function currentUser(req) {
  const token = auth.parseCookies(req.headers.cookie).sid;
  const session = auth.readSessionToken(SECRET, token);
  if (!session) return null;
  const user = store.findUserById(session.id);
  if (!user || (user.sessionVersion || 0) !== session.version) return null;
  return user;
}

function isAdmin(user) {
  return !!user && ADMIN_EMAILS.includes(user.email);
}

function publicUser(user) {
  return {
    name: user.name,
    email: user.email,
    role: user.role,
    company: user.company,
    isAdmin: isAdmin(user),
  };
}

// Limite semplice ai tentativi di accesso/registrazione, per IP.
const attempts = new Map();
function rateLimit(req, key, max = 10, windowMs = 15 * 60 * 1000) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const id = `${key}:${ip}`;
  const now = Date.now();
  const entry = attempts.get(id);
  if (!entry || entry.reset < now) {
    attempts.set(id, { count: 1, reset: now + windowMs });
    return;
  }
  entry.count++;
  if (entry.count > max) throw new HttpError(429, 'Troppi tentativi. Riprova tra qualche minuto.');
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k);
}, 60 * 1000).unref();

const clean = (v, max) => String(v ?? '').trim().slice(0, max);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ROLES = ['editore', 'agente', 'scout', 'lettore', 'altro'];

// ------------------------------------------------------------------- API

const routes = {
  'GET /api/book': (req, res) => json(res, 200, publicBook()),

  'GET /api/me': (req, res) => {
    const user = currentUser(req);
    if (!user) return json(res, 200, { user: null });
    user.lastSeenAt = new Date().toISOString();
    store.save();
    json(res, 200, { user: publicUser(user) });
  },

  'POST /api/register': async (req, res) => {
    rateLimit(req, 'register', 8);
    const body = await readJson(req);
    const name = clean(body.name, 80);
    const email = clean(body.email, 120).toLowerCase();
    const password = String(body.password || '');
    const role = ROLES.includes(body.role) ? body.role : 'altro';
    const company = clean(body.company, 120);
    if (name.length < 2) throw new HttpError(400, 'Inserisci il tuo nome.');
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Indirizzo email non valido.');
    if (password.length < 8) throw new HttpError(400, 'La password deve avere almeno 8 caratteri.');
    if (password.length > 200) throw new HttpError(400, 'Password troppo lunga.');
    if (!body.consent) throw new HttpError(400, "Devi accettare l'informativa per proseguire.");
    if (store.findUserByEmail(email)) throw new HttpError(409, 'Esiste già un account con questa email.');

    const now = new Date().toISOString();
    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      role,
      company,
      passwordHash: auth.hashPassword(password),
      sessionVersion: 0,
      createdAt: now,
      lastSeenAt: now,
    };
    store.data.users.push(user);
    store.save();
    json(res, 201, { user: publicUser(user) }, {
      'Set-Cookie': sessionCookie(req, auth.createSessionToken(SECRET, user), auth.SESSION_DAYS * 86400),
    });
  },

  'POST /api/login': async (req, res) => {
    rateLimit(req, 'login', 10);
    const body = await readJson(req);
    const email = clean(body.email, 120).toLowerCase();
    const user = store.findUserByEmail(email);
    if (!user || !auth.verifyPassword(String(body.password || ''), user.passwordHash)) {
      throw new HttpError(401, 'Email o password non corretti.');
    }
    user.lastSeenAt = new Date().toISOString();
    store.save();
    json(res, 200, { user: publicUser(user) }, {
      'Set-Cookie': sessionCookie(req, auth.createSessionToken(SECRET, user), auth.SESSION_DAYS * 86400),
    });
  },

  'POST /api/logout': (req, res) => {
    json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  },

  'GET /api/progress': (req, res, user) => {
    json(res, 200, { progress: store.data.progress[user.id] || {} });
  },

  'PUT /api/progress': async (req, res, user) => {
    const body = await readJson(req);
    const chapter = book.chapters.find((c) => c.id === body.chapterId);
    if (!chapter) throw new HttpError(404, 'Capitolo non trovato.');
    const fraction = Math.min(1, Math.max(0, Number(body.fraction) || 0));
    const all = (store.data.progress[user.id] ||= {});
    const now = new Date().toISOString();
    const entry = (all[chapter.id] ||= { fraction: 0, max: 0, openedAt: now });
    entry.fraction = fraction;
    entry.max = Math.max(entry.max, fraction);
    entry.updatedAt = now;
    user.lastSeenAt = now;
    store.save();
    json(res, 200, { ok: true });
  },

  'POST /api/contact': async (req, res, user) => {
    rateLimit(req, 'contact', 5, 60 * 60 * 1000);
    const body = await readJson(req);
    const message = clean(body.message, 4000);
    if (message.length < 5) throw new HttpError(400, 'Scrivi un messaggio.');
    store.data.messages.push({
      id: crypto.randomUUID(),
      userId: user.id,
      message,
      createdAt: new Date().toISOString(),
    });
    store.save();
    json(res, 201, { ok: true });
  },

  'GET /api/admin/stats': (req, res, user) => {
    if (!isAdmin(user)) throw new HttpError(403, 'Accesso riservato.');
    json(res, 200, adminStats());
  },

  'GET /api/admin/export.csv': (req, res, user) => {
    if (!isAdmin(user)) throw new HttpError(403, 'Accesso riservato.');
    const stats = adminStats();
    const header = ['Nome', 'Email', 'Ruolo', 'Casa editrice/Agenzia', 'Registrato', 'Ultimo accesso',
      ...stats.chapters.map((c) => c.title)];
    const rows = stats.users.map((u) => [u.name, u.email, u.role, u.company, u.createdAt, u.lastSeenAt,
      ...u.chapters.map((p) => `${Math.round(p * 100)}%`)]);
    // Il prefisso ' impedisce che un valore venga interpretato come formula da Excel.
    const cell = (v) => {
      let s = String(v ?? '');
      if (/^[=+\-@]/.test(s)) s = `'${s}`;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const csv = '﻿' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
    send(res, 200, csv, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="lettori.csv"',
      'Cache-Control': 'no-store',
    });
  },
};

function adminStats() {
  const chapters = book.chapters.map(({ id, title }) => ({ id, title }));
  const users = store.data.users
    .filter((u) => !isAdmin(u))
    .map((u) => {
      const progress = store.data.progress[u.id] || {};
      return {
        name: u.name,
        email: u.email,
        role: u.role,
        company: u.company,
        createdAt: u.createdAt,
        lastSeenAt: u.lastSeenAt,
        chapters: chapters.map((c) => progress[c.id]?.max || 0),
      };
    })
    .sort((a, b) => (b.lastSeenAt || '').localeCompare(a.lastSeenAt || ''));
  const byEmail = new Map(store.data.users.map((u) => [u.id, u]));
  const messages = store.data.messages
    .map((m) => {
      const u = byEmail.get(m.userId);
      return { ...m, name: u?.name, email: u?.email, company: u?.company, role: u?.role };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const finished = users.filter((u) => u.chapters.length && u.chapters[u.chapters.length - 1] >= 0.95).length;
  return {
    chapters,
    users,
    messages,
    totals: {
      users: users.length,
      publishers: users.filter((u) => ['editore', 'agente', 'scout'].includes(u.role)).length,
      started: users.filter((u) => u.chapters.some((p) => p > 0)).length,
      finished,
    },
  };
}

async function handleApi(req, res, pathname) {
  // Protezione CSRF: le richieste che modificano dati devono arrivare dal nostro
  // JavaScript (un form di un altro sito non può impostare questa intestazione).
  if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'fetch') {
    throw new HttpError(403, 'Richiesta non consentita.');
  }

  const chapterMatch = pathname.match(/^\/api\/chapters\/([\w-]+)$/);
  if (req.method === 'GET' && chapterMatch) {
    const user = currentUser(req);
    if (!user) throw new HttpError(401, 'Accedi per leggere i capitoli.');
    const chapter = book.chapters.find((c) => c.id === chapterMatch[1]);
    if (!chapter) throw new HttpError(404, 'Capitolo non trovato.');
    const prev = book.chapters[chapter.index - 1];
    const next = book.chapters[chapter.index + 1];
    return json(res, 200, {
      id: chapter.id,
      index: chapter.index,
      title: chapter.title,
      subtitle: chapter.subtitle,
      html: chapter.html,
      prev: prev ? prev.id : null,
      next: next ? next.id : null,
      isLast: !next,
    });
  }

  const handler = routes[`${req.method} ${pathname}`];
  if (!handler) throw new HttpError(404, 'Risorsa non trovata.');
  const open = ['/api/book', '/api/me', '/api/register', '/api/login', '/api/logout'];
  let user = null;
  if (!open.includes(pathname)) {
    user = currentUser(req);
    if (!user) throw new HttpError(401, 'Sessione scaduta: accedi di nuovo.');
  }
  await handler(req, res, user);
}

// ------------------------------------------------------------- file statici

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return send(res, 400, 'Richiesta non valida');
  }
  let file = path.normalize(path.join(PUBLIC_DIR, decoded));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Vietato');
  if (pathname === '/' || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // Applicazione a pagina singola: qualsiasi percorso sconosciuto restituisce index.html.
    if (path.extname(pathname)) return send(res, 404, 'Non trovato');
    file = path.join(PUBLIC_DIR, 'index.html');
  }
  const ext = path.extname(file);
  send(res, 200, fs.readFileSync(file), {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
  });
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    return send(res, 400, 'Richiesta non valida');
  }
  try {
    if (pathname.startsWith('/api/')) await handleApi(req, res, pathname);
    else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res, pathname);
    else send(res, 405, 'Metodo non consentito');
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) json(res, status, { error: status === 500 ? 'Errore interno.' : err.message });
  }
});

server.listen(PORT, () => {
  console.log(`"${book.title}" — anteprima disponibile su http://localhost:${PORT}`);
  if (!ADMIN_EMAILS.length) {
    console.log('Suggerimento: imposta ADMIN_EMAILS per vedere chi sta leggendo il libro.');
  }
});

function shutdown() {
  store.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
