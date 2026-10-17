'use strict';
// Hash delle password con scrypt e cookie di sessione firmati con HMAC.

const crypto = require('crypto');

const SESSION_DAYS = 30;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function sign(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

// Il token contiene l'id utente, la scadenza e una "versione" della sessione:
// cambiando la versione (es. al cambio password) si invalidano i cookie esistenti.
function createSessionToken(secret, user) {
  const expires = Date.now() + SESSION_DAYS * 24 * 3600 * 1000;
  const payload = `${user.id}.${expires}.${user.sessionVersion || 0}`;
  return `${payload}.${sign(secret, payload)}`;
}

function readSessionToken(secret, token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [id, expires, version, mac] = parts;
  const payload = `${id}.${expires}.${version}`;
  const expected = Buffer.from(sign(secret, payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  if (Number(expires) < Date.now()) return null;
  return { id, version: Number(version) };
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    try {
      out[key] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      // cookie malformato: ignorato
    }
  }
  return out;
}

module.exports = {
  SESSION_DAYS,
  hashPassword,
  verifyPassword,
  createSessionToken,
  readSessionToken,
  parseCookies,
};
