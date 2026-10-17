// Applicazione a pagina singola: vetrina del libro, registrazione/accesso,
// libreria, lettore paginato in stile ebook e pannello statistiche per l'autore.
// Tutti i dati passano da data.js (Firebase).

import * as data from './data.js';

(() => {
  const app = document.getElementById('app');
  const state = { book: null, user: null, progress: {} };

  // ------------------------------------------------------------ utilità

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const storage = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // archiviazione non disponibile (navigazione privata): si ignora
      }
    },
  };

  function toast(text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : '—';

  const ROLE_LABELS = {
    editore: 'Editore / Casa editrice',
    agente: 'Agente letterario',
    scout: 'Scout letterario',
    lettore: 'Lettore',
    altro: 'Altro',
  };

  const ICON = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    type: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l5-14 5 14M6 15h6M15 20l3.5-9 3.5 9M16.2 17h4.6"/></svg>',
  };

  function setTitle(part) {
    document.title = part ? `${part} · ${state.book.title}` : `${state.book.title} — anteprima`;
  }

  // Avanzamento del lettore: massimo fra tutti i capitoli già aperti.
  function lastReadChapter() {
    let best = null;
    for (const ch of state.book.chapters) {
      const p = state.progress[ch.id];
      if (p && (!best || (p.updatedAt || '') > (best.p.updatedAt || ''))) best = { ch, p };
    }
    return best;
  }

  function topbar() {
    const u = state.user;
    const right = u
      ? `${u.isAdmin ? '<a class="btn ghost small" href="#/admin">Statistiche</a>' : ''}
         <button class="btn ghost small" data-action="logout">Esci</button>`
      : `<a class="btn ghost small" href="#/accedi">Accedi</a>`;
    return `<header class="topbar">
      <a class="brand" href="#/"><img src="icon.svg" alt=""><span>${esc(state.book.title)}</span></a>
      <nav>${right}</nav>
    </header>`;
  }

  function coverHtml() {
    const b = state.book;
    return `<div class="cover" aria-hidden="true">
      <div class="c-author">${esc(b.author)}</div>
      <div class="c-title">${esc(b.title)}</div>
      <div class="c-sub">${esc(b.subtitle || 'Anteprima')}</div>
      <svg viewBox="0 0 200 60" preserveAspectRatio="none"><path d="M0 30 Q25 18 50 30 T100 30 T150 30 T200 30 V60 H0Z" fill="#2f6f8f"/><path d="M0 42 Q25 30 50 42 T100 42 T150 42 T200 42 V60 H0Z" fill="#0d1f2e"/></svg>
    </div>`;
  }

  function chapterList(linkable) {
    return `<ul class="chapters">${state.book.chapters
      .map((ch, i) => {
        const p = state.progress[ch.id];
        const pct = Math.round((p?.max || 0) * 100);
        const side = linkable ? (pct >= 95 ? 'Letto ✓' : pct > 0 ? `${pct}%` : `${ch.minutes} min`) : `${ch.minutes} min`;
        const inner = `<span class="num">${i + 1}</span>
          <span class="info"><span class="t">${esc(ch.title)}</span>
          ${ch.subtitle ? `<span class="s">${esc(ch.subtitle)}</span>` : ''}
          ${linkable && pct > 0 ? `<span class="bar"><i style="width:${pct}%"></i></span>` : ''}</span>
          <span class="side">${side}</span>`;
        return linkable
          ? `<li><a class="chapter" href="#/leggi/${esc(ch.id)}">${inner}</a></li>`
          : `<li><a class="chapter locked" href="#/registrati">${inner}</a></li>`;
      })
      .join('')}</ul>`;
  }

  // --------------------------------------------------------------- viste

  function viewHome() {
    const b = state.book;
    setTitle();
    if (state.bookMissing) {
      app.innerHTML = `<div class="page">${topbar()}
        <div class="auth"><div class="card">
          <h1 style="font-family:var(--serif);margin-top:0">Anteprima in preparazione</h1>
          <p>I capitoli non sono ancora stati pubblicati. Torna a trovarci presto!</p>
          ${state.user?.isAdmin
            ? '<p><a class="btn" href="#/admin">Carica i capitoli</a></p>'
            : '<p class="empty">Sei l\'autore? <a href="#/accedi">Accedi</a> e carica i capitoli dal pannello Statistiche.</p>'}
        </div></div></div>`;
      return;
    }
    const last = state.user && lastReadChapter();
    const cta = state.user
      ? `<a class="btn" href="#/leggi/${esc((last?.ch || b.chapters[0]).id)}">${last ? 'Continua a leggere' : 'Inizia a leggere'}</a>
         <a class="btn ghost" href="#/libreria">Indice dei capitoli</a>`
      : `<a class="btn" href="#/registrati">Registrati e leggi gratis</a>
         <a class="btn ghost" href="#/accedi">Ho già un account</a>`;
    const meta = [
      b.genre,
      b.chapters.length === 1 ? '1 capitolo in anteprima' : `${b.chapters.length} capitoli in anteprima`,
      b.totalChapters ? `${b.totalChapters} capitoli in tutto` : '',
      b.totalWords ? `≈ ${b.totalWords.toLocaleString('it-IT')} parole` : '',
    ].filter(Boolean);

    app.innerHTML = `<div class="page">
      ${topbar()}
      <section class="hero">
        ${coverHtml()}
        <div>
          <p class="eyebrow">Anteprima riservata</p>
          <h1>${esc(b.title)}</h1>
          ${b.author ? `<p class="by">di ${esc(b.author)}</p>` : ''}
          ${b.tagline ? `<p class="tagline">${esc(b.tagline)}</p>` : ''}
          <div class="cta">${cta}</div>
          <div class="meta-row">${meta.map((m) => `<span>${esc(m)}</span>`).join('')}</div>
        </div>
      </section>
      ${b.synopsis.length ? `<section class="section"><h2>La storia</h2><div class="prose">${b.synopsis.map((p) => `<p>${esc(p)}</p>`).join('')}</div></section>` : ''}
      <section class="section"><h2>Capitoli in anteprima</h2>${chapterList(!!state.user)}</section>
      ${b.aboutAuthor ? `<section class="section"><h2>L'autore</h2><div class="prose"><p>${esc(b.aboutAuthor)}</p></div></section>` : ''}
      <section class="section"><p class="empty">Testo protetto da diritto d'autore. È vietata la riproduzione o la diffusione, anche parziale. · <a href="#/privacy">Privacy</a></p></section>
    </div>`;
  }

  function viewLibrary() {
    setTitle('Capitoli');
    const last = lastReadChapter();
    app.innerHTML = `<div class="page">
      ${topbar()}
      <h1 style="font-family:var(--serif);margin:0 0 6px">Ciao ${esc(state.user.name.split(' ')[0])}</h1>
      <p style="color:var(--muted);margin:0 0 20px">Ecco i capitoli in anteprima. Il segno di lettura viene salvato automaticamente.</p>
      ${last ? `<p><a class="btn" href="#/leggi/${esc(last.ch.id)}">Riprendi: ${esc(last.ch.title)}</a></p>` : ''}
      ${chapterList(true)}
      <section class="section" style="margin-top:28px">
        <h2>Ti interessa il manoscritto?</h2>
        ${contactForm()}
      </section>
    </div>`;
  }

  function contactForm() {
    const b = state.book;
    return `<form class="card" data-form="contact">
      <p style="margin-top:0;color:var(--muted)">Scrivi direttamente all'autore per richiedere il testo completo o proporre un incontro.${
        b.contactEmail ? ` Puoi anche scrivere a <a href="mailto:${esc(b.contactEmail)}">${esc(b.contactEmail)}</a>.` : ''
      }</p>
      <div data-slot="msg"></div>
      <label class="field"><span>Messaggio</span><textarea name="message" required maxlength="4000" placeholder="Buongiorno, vorrei leggere il manoscritto completo…"></textarea></label>
      <button class="btn" type="submit">Invia all'autore</button>
    </form>`;
  }

  function viewAuth(mode) {
    const isReg = mode === 'register';
    setTitle(isReg ? 'Registrazione' : 'Accesso');
    app.innerHTML = `<div class="page">
      ${topbar()}
      <div class="auth"><form class="card" data-form="${mode}" novalidate>
        <h1>${isReg ? 'Crea un account' : 'Bentornato'}</h1>
        <p class="lead">${isReg
          ? `Registrati per leggere gratuitamente i primi capitoli de «${esc(state.book.title)}».`
          : 'Accedi per riprendere la lettura da dove eri rimasto.'}</p>
        <div data-slot="msg"></div>
        ${isReg ? `<label class="field"><span>Nome e cognome</span><input name="name" autocomplete="name" required maxlength="80"></label>` : ''}
        <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" inputmode="email" required maxlength="120"></label>
        <label class="field"><span>Password ${isReg ? '<small>(almeno 8 caratteri)</small>' : ''}</span>
          <input name="password" type="password" autocomplete="${isReg ? 'new-password' : 'current-password'}" required minlength="${isReg ? 8 : 1}"></label>
        ${isReg ? `
        <label class="field"><span>Sei…</span><select name="role">
          ${Object.entries(ROLE_LABELS).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}
        </select></label>
        <label class="field"><span>Casa editrice o agenzia <small>(facoltativo)</small></span><input name="company" autocomplete="organization" maxlength="120"></label>
        <label class="check"><input type="checkbox" name="consent" required>
          <span>Ho letto l'<a href="#/privacy" target="_blank">informativa privacy</a> e acconsento al trattamento dei miei dati per accedere all'anteprima ed essere eventualmente ricontattato dall'autore. Mi impegno a non copiare né diffondere il testo.</span></label>` : ''}
        <button class="btn block" type="submit">${isReg ? 'Registrati e inizia a leggere' : 'Accedi'}</button>
        ${isReg ? '' : '<p class="switch"><button type="button" class="linkish" data-action="reset">Password dimenticata?</button></p>'}
        <p class="switch">${isReg
          ? 'Hai già un account? <a href="#/accedi">Accedi</a>'
          : 'Non hai un account? <a href="#/registrati">Registrati</a>'}</p>
      </form></div>
    </div>`;
    app.querySelector('input').focus({ preventScroll: true });
  }

  function viewPrivacy() {
    setTitle('Privacy');
    const b = state.book;
    app.innerHTML = `<div class="page">
      ${topbar()}
      <div class="prose">
        <h1>Informativa privacy</h1>
        <p>Il titolare del trattamento è ${esc(b.author || "l'autore del libro")}${b.contactEmail ? ` (<a href="mailto:${esc(b.contactEmail)}">${esc(b.contactEmail)}</a>)` : ''}.</p>
        <p>I dati raccolti con la registrazione (nome, email, ruolo, casa editrice o agenzia) e l'avanzamento della lettura sono usati esclusivamente per consentire l'accesso all'anteprima del libro e per ricontattarti in merito alla sua pubblicazione. Non vengono ceduti a terzi.</p>
        <p>Puoi chiedere in qualsiasi momento l'accesso, la rettifica o la cancellazione dei tuoi dati scrivendo al titolare.</p>
        <p>I dati sono conservati tramite i servizi Google Firebase (Authentication e Cloud Firestore). Il sito non usa cookie di profilazione: per mantenere l'accesso e le preferenze di lettura usa solo la memoria locale del browser.</p>
        <p><a href="#/">← Torna al libro</a></p>
      </div>
    </div>`;
  }

  async function viewAdmin() {
    setTitle('Statistiche');
    app.innerHTML = `<div class="page">${topbar()}<p class="empty">Caricamento statistiche…</p></div>`;
    if (!state.user.emailVerified) {
      app.innerHTML = `<div class="page">${topbar()}<div class="auth"><div class="card">
        <h1 style="font-family:var(--serif);margin-top:0">Conferma la tua email</h1>
        <p>Per sicurezza il pannello dell'autore si apre solo dopo aver confermato l'indirizzo
        <b>${esc(state.user.email)}</b> con il link che ti abbiamo inviato (controlla anche lo spam).</p>
        <div data-slot="msg"></div>
        <div class="cta"><button class="btn" data-action="verified">Ho confermato</button>
        <button class="btn ghost" data-action="resend">Invia di nuovo</button></div>
      </div></div></div>`;
      return;
    }
    let s;
    try {
      s = await data.loadAdminStats(state.user.email);
    } catch (err) {
      app.innerHTML = `<div class="page">${topbar()}<p class="error">${esc(data.errorMessage(err))}</p>
        <p class="empty">Se l'errore è «Operazione non consentita», controlla di aver inserito la tua email in firestore.rules e di aver pubblicato le regole.</p>
        ${uploadSection()}</div>`;
      return;
    }
    adminStats = s;
    const pct = (v) => (v > 0 ? `${Math.round(v * 100)}%` : '—');
    app.innerHTML = `<div class="page">
      ${topbar()}
      <h1 style="font-family:var(--serif);margin:0 0 16px">Chi sta leggendo</h1>
      <div class="stats">
        <div class="stat"><b>${s.totals.users}</b><span>registrati</span></div>
        <div class="stat"><b>${s.totals.publishers}</b><span>editori, agenti e scout</span></div>
        <div class="stat"><b>${s.totals.started}</b><span>hanno iniziato a leggere</span></div>
        <div class="stat"><b>${s.totals.finished}</b><span>sono arrivati alla fine</span></div>
      </div>
      <section class="section">
        <h2>Messaggi ricevuti</h2>
        ${s.messages.length
          ? s.messages.map((m) => `<article class="msg"><header><b>${esc(m.name || 'Utente eliminato')}</b> · ${esc(m.email || '')}
              ${m.company ? ` · ${esc(m.company)}` : ''} · ${esc(ROLE_LABELS[m.role] || '')} · ${fmtDate(m.createdAt)}</header><p>${esc(m.message)}</p></article>`).join('')
          : '<p class="empty">Nessun messaggio per ora.</p>'}
      </section>
      <section class="section">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
          <h2 style="margin:0">Lettori</h2>
          <button class="btn ghost small" data-action="csv">Scarica CSV</button>
        </div>
        ${s.users.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Nome</th><th>Ruolo</th><th>Casa editrice / agenzia</th><th>Email</th>
            ${s.chapters.map((c) => `<th>${esc(c.title)}</th>`).join('')}<th>Ultimo accesso</th><th>Registrato</th></tr></thead>
          <tbody>${s.users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(ROLE_LABELS[u.role] || u.role)}</td><td>${esc(u.company || '—')}</td>
            <td><a href="mailto:${esc(u.email)}">${esc(u.email)}</a></td>
            ${u.chapters.map((p) => `<td class="pct">${pct(p)}</td>`).join('')}
            <td>${fmtDate(u.lastSeenAt)}</td><td>${fmtDate(u.createdAt)}</td></tr>`).join('')}</tbody>
        </table></div>` : '<p class="empty">Ancora nessun registrato.</p>'}
      </section>
      ${uploadSection()}
    </div>`;
  }

  let adminStats = null;

  function uploadSection() {
    return `<section class="section">
      <h2>Contenuti del libro</h2>
      <form class="card" data-form="upload">
        <p style="margin-top:0;color:var(--muted)">Seleziona insieme il file <b>book.json</b> e tutti i file
        dei capitoli (<b>.md</b>) della cartella <code>content</code>. Pubblicando, il libro online viene
        sostituito con questi contenuti; i progressi dei lettori restano.</p>
        <div data-slot="msg"></div>
        <label class="field"><span>File</span><input type="file" name="files" multiple accept=".json,.md,.txt,text/markdown,application/json,text/plain"></label>
        <button class="btn" type="submit">Pubblica i capitoli</button>
      </form>
    </section>`;
  }

  function downloadCsv(s) {
    const header = ['Nome', 'Email', 'Ruolo', 'Casa editrice/Agenzia', 'Registrato', 'Ultimo accesso',
      ...s.chapters.map((c) => c.title)];
    const rows = s.users.map((u) => [u.name, u.email, ROLE_LABELS[u.role] || u.role, u.company, fmtDate(u.createdAt),
      fmtDate(u.lastSeenAt), ...u.chapters.map((p) => `${Math.round(p * 100)}%`)]);
    // Il prefisso ' impedisce che un valore venga interpretato come formula da Excel.
    const cell = (v) => {
      let t = String(v ?? '');
      if (/^[=+\-@]/.test(t)) t = `'${t}`;
      return `"${t.replace(/"/g, '""')}"`;
    };
    const csv = '\ufeff' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'lettori.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ------------------------------------------------------------- lettore

  const DEFAULT_PREFS = { size: 19, font: 'serif', theme: 'light' };
  let reader = null; // stato del lettore aperto

  function prefs() {
    return { ...DEFAULT_PREFS, ...storage.get('reader-prefs', {}) };
  }

  async function viewReader(chapterId, startAt = 'saved') {
    const b = state.book;
    if (!b.chapters.some((c) => c.id === chapterId)) return go(state.bookMissing ? '#/' : '#/libreria');

    // Riutilizza il guscio del lettore se è già aperto (cambio capitolo).
    if (!reader) buildReaderShell();
    const r = reader;
    r.loadToken = (r.loadToken || 0) + 1;
    const token = r.loadToken;
    r.closeSheets();
    r.endCard.hidden = true;

    let ch;
    try {
      ch = await data.getChapter(chapterId);
    } catch (err) {
      toast(data.errorMessage(err));
      return;
    }
    if (!ch) return go('#/libreria');
    const pos = b.chapters.findIndex((c) => c.id === chapterId);
    ch.index = pos;
    ch.prev = b.chapters[pos - 1]?.id || null;
    ch.next = b.chapters[pos + 1]?.id || null;
    ch.isLast = !ch.next;
    if (token !== r.loadToken || reader !== r) return; // nel frattempo si è navigato altrove

    r.chapter = ch;
    const meta = b.chapters[ch.index];
    setTitle(meta.title);
    r.titleEl.innerHTML = `<b>${esc(meta.title)}</b>${meta.subtitle ? `<span>${esc(meta.subtitle)}</span>` : ''}`;
    r.flow.innerHTML =
      `<span class="ch-label">${esc(meta.title)}</span>${ch.html}` +
      (ch.isLast ? '<p class="end-mark">Fine dell\'anteprima</p>' : '') +
      '<span class="flow-end">\u200b</span>';

    if (document.fonts?.ready) await document.fonts.ready;
    r.layout();
    const saved = state.progress[ch.id]?.fraction || 0;
    const target = startAt === 'end' ? r.pages - 1 : startAt === 'start' ? 0 : Math.round(saved * (r.pages - 1));
    r.show(target, false);
    if (startAt !== 'saved') r.saveProgress();
  }

  function buildReaderShell() {
    const p = prefs();
    app.innerHTML = `<div class="reader">
      <header class="r-bar r-top">
        <a class="icon-btn" href="#/libreria" aria-label="Torna ai capitoli">${ICON.back}</a>
        <div class="r-title"></div>
        <button class="icon-btn" data-r="toc" aria-label="Indice">${ICON.list}</button>
        <button class="icon-btn" data-r="settings" aria-label="Impostazioni di lettura">${ICON.type}</button>
      </header>
      <main class="r-viewport" aria-label="Testo del capitolo">
        <div class="r-frame"><div class="r-flow" lang="it"></div></div>
        <div class="r-hint prev" aria-hidden="true">‹</div><div class="r-hint next" aria-hidden="true">›</div>
        <div class="end-card" hidden></div>
      </main>
      <footer class="r-bar r-bottom">
        <input class="r-progress" type="range" min="0" max="0" value="0" aria-label="Posizione nel capitolo">
        <div class="r-info"><span class="r-page"></span><span>Copia riservata a ${esc(state.user.email)}</span></div>
      </footer>
    </div>`;

    const root = app.querySelector('.reader');
    const r = {
      root,
      viewport: root.querySelector('.r-viewport'),
      frame: root.querySelector('.r-frame'),
      flow: root.querySelector('.r-flow'),
      titleEl: root.querySelector('.r-title'),
      range: root.querySelector('.r-progress'),
      pageEl: root.querySelector('.r-page'),
      endCard: root.querySelector('.end-card'),
      page: 0,
      pages: 1,
      width: 0,
      chapter: null,
      saveTimer: null,
      cleanup: [],
    };
    reader = r;

    function applyPrefs(pr) {
      root.classList.remove('theme-light', 'theme-sepia', 'theme-dark', 'font-sans');
      root.classList.add(`theme-${pr.theme}`);
      if (pr.font === 'sans') root.classList.add('font-sans');
      root.style.setProperty('--r-size', `${pr.size}px`);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = { light: '#fbf8f1', sepia: '#f3e7cf', dark: '#15181c' }[pr.theme];
    }
    applyPrefs(p);

    // Impaginazione: il testo scorre in colonne alte quanto lo schermo; ogni
    // "pagina" è larga quanto la finestra e si sfoglia traslando il contenitore.
    r.layout = () => {
      const vw = r.viewport.clientWidth;
      const vh = r.viewport.clientHeight;
      const width = Math.min(vw, 1100);
      const pad = width < 420 ? 22 : width < 860 ? 36 : 56;
      const top = vh < 500 ? 16 : 28;
      r.width = width;
      Object.assign(r.frame.style, {
        left: `${(vw - width) / 2}px`,
        width: `${width}px`,
        top: `${top}px`,
        bottom: `${top}px`,
      });
      r.flow.classList.remove('animate');
      r.flow.style.transform = 'none';
      // Il contenitore del testo è largo esattamente quanto tutte le pagine messe
      // in fila: nessuna colonna "sporge" fuori, cosa che Safari non misura né
      // disegna correttamente. Si parte da una stima e la si raddoppia se il
      // testo non ci sta, poi si riduce al numero esatto di pagine.
      const cols = width >= 860 ? 2 : 1;
      const end = r.flow.querySelector('.flow-end');
      const setPages = (n) => {
        Object.assign(r.flow.style, {
          width: `${n * width}px`,
          padding: `0 ${pad}px`,
          columnCount: String(n * cols),
          columnGap: `${pad * 2}px`,
        });
      };
      const measure = () => {
        if (!end) return 1;
        const offset = end.getBoundingClientRect().left - r.flow.getBoundingClientRect().left;
        return Math.max(1, Math.floor(offset / width) + 1);
      };
      // Stima generosa dal numero di caratteri, così già al primo tentativo
      // tutto il testo sta dentro il contenitore.
      const fontSize = parseFloat(getComputedStyle(r.flow).fontSize) || 19;
      const colWidth = (width - 2 * pad * cols) / cols;
      const lines = Math.max(1, Math.floor((vh - top * 2) / (fontSize * 1.6)));
      const charsPerPage = Math.max(1, (colWidth / (fontSize * 0.42)) * lines * cols);
      let guess = Math.ceil((r.flow.textContent.length / charsPerPage) * 1.6) + 4;
      setPages(guess);
      while (measure() >= guess && guess < 4096) {
        guess *= 2;
        setPages(guess);
      }
      r.pages = measure();
      setPages(r.pages);
      r.range.max = String(r.pages - 1);
    };

    r.show = (page, animate = true) => {
      r.page = Math.max(0, Math.min(r.pages - 1, page));
      r.flow.classList.toggle('animate', animate);
      r.flow.style.transform = `translate3d(${-r.page * r.width}px,0,0)`;
      r.range.value = String(r.page);
      const total = state.book.chapters.length;
      r.pageEl.textContent = `Cap. ${r.chapter.index + 1}/${total} · pag. ${r.page + 1} di ${r.pages}`;
    };

    r.fraction = () => (r.pages > 1 ? r.page / (r.pages - 1) : 1);

    r.saveProgress = (immediate = false) => {
      if (!r.chapter) return;
      const chapterId = r.chapter.id;
      const fraction = r.fraction();
      const now = new Date().toISOString();
      const prev = state.progress[chapterId] || { max: 0 };
      state.progress[chapterId] = {
        fraction,
        max: Math.max(prev.max || 0, fraction),
        openedAt: prev.openedAt || now,
        updatedAt: now,
      };
      clearTimeout(r.saveTimer);
      const entry = state.progress[chapterId];
      const send = () => data.saveProgress(state.user.uid, chapterId, entry).catch(() => {});
      // Salvataggio differito: si scrive una volta ogni qualche pagina, non a ogni tocco.
      if (immediate) send();
      else r.saveTimer = setTimeout(send, 2500);
    };

    r.next = () => {
      if (!r.chapter) return;
      if (r.page < r.pages - 1) {
        r.show(r.page + 1);
        r.saveProgress();
      } else if (r.chapter.next) {
        go(`#/leggi/${r.chapter.next}`, { startAt: 'start' });
      } else {
        showEndCard();
      }
    };

    r.prev = () => {
      if (!r.chapter) return;
      if (!r.endCard.hidden) {
        r.endCard.hidden = true;
        return;
      }
      if (r.page > 0) {
        r.show(r.page - 1);
        r.saveProgress();
      } else if (r.chapter.prev) {
        go(`#/leggi/${r.chapter.prev}`, { startAt: 'end' });
      }
    };

    function showEndCard() {
      const b = state.book;
      r.endCard.hidden = false;
      r.endCard.innerHTML = `<div class="inner">
        <p class="eyebrow">Fine dell'anteprima</p>
        <h2>Vuoi sapere come continua?</h2>
        <p>${esc(b.endNote || 'Il manoscritto completo è disponibile su richiesta.')}</p>
        ${contactForm().replace('class="card"', 'class="card" style="background:transparent"')}
        <div class="actions">
          <button class="btn ghost small" data-r="back-to-text">Torna al testo</button>
          <a class="btn ghost small" href="#/libreria">Indice dei capitoli</a>
        </div>
      </div>`;
    }

    // ---- pannelli (indice e impostazioni)
    r.closeSheets = () => root.querySelectorAll('.sheet, .sheet-backdrop').forEach((el) => el.remove());

    function openSheet(html) {
      r.closeSheets();
      const backdrop = document.createElement('div');
      backdrop.className = 'sheet-backdrop';
      backdrop.addEventListener('click', r.closeSheets);
      const sheet = document.createElement('div');
      sheet.className = 'sheet';
      sheet.setAttribute('role', 'dialog');
      sheet.innerHTML = html;
      root.append(backdrop, sheet);
      return sheet;
    }

    function openToc() {
      const sheet = openSheet(`<h3>Indice</h3><nav class="toc">${state.book.chapters
        .map((c) => `<a href="#/leggi/${esc(c.id)}" class="${c.id === r.chapter?.id ? 'on' : ''}">${esc(c.title)}${
          c.subtitle ? `<span>${esc(c.subtitle)}</span>` : ''}</a>`)
        .join('')}</nav>`);
      sheet.addEventListener('click', (e) => {
        if (e.target.closest('a')) r.closeSheets();
      });
    }

    function openSettings() {
      const render = () => {
        const pr = prefs();
        sheet.innerHTML = `<h3>Impostazioni di lettura</h3>
          <div class="row"><span>Dimensione testo</span>
            <div class="seg"><button data-size="-1" aria-label="Riduci">A−</button><button disabled>${pr.size}</button><button data-size="1" aria-label="Ingrandisci">A+</button></div></div>
          <div class="row"><span>Carattere</span>
            <div class="seg"><button data-font="serif" class="${pr.font === 'serif' ? 'on' : ''}" style="font-family:var(--serif)">Serif</button><button data-font="sans" class="${pr.font === 'sans' ? 'on' : ''}">Sans</button></div></div>
          <div class="row"><span>Tema</span><div>
            <button class="swatch ${pr.theme === 'light' ? 'on' : ''}" data-theme="light" style="background:#fbf8f1" aria-label="Chiaro"></button>
            <button class="swatch ${pr.theme === 'sepia' ? 'on' : ''}" data-theme="sepia" style="background:#f3e7cf" aria-label="Seppia"></button>
            <button class="swatch ${pr.theme === 'dark' ? 'on' : ''}" data-theme="dark" style="background:#15181c" aria-label="Scuro"></button>
          </div></div>`;
      };
      const sheet = openSheet('');
      render();
      sheet.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const pr = prefs();
        if (btn.dataset.size) pr.size = Math.max(14, Math.min(30, pr.size + Number(btn.dataset.size)));
        else if (btn.dataset.font) pr.font = btn.dataset.font;
        else if (btn.dataset.theme) pr.theme = btn.dataset.theme;
        else return;
        storage.set('reader-prefs', pr);
        applyPrefs(pr);
        relayout();
        render();
      });
    }

    // Ricalcola le pagine mantenendo la posizione relativa nel capitolo.
    function relayout() {
      if (!r.chapter) return;
      const f = r.fraction();
      r.layout();
      r.show(Math.round(f * (r.pages - 1)), false);
    }

    // ---- eventi
    root.addEventListener('click', (e) => {
      const action = e.target.closest('[data-r]')?.dataset.r;
      if (action === 'toc') openToc();
      else if (action === 'settings') openSettings();
      else if (action === 'back-to-text') r.endCard.hidden = true;
    });

    let touch = null;
    r.viewport.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1 || !r.endCard.hidden) return (touch = null);
      touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
    }, { passive: true });
    r.viewport.addEventListener('touchend', (e) => {
      if (!touch) return;
      const dx = e.changedTouches[0].clientX - touch.x;
      const dy = e.changedTouches[0].clientY - touch.y;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        touch.swiped = true;
        if (dx < 0) r.next();
        else r.prev();
      }
    }, { passive: true });

    // Tocco/clic sui bordi: un terzo a sinistra torna indietro, il resto va avanti.
    r.viewport.addEventListener('click', (e) => {
      if (!r.endCard.hidden || e.target.closest('a, button, input, textarea, select')) return;
      if (touch?.swiped) {
        touch = null;
        return;
      }
      const rect = r.viewport.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      if (x < 0.33) r.prev();
      else r.next();
    });

    r.range.addEventListener('input', () => {
      r.show(Number(r.range.value), false);
    });
    r.range.addEventListener('change', () => r.saveProgress());

    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select') || root.querySelector('.sheet')) {
        if (e.key === 'Escape') r.closeSheets();
        return;
      }
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault();
        r.next();
      } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        r.prev();
      }
    };
    let resizeTimer;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(relayout, 120);
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') r.saveProgress(true);
    };
    const noCopy = (e) => e.preventDefault();
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    // Ricalcola anche quando cambia solo l'area del testo (es. barra di Safari
    // che compare o scompare, riga in basso che cambia altezza).
    let lastSize = '';
    const ro = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          const size = `${r.viewport.clientWidth}x${r.viewport.clientHeight}`;
          if (size !== lastSize) {
            lastSize = size;
            onResize();
          }
        })
      : null;
    ro?.observe(r.viewport);
    document.addEventListener('visibilitychange', onHide);
    root.addEventListener('contextmenu', noCopy);
    root.addEventListener('copy', noCopy);
    r.cleanup.push(() => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
      document.removeEventListener('visibilitychange', onHide);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = '#16324a';
    });
  }

  function closeReader() {
    if (!reader) return;
    clearTimeout(reader.saveTimer);
    if (reader.chapter) reader.saveProgress(true);
    reader.cleanup.forEach((fn) => fn());
    reader = null;
  }

  // ------------------------------------------------------------- moduli

  app.addEventListener('submit', async (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const kind = form.dataset.form;
    const slot = form.querySelector('[data-slot="msg"]');
    const btn = form.querySelector('button[type="submit"]');
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    if (kind === 'register') body.consent = fd.get('consent') === 'on';
    const showError = (err) => (slot.innerHTML = `<p class="error">${esc(data.errorMessage(err))}</p>`);

    slot.innerHTML = '';
    btn.disabled = true;
    try {
      if (kind === 'upload') {
        const files = form.querySelector('input[type=file]').files;
        if (!files.length) throw Object.assign(new Error(), { userMessage: 'Seleziona i file da pubblicare.' });
        const chapters = await data.publishContent(files);
        await loadBook();
        slot.innerHTML = `<p class="success">Pubblicati ${chapters.length} capitoli: ${chapters.map((c) => esc(c.title)).join(', ')}.</p>`;
      } else if (kind === 'contact') {
        await data.sendMessage(state.user.uid, body.message);
        form.querySelector('textarea').value = '';
        slot.innerHTML = '<p class="success">Messaggio inviato. Grazie! Riceverai una risposta all\'indirizzo email con cui ti sei registrato.</p>';
      } else {
        const user = kind === 'register' ? await data.register(body) : await data.login(body.email, body.password);
        state.user = user;
        await loadProgress();
        const next = sessionStorage.getItem('after-login');
        sessionStorage.removeItem('after-login');
        const first = state.book.chapters[0];
        go(next || (kind === 'register' && first ? `#/leggi/${first.id}` : '#/libreria'));
      }
    } catch (err) {
      showError(err);
    } finally {
      btn.disabled = false;
    }
  });

  app.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    const slot = app.querySelector('[data-slot="msg"]');
    const say = (html) => slot && (slot.innerHTML = html);
    try {
      if (action === 'logout') {
        closeReader();
        await data.logout();
        state.user = null;
        state.progress = {};
        go('#/');
      } else if (action === 'reset') {
        const email = app.querySelector('input[name=email]').value.trim();
        if (!email) return say('<p class="error">Scrivi la tua email qui sopra, poi premi di nuovo «Password dimenticata?».</p>');
        await data.resetPassword(email);
        say(`<p class="success">Se esiste un account per ${esc(email)}, riceverai un'email per scegliere una nuova password.</p>`);
      } else if (action === 'resend') {
        await data.resendVerification();
        say('<p class="success">Email inviata di nuovo.</p>');
      } else if (action === 'verified') {
        state.user = await data.refreshUser();
        if (state.user?.emailVerified) route();
        else say('<p class="error">L\'email non risulta ancora confermata. Apri il link ricevuto e riprova.</p>');
      } else if (action === 'csv' && adminStats) {
        downloadCsv(adminStats);
      }
    } catch (err) {
      say(`<p class="error">${esc(data.errorMessage(err))}</p>`);
    }
  });

  async function loadProgress() {
    try {
      state.progress = await data.getProgress(state.user.uid);
    } catch {
      state.progress = {};
    }
  }

  // -------------------------------------------------------------- router

  let routeOpts = {};
  function go(hash, opts = {}) {
    routeOpts = opts;
    if (location.hash === hash) route();
    else location.hash = hash;
  }

  function route() {
    const opts = routeOpts;
    routeOpts = {};
    const hash = location.hash.replace(/^#/, '') || '/';
    const [, section, param] = hash.split('/');
    const needsUser = ['libreria', 'leggi', 'admin'].includes(section);
    if (needsUser && !state.user) {
      sessionStorage.setItem('after-login', location.hash);
      return go('#/registrati');
    }
    if ((section === 'accedi' || section === 'registrati') && state.user) return go('#/libreria');
    if (state.bookMissing && (section === 'libreria' || section === 'leggi')) return go('#/');
    if (section === 'admin' && !state.user.isAdmin) return go('#/');

    if (section !== 'leggi') closeReader();
    window.scrollTo(0, 0);
    switch (section) {
      case '':
        return viewHome();
      case 'registrati':
        return viewAuth('register');
      case 'accedi':
        return viewAuth('login');
      case 'privacy':
        return viewPrivacy();
      case 'libreria':
        return viewLibrary();
      case 'leggi':
        return viewReader(decodeURIComponent(param || ''), opts.startAt);
      case 'admin':
        return viewAdmin();
      default:
        return go('#/');
    }
  }

  const EMPTY_BOOK = {
    title: 'Anteprima del libro', subtitle: '', author: '', genre: '', tagline: '', synopsis: [],
    aboutAuthor: '', contactEmail: '', endNote: '', chapters: [],
  };

  async function loadBook() {
    const book = await data.getBook();
    state.bookMissing = !book || !book.chapters?.length;
    state.book = { ...EMPTY_BOOK, ...(book || {}) };
  }

  async function init() {
    if (!data.isConfigured) {
      app.innerHTML = `<div class="page"><div class="auth"><div class="card">
        <h1 style="font-family:var(--serif);margin-top:0">Quasi pronto</h1>
        <p>Manca la configurazione di Firebase: apri <code>public/firebase-config.js</code> e incolla i dati del
        tuo progetto, come spiegato nel file LEGGIMI/README.</p></div></div></div>`;
      return;
    }
    try {
      await loadBook();
    } catch {
      app.innerHTML = '<div class="loading">Impossibile caricare il libro. Controlla la connessione e ricarica la pagina.</div>';
      return;
    }
    let started = false;
    data.watchUser(async (user) => {
      const changed = (state.user?.uid || null) !== (user?.uid || null);
      // Stesso utente già impostato dal modulo di accesso/registrazione: nulla da fare.
      if (started && !changed) return;
      state.user = user;
      if (user) {
        if (changed) {
          await loadProgress();
          data.touchLastSeen(user.uid);
        }
      } else {
        state.progress = {};
      }
      if (!started) {
        started = true;
        window.addEventListener('hashchange', route);
        route();
      } else if (!user && changed) {
        // uscita (anche da un'altra scheda): si torna alla vetrina
        closeReader();
        go('#/');
      }
    });
  }

  init();
})();
