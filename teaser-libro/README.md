# Anteprima del libro: web app teaser per editori

Web app, pensata prima di tutto per il cellulare, che permette di leggere **previa
registrazione** alcuni capitoli di un libro come se fosse un ebook. Serve come teaser
per case editrici, agenti e scout letterari: l'autore vede chi si è registrato, fin
dove ha letto e riceve i messaggi di chi vuole il manoscritto completo.

Si pubblica **gratis** con [Firebase](https://firebase.google.com) di Google (piano
*Spark*, senza carta di credito). Non c'è nessun server da gestire: il sito è fatto di
semplici pagine HTML, CSS e JavaScript, mentre Firebase si occupa degli account e
conserva i dati.

## Funzionalità

- **Pagina di presentazione pubblica**: copertina, sinossi, elenco dei capitoli (bloccati) e biografia.
- **Registrazione e accesso** con nome, email, password, ruolo (editore, agente, scout…),
  casa editrice/agenzia e consenso privacy. Il recupero della password funziona via email.
- **Lettore stile ebook**:
  - pagine da sfogliare con il dito, toccando i bordi, con le frecce della tastiera o con la barra di avanzamento;
  - su schermi larghi due colonne affiancate, come un libro aperto;
  - dimensione del testo, carattere e tema chiaro, seppia o scuro;
  - indice dei capitoli;
  - **segno di lettura salvato online**, quindi si riprende anche da un altro dispositivo;
  - alla fine dell'anteprima, un modulo per scrivere all'autore.
- **Protezioni**:
  - il testo dei capitoli è leggibile solo dagli utenti registrati, come stabilito dalle regole di sicurezza di Firebase;
  - nel lettore copia, selezione e stampa sono disattivate;
  - ogni pagina mostra «Copia riservata a *email del lettore*».
- **Pannello dell'autore**:
  - numero di registrati e quanti sono editori o agenti;
  - percentuale letta di ogni capitolo per ogni lettore;
  - messaggi ricevuti ed esportazione CSV per Excel;
  - caricamento dei capitoli direttamente dal browser.

> Nessun sito può impedire davvero a un utente determinato di copiare il testo (può
> sempre fotografare lo schermo): la filigrana con l'email serve da deterrente.

---

## Guida alla pubblicazione (circa 20 minuti)

### 1. Crea il progetto Firebase

1. Vai su <https://console.firebase.google.com> e accedi con un account Google.
2. **Crea un progetto** con un nome qualsiasi, per esempio `anteprima-libro`. Google Analytics
   non serve e puoi disattivarlo. Il progetto parte con il piano gratuito *Spark*, che
   non chiede la carta di credito.
3. Nel menu a sinistra apri **Authentication** e premi **Inizia**. Nella scheda
   *Metodo di accesso* abilita **Email/password** (solo la prima opzione) e salva.
4. Apri **Firestore Database** e premi **Crea database**. Scegli una località in Europa
   (per esempio `eur3` oppure `europe-west`) e la **modalità di produzione**.

### 2. Collega il sito al progetto

1. In Firebase apri l'icona a ingranaggio, poi **Impostazioni progetto**. In fondo alla
   scheda *Generali*, sotto «Le tue app», premi l'icona **`</>`** (Web), dai un nome
   all'app e registrala. Non spuntare Firebase Hosting in questo passaggio: lo
   configuriamo dopo.
2. Ti viene mostrato un blocco `firebaseConfig`. Copia i valori in
   **`public/firebase-config.js`**.
3. Scrivi l'ID del progetto (lo trovi in *Impostazioni progetto*) dentro **`.firebaserc`**.
4. Indica chi è l'autore. In **Firestore Database → Dati** premi *Avvia raccolta*, chiamala
   `config` e crea il documento con ID `admins`. Aggiungi un campo `emails` di tipo
   **array** con dentro la tua email, scritta in minuscolo. Così la tua email non compare
   né nel sito né nel codice.

### 3. Pubblica

Ci sono due strade. La prima è consigliata.

#### Strada A: tutto su Firebase Hosting (consigliata)

