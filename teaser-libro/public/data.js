// Accesso ai dati: autenticazione (Firebase Authentication) e archivio
// (Cloud Firestore). È l'unico file che parla con Firebase.
//
// Struttura dell'archivio:
//   book/meta          dati pubblici del libro ed elenco dei capitoli
//   chapters/{id}      testo dei capitoli (leggibile solo da utenti registrati)
//   users/{uid}        profilo di chi si registra
//   progress/{uid}     punto di lettura per capitolo
//   messages/{id}      messaggi inviati all'autore
// Chi può leggere o scrivere cosa è stabilito in firestore.rules.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig, adminEmails } from './firebase-config.js';
import { render as renderMarkdown, countWords } from './markdown.js';

export const isConfigured = !String(firebaseConfig.apiKey).includes('INSERISCI');

const ADMINS = adminEmails.map((e) => e.trim().toLowerCase());
const now = () => new Date().toISOString();

let auth = null;
let db = null;
if (isConfigured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  auth.languageCode = 'it';
  db = getFirestore(app);
}

export const isAdminEmail = (email) => ADMINS.includes(String(email || '').toLowerCase());

// Traduce i codici di errore di Firebase in messaggi comprensibili.
export function errorMessage(err) {
  const map = {
    'auth/email-already-in-use': 'Esiste già un account con questa email. Prova ad accedere.',
    'auth/invalid-email': 'Indirizzo email non valido.',
    'auth/weak-password': 'La password deve avere almeno 8 caratteri.',
    'auth/missing-password': 'Inserisci la password.',
    'auth/invalid-credential': 'Email o password non corretti.',
    'auth/invalid-login-credentials': 'Email o password non corretti.',
    'auth/wrong-password': 'Email o password non corretti.',
    'auth/user-not-found': 'Email o password non corretti.',
    'auth/user-disabled': 'Questo account è stato disattivato.',
    'auth/too-many-requests': 'Troppi tentativi. Riprova tra qualche minuto.',
    'auth/network-request-failed': 'Connessione assente. Controlla la rete e riprova.',
    'permission-denied': 'Operazione non consentita.',
    unavailable: 'Servizio momentaneamente non raggiungibile. Riprova.',
  };
  return map[err?.code] || err?.userMessage || 'Si è verificato un errore. Riprova.';
}

function fail(message) {
  const err = new Error(message);
  err.userMessage = message;
  return err;
}

// --------------------------------------------------------------- utenti

async function loadUser(fbUser) {
  if (!fbUser) return null;
  let profile = {};
  try {
    const snap = await getDoc(doc(db, 'users', fbUser.uid));
    if (snap.exists()) profile = snap.data();
  } catch {
    // profilo non leggibile: si usano i dati dell'account
  }
  return {
    uid: fbUser.uid,
    email: fbUser.email,
    emailVerified: fbUser.emailVerified,
    name: profile.name || fbUser.email.split('@')[0],
    role: profile.role || 'altro',
    company: profile.company || '',
    isAdmin: isAdminEmail(fbUser.email),
  };
}

// Chiama cb(utente | null) all'avvio e a ogni accesso/uscita.
export function watchUser(cb) {
  onAuthStateChanged(auth, async (fbUser) => cb(await loadUser(fbUser)));
}

export async function touchLastSeen(uid) {
  await updateDoc(doc(db, 'users', uid), { lastSeenAt: now() }).catch(() => {});
}

export async function register({ name, email, password, role, company, consent }) {
  name = String(name || '').trim().slice(0, 80);
  company = String(company || '').trim().slice(0, 120);
  if (name.length < 2) throw fail('Inserisci il tuo nome.');
  if (String(password || '').length < 8) throw fail('La password deve avere almeno 8 caratteri.');
  if (!consent) throw fail("Devi accettare l'informativa per proseguire.");
  const ROLES = ['editore', 'agente', 'scout', 'lettore', 'altro'];
  if (!ROLES.includes(role)) role = 'altro';

  const cred = await createUserWithEmailAndPassword(auth, String(email).trim(), password);
  const t = now();
  await setDoc(doc(db, 'users', cred.user.uid), {
    name,
    email: cred.user.email,
    role,
    company,
    consent: true,
    createdAt: t,
    lastSeenAt: t,
  });
  sendEmailVerification(cred.user).catch(() => {});
  return loadUser(cred.user);
}

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, String(email).trim(), password);
  return loadUser(cred.user);
}

export const logout = () => signOut(auth);

export const resetPassword = (email) => sendPasswordResetEmail(auth, String(email).trim());

export async function resendVerification() {
  if (auth.currentUser) await sendEmailVerification(auth.currentUser);
}

// Ricarica lo stato di verifica dell'email (dopo che l'utente ha cliccato il link).
export async function refreshUser() {
  if (!auth.currentUser) return null;
  await auth.currentUser.reload();
  await auth.currentUser.getIdToken(true);
  return loadUser(auth.currentUser);
}

// ---------------------------------------------------------------- libro

export async function getBook() {
  const snap = await getDoc(doc(db, 'book', 'meta'));
  return snap.exists() ? snap.data() : null;
}

