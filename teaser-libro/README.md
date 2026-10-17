# Anteprima del libro — web app teaser per editori

Web app, pensata prima di tutto per il cellulare, che permette di leggere **previa
registrazione** alcuni capitoli di un libro come se fosse un ebook. Serve come teaser
per case editrici, agenti e scout letterari: l'autore vede chi si è registrato, fin
dove ha letto e riceve i messaggi di chi vuole il manoscritto completo.

## Funzionalità

- **Vetrina pubblica**: copertina, sinossi, elenco dei capitoli (bloccati), biografia.
- **Registrazione e accesso** con nome, email, password, ruolo (editore, agente,
  scout, lettore…), casa editrice/agenzia e consenso privacy.
- **Lettore stile ebook**:
  - testo impaginato in pagine da sfogliare (scorrimento del dito, tocco sui bordi,
    frecce della tastiera o barra di avanzamento);
  - su schermi larghi due colonne affiancate come un libro aperto;
  - dimensione del testo, carattere serif/sans e tema chiaro/seppia/scuro;
  - indice dei capitoli e passaggio automatico al capitolo successivo;
  - **segno di lettura salvato sul server**, quindi si riprende anche da un altro dispositivo;
  - alla fine dell'anteprima, un modulo per scrivere all'autore.
- **Protezioni di base**: i capitoli arrivano solo agli utenti autenticati, selezione,
  copia, menu contestuale e stampa sono disattivati nel lettore e ogni pagina mostra
  «Copia riservata a *email del lettore*».
- **Pannello statistiche** per l'autore: registrati, quanti editori/agenti, percentuale
  letta di ogni capitolo per ogni lettore, messaggi ricevuti, esportazione CSV per Excel.

> Nessuna protezione web impedisce davvero a un utente determinato di copiare il testo
> (può sempre fotografare lo schermo): la filigrana con l'email serve da deterrente.

## Avvio

Serve solo [Node.js](https://nodejs.org) 18 o superiore, senza alcuna dipendenza da installare.

```bash
cd teaser-libro
ADMIN_EMAILS=tua@email.it npm start
```

Apri <http://localhost:3000>. Registrati con l'email indicata in `ADMIN_EMAILS` per
vedere il link **Statistiche**.

| Variabile | Significato |
|---|---|
| `PORT` | porta (predefinita `3000`) |
| `ADMIN_EMAILS` | email, separate da virgola, che possono vedere le statistiche |
| `SESSION_SECRET` | segreto per firmare i cookie (se manca viene creato in `data/secret.key`) |
| `DATA_DIR` | dove salvare utenti e progressi (predefinita `./data`) |
| `COOKIE_SECURE` | `1` per cookie solo HTTPS (impostato automaticamente dietro un proxy HTTPS) |

## Inserire il tuo libro

Tutto sta nella cartella `content/`:

1. **`content/book.json`**: titolo, autore, genere, frase di lancio, sinossi, biografia,
   numero totale di capitoli/parole del manoscritto, email di contatto, testo di fine
   anteprima ed elenco dei capitoli da mostrare.
2. **`content/chapters/*.md`**: un file per capitolo, in testo semplice:

   ```markdown
   # Titolo del capitolo

   > Epigrafe facoltativa
   > -- Autore della citazione

   Primo paragrafo. Una riga vuota separa i paragrafi.

   -- Battuta di dialogo -- disse lei. (i due trattini diventano una lineetta —)

   *corsivo* e **grassetto**

   ***
   (tre asterischi su una riga = stacco di scena)
   ```

Dopo aver modificato i contenuti, riavvia il server.

I tre capitoli presenti sono un **testo segnaposto** da sostituire con il tuo.

## Pubblicazione online

L'app è un unico processo Node che salva i dati in `data/db.json`, quindi va bene
qualunque hosting che offra Node e un disco persistente (una VPS, Render, Railway,
Fly.io…). Con Docker:

```bash
docker build -t teaser-libro .
docker run -p 3000:3000 -v teaser-dati:/data -e ADMIN_EMAILS=tua@email.it teaser-libro
```

Mettila dietro HTTPS: quasi tutti i servizi citati lo fanno in automatico. Fai un
backup periodico della cartella dei dati.

**Privacy**: raccogli dati personali, quindi adatta la pagina `#/privacy` (in
`public/app.js`, funzione `viewPrivacy`) indicando i tuoi dati reali di titolare del
trattamento.

## Struttura

```
teaser-libro/
├── server.js            server HTTP e API
├── lib/
│   ├── auth.js          password (scrypt) e cookie di sessione firmati
│   ├── markdown.js      conversione dei capitoli in HTML
│   └── store.js         archivio su file JSON
├── content/             il libro (metadati + capitoli in Markdown)
├── public/              interfaccia: index.html, app.js, style.css, icona, manifest
└── Dockerfile
```