Serve [Node.js](https://nodejs.org) installato sul computer, versione LTS. Apri un
terminale nella cartella `teaser-libro` e lancia:

```bash
npm run login     # la prima volta: apre il browser per accedere con Google
npm run deploy    # pubblica il sito e le regole di sicurezza
```

Alla fine compare l'indirizzo del sito, del tipo `https://anteprima-libro.web.app`.

> **Questo progetto** è pubblicato su **https://michelemarini-libri.web.app**. Il vecchio
> indirizzo `https://non-e--cio--che-pensi.web.app` reindirizza automaticamente al nuovo
> (vedi i due siti in `firebase.json`). Se aggiungi un altro indirizzo, ricordati di
> inserirlo anche in Authentication → Impostazioni → Domini autorizzati.
Per ogni aggiornamento successivo basta ripetere `npm run deploy`.

#### Strada B: senza installare nulla

1. Le **regole di sicurezza** vanno pubblicate a mano. In Firebase apri **Firestore Database**,
   scheda **Regole**, incolla tutto il contenuto di `firestore.rules` e premi **Pubblica**.
2. Per il **sito** vai su <https://app.netlify.com/drop> e trascina la cartella **`public`**.
   Il sito è subito online su un indirizzo `….netlify.app`. Registrati o accedi a Netlify
   e «rivendica» il sito (*claim*), altrimenti dopo un po' viene cancellato. Per
   aggiornarlo, trascina di nuovo la cartella.
3. In Firebase apri **Authentication**, poi **Impostazioni** e **Domini autorizzati**, e
   aggiungi l'indirizzo `….netlify.app`.

Se modifichi `firestore.rules`, ricordati di ripubblicare le regole: con la strada A
basta `npm run deploy`, con la strada B le incolli di nuovo nella console.

### 4. Carica i capitoli

1. Apri il sito e **registrati con la tua email**, quella messa in `config/admins`.
2. Conferma l'email con il link che ti arriva (controlla anche lo spam).
   È obbligatorio per l'account autore: così nessuno può spacciarsi per te.
3. Premi **Statistiche**, poi **Ho confermato**. In fondo alla pagina, in
   *Contenuti del libro*, seleziona insieme `content/book.json` e tutti i file `.md`
   dei capitoli, poi premi **Pubblica i capitoli**.

Fatto! Puoi mandare il link a editori e agenti. Ogni volta che modifichi i capitoli,
ripeti il punto 4: i progressi dei lettori restano.

---

## Preparare i contenuti

Tutto sta nella cartella `content/`. Questa cartella **non** viene pubblicata
come file: il testo arriva online solo tramite il pannello dell'autore.

1. **`content/book.json`** contiene titolo, autore, genere, frase di lancio, sinossi,
   biografia, numero totale di capitoli/parole del manoscritto, email di contatto,
   testo di fine anteprima ed elenco dei capitoli da mostrare (`id`, `file`, `title`, `subtitle`).
2. **`content/chapters/*.md`** contiene un file per capitolo, in testo semplice:

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

I tre capitoli presenti sono un **testo segnaposto** da sostituire con il tuo.

## Limiti del piano gratuito

Il piano Spark di Firebase, in sintesi (verifica i valori aggiornati su
<https://firebase.google.com/pricing>):

- Firestore: 1 GB di dati, 50.000 letture e 20.000 scritture al giorno;
- Hosting: 10 GB di spazio e circa 10 GB di traffico al mese;
- Authentication con email e password: gratuita.

Per un teaser letto da qualche centinaio di persone al giorno sono ampiamente
sufficienti. Il segno di lettura viene salvato al massimo ogni qualche secondo, proprio
per non consumare scritture. Se un limite viene raggiunto, il servizio si ferma fino al
giorno dopo: con il piano gratuito non arriva mai una fattura.

## Privacy

Raccogli dati personali (nome, email, ruolo), quindi:

- adatta la pagina `#/privacy` (in `public/app.js`, funzione `viewPrivacy`) con i tuoi dati reali;
- se qualcuno chiede la cancellazione, elimina il suo account dalla console Firebase
  (*Authentication → Utenti*) e i suoi documenti in Firestore (`users` e `progress`).

## Struttura

```
teaser-libro/
├── public/                  il sito (è l'unica cartella che va online)
│   ├── index.html
│   ├── app.js               interfaccia: pagine, lettore, pannello autore
│   ├── data.js              collegamento a Firebase (accessi e dati)
│   ├── firebase-config.js   ← la tua configurazione
│   ├── markdown.js          conversione dei capitoli
│   ├── style.css, icon.svg, manifest.webmanifest
├── content/                 il libro (metadati + capitoli in Markdown)
├── firestore.rules          ← regole di sicurezza (metti la tua email)
├── firebase.json, .firebaserc   configurazione per la pubblicazione
└── package.json             comandi npm run login / deploy
```