export async function getChapter(id) {
  const snap = await getDoc(doc(db, 'chapters', id));
  return snap.exists() ? { id, ...snap.data() } : null;
}

// ------------------------------------------------------------ progressi

export async function getProgress(uid) {
  const snap = await getDoc(doc(db, 'progress', uid));
  return snap.exists() ? snap.data().chapters || {} : {};
}

export async function saveProgress(uid, chapterId, entry) {
  await setDoc(
    doc(db, 'progress', uid),
    { chapters: { [chapterId]: entry }, updatedAt: now() },
    { merge: true },
  );
}

export async function sendMessage(uid, message) {
  message = String(message || '').trim().slice(0, 4000);
  if (message.length < 5) throw fail('Scrivi un messaggio.');
  await addDoc(collection(db, 'messages'), { uid, message, createdAt: now() });
}

// ----------------------------------------------------------- amministrazione

export async function loadAdminStats() {
  const [bookMeta, usersSnap, progressSnap, messagesSnap] = await Promise.all([
    getBook(),
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'progress')),
    getDocs(collection(db, 'messages')),
  ]);
  const chapters = (bookMeta?.chapters || []).map(({ id, title }) => ({ id, title }));
  const progress = new Map(progressSnap.docs.map((d) => [d.id, d.data().chapters || {}]));
  const profiles = new Map(usersSnap.docs.map((d) => [d.id, d.data()]));

  const users = usersSnap.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .filter((u) => !isAdminEmail(u.email))
    .map((u) => ({
      ...u,
      chapters: chapters.map((c) => progress.get(u.uid)?.[c.id]?.max || 0),
    }))
    .sort((a, b) => (b.lastSeenAt || '').localeCompare(a.lastSeenAt || ''));

  const messages = messagesSnap.docs
    .map((d) => {
      const m = d.data();
      const u = profiles.get(m.uid) || {};
      return { ...m, name: u.name, email: u.email, company: u.company, role: u.role };
    })
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const lastIdx = chapters.length - 1;
  return {
    chapters,
    users,
    messages,
    totals: {
      users: users.length,
      publishers: users.filter((u) => ['editore', 'agente', 'scout'].includes(u.role)).length,
      started: users.filter((u) => u.chapters.some((p) => p > 0)).length,
      finished: lastIdx >= 0 ? users.filter((u) => u.chapters[lastIdx] >= 0.95).length : 0,
    },
  };
}

// Legge book.json e i file .md scelti dall'autore, li converte e li pubblica.
// Restituisce l'elenco dei capitoli pubblicati.
export async function publishContent(files) {
  const byName = new Map([...files].map((f) => [f.name, f]));
  const metaFile = byName.get('book.json');
  if (!metaFile) throw fail('Seleziona anche il file book.json.');
  let meta;
  try {
    meta = JSON.parse(await metaFile.text());
  } catch {
    throw fail('Il file book.json non è valido: controlla virgole e virgolette.');
  }
  if (!meta.title || !Array.isArray(meta.chapters) || !meta.chapters.length) {
    throw fail('In book.json mancano il titolo o l\'elenco dei capitoli.');
  }
  const missing = meta.chapters.filter((c) => !byName.has(c.file)).map((c) => c.file);
  if (missing.length) throw fail(`Mancano questi file: ${missing.join(', ')}`);
  const badId = meta.chapters.find((c) => !/^[\w-]{1,60}$/.test(String(c.id || '')));
  if (badId) throw fail(`Identificativo di capitolo non valido: "${badId.id}" (usa lettere, numeri e trattini).`);

  const chapters = [];
  for (const [index, c] of meta.chapters.entries()) {
    const source = await byName.get(c.file).text();
    const words = countWords(source);
    chapters.push({
      id: c.id,
      index,
      title: String(c.title || `Capitolo ${index + 1}`),
      subtitle: String(c.subtitle || ''),
      minutes: Math.max(1, Math.round(words / 230)),
      html: renderMarkdown(source),
    });
  }

  const publicMeta = {
    title: String(meta.title),
    subtitle: String(meta.subtitle || ''),
    author: String(meta.author || ''),
    genre: String(meta.genre || ''),
    tagline: String(meta.tagline || ''),
    synopsis: Array.isArray(meta.synopsis) ? meta.synopsis.map(String) : [String(meta.synopsis || '')].filter(Boolean),
    aboutAuthor: String(meta.aboutAuthor || ''),
    totalChapters: Number(meta.totalChapters) || null,
    totalWords: Number(meta.totalWords) || null,
    contactEmail: String(meta.contactEmail || ''),
    endNote: String(meta.endNote || ''),
    chapters: chapters.map(({ id, title, subtitle, minutes }) => ({ id, title, subtitle, minutes })),
    updatedAt: now(),
  };

  const existing = await getDocs(collection(db, 'chapters'));
  const batch = writeBatch(db);
  for (const ch of chapters) {
    const { id, ...data } = ch;
    batch.set(doc(db, 'chapters', id), data);
  }
  for (const d of existing.docs) {
    if (!chapters.some((c) => c.id === d.id)) batch.delete(d.ref);
  }
  batch.set(doc(db, 'book', 'meta'), publicMeta);
  await batch.commit();
  return publicMeta.chapters;
}
