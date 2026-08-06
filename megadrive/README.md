# Martello & Scatole — versione per Sega Mega Drive

Conversione del gioco HTML5 *Martello & Scatole* in una cartuccia per Sega Mega
Drive / Genesis: stessi movimenti, stessa regia, scritta in C e assembly 68000
e compilata in una ROM da 512 KB. Le quattro cave dell'originale ci sono tutte,
più nove nuove che introducono una cosa per volta — ascensori, assi a tempo,
assi marce, pipistrelli, nastro trasportatore, scintille, talpe, elmi,
carrello da miniera — infilate fra quelle vecchie in ordine di difficoltà.

## Giocare

Il file da dare all'emulatore è **`martello.bin`**, oppure **`hammer.bin`** se
si preferisce l'inglese (va bene anche rinominarli `.md` o `.gen`). Le due ROM
sono lo stesso gioco: cambiano le scritte, i nomi delle cave e il logo del
titolo. Funzionano con BlastEm, Genesis Plus GX, Kega Fusion, Exodus,
RetroArch e i mini-console basati su questi emulatori; l'intestazione della
cartuccia dichiara le tre regioni, quindi non serve impostare niente.

| Comando | Azione |
|---|---|
| Croce direzionale | corri |
| B | salta |
| A o C | martella |
| ↓ + B (fermo) | scendi dalle assi |
| START | pausa (e, in pausa, A ricomincia la cava) |

Per scendere da un'asse bisogna essere fermi: tenendo il basso mentre si corre
la croce direzionale prende spesso la diagonale, e il salto diventerebbe una
caduta senza volerlo.

Obiettivo: stordire gli spiritelli a martellate, trascinarli fino al
macchinario e inscatolarli tutti; poi si attraversa il portale che si apre.
Tre cuori, le punte dei blocchi irti uccidono al primo tocco.

Nelle cave nuove: le **assi verdi** salgono e scendono da sole, le **gialle**
ci sono e non ci sono (e lampeggiano prima di sparire), le **crepate** cedono
mezzo secondo dopo che ci sali, il **nastro** spinge di lato tutto quello che
ci sta sopra, le **palle di fuoco** girano attorno a un perno e costano un
cuore, i **pipistrelli** fanno la spola e costano un cuore anche loro (ma la
martellata li fa girare di bocca), e il **carrello da miniera** si sposta solo
a martellate — dalla parte opposta a dove batti. Fra gli spiritelli, quelli
**con la scia** corrono una volta e mezzo e si svegliano prima, quelli **con
l'elmo** rimandano indietro le martellate (l'unico modo è saltargli in testa) e
le **talpe** stanno sotto terra e si affacciano a tempo: si prendono solo
mentre sono fuori.

Due mosse che conviene sapere: uno spiritello addormentato lasciato su un
nastro **arriva al macchinario da solo**, e lo spiritello con l'elmo è l'unico
che si può toccare senza rimetterci un cuore — ma solo dall'alto.

Due cose da guardare mentre si gioca: la **barra sopra la testa** dello
spiritello stordito dice quanto manca prima che si svegli (se lo si sta
trasportando, quanto manca prima che scappi), e la **freccia sul bordo dello
schermo** punta verso il macchinario mentre si trasporta, verso il portale
quando si è aperto.

### Scegliere la cava

Per provarne una senza rifarsi tutte le altre: **sul titolo, A + B + C
insieme**. In fondo allo schermo compare `< cava  1 >`, la croce direzionale
cambia il numero e START comincia da lì. Tre tasti insieme non si premono per
sbaglio, e il titolo non lo dice a nessuno.

Con il trucco acceso, in pausa **C salta alla cava dopo** senza doverla finire.
La scelta resta finché non si spegne la console, quindi dopo una morte o un
finale si riparte da dov'eri. Il cronometro finale, ovviamente, non vuol più
dire niente.

## Costruire la ROM

Serve un compilatore incrociato per 68000 e Python con Pillow (solo per
rigenerare grafica e livelli):

```bash
sudo apt install gcc-m68k-linux-gnu binutils-m68k-linux-gnu python3-pil kbd
make            # produce martello.bin (italiano)
make LANG=en    # produce hammer.bin (inglese)
make both       # tutte e due
make assets     # rigenera res/gfx.* e res/levels.* da tools/
make run        # avvia la ROM in BlastEm
```

`tools/shot.sh` fa girare la ROM su uno schermo X finto, le manda una sequenza
di comandi e salva delle schermate: è così che la conversione è stata provata
senza un televisore.

```bash
tools/shot.sh martello.bin prova.png 4 Return:6 wait:200 Right:60 a:6 shot
```

`tools/record.sh` fa la stessa cosa ma registra qualche secondo quadro per
quadro: serve per gli sfarfallii, che a occhio si vedono ma in una schermata
sola no.

```bash
tools/record.sh martello.bin quadri/ 3 Return:6 wait:300 Right:60
```

## Com'è fatto

```
src/boot.s        vettori, intestazione della cartuccia, avvio, interruzioni
src/mathi.s       moltiplicazione e divisione a 32 bit per 68000
src/md.h          registri del VDP, sprite, joypad
src/vdp.c         disegni, tavolozze, piani, sprite, scorrimento
src/pad.c         lettura del joypad a tre tasti
src/psg.c         effetti sonori sul generatore di suoni
src/text.c        scritte (un disegno da 8x8 per lettera)
src/strings.h     tutte le frasi, in italiano e in inglese
src/arena.c       mappa della cava, disegno del terreno, scorrimento verticale
src/entities.c    nano, spiritelli, blocchi irti, assi mobili
src/game.c        stati, onda d'urto, macchinario, portale, pannello, sprite
src/fault.c       schermata di errore se il processore inciampa
res/gfx.*         disegni e tavolozze (generati)
res/levels.*      le tredici cave (generate)
tools/md_assets.py   converte i PNG dell'originale nel formato del VDP
tools/md_levels.py   converte le mappe delle cave
tools/make_logo_en.py disegna il logo della versione inglese
tools/preview_levels.py  disegna le cave e ne controlla i limiti
tools/checkalign.py  cerca accessi disallineati nel codice compilato
tools/fixrom.py      riempimento e checksum della cartuccia
```

### Dal browser alla console

Il gioco originale gira in virgola mobile, con celle da 32 pixel, distanze in
pixel al secondo e un passo di 1/120 di secondo. Qui:

- **la cella è di 16 pixel**, metà: il mondo passa da 960×1504 a 480×768 e ci
  sta comodamente nella memoria video;
- **tutto è a numeri interi in virgola fissa 16.16**, con un passo pari al
  quadro del Mega Drive (1/60 di secondo). Le costanti nel codice sono ancora
  quelle riconoscibili dell'originale: le macro `VEL`, `ACC` e `PXI` fanno la
  conversione una volta per tutte;
- **niente radici quadrate né seni in virgola mobile**: c'è una radice intera,
  una tabella di seni a 256 passi e una lunghezza di vettore approssimata a un
  sedicesimo di pixel;
- **la grafica** è quella originale, dimezzata e ridotta ai colori del VDP
  (quattro tavolozze da quindici colori, tre bit per componente). Ogni immagine
  ha un peso nel calcolo delle tavolozze: senza, un cuore di sedici pixel non
  avrebbe voce contro un foglio di disegni e finirebbe viola, e il cielo — che
  è una sfumatura lunga — si vedrebbe a fasce. L'asse mobile, che
  nell'originale è d'acciaio azzurrino, è rifatta di legno: fra i verdi e i
  bruni del mondo il grigio non ci stava e usciva rosa;
- **il fondale** occupa il piano B e scorre più piano della cava; metà
  immagine basta, perché il VDP sa ribaltarla e la giuntura sparisce. Le nuvole
  del ribaltamento non se ne accorgono, il sole sì: ne comparivano due, uno per
  lato. Ora la metà non ribaltata usa una copia del cielo senza sole (`strip_sun`
  in `tools/md_assets.py`, che cancella il disco e il suo alone lasciando stare
  la nuvola che gli passa davanti), e il sole resta uno solo, dov'era;
- **il pannello in cima** è il riquadro fisso del VDP, così non scorre; i
  cartelli brevi (cava ripulita, pausa) si scrivono invece dentro il piano di
  gioco, per non coprire la scena;
- **le scritte** usano il carattere a punti da 8x8 delle console di testo (il
  classico disegno VGA, che `tools/md_assets.py` legge da
  `/usr/share/consolefonts/Lat15-VGA8.psf.gz`, pacchetto `kbd`). Schiacciare un
  TrueType in otto pixel dava lettere impastate: a quella misura serve un
  carattere disegnato punto per punto. Le vocali accentate viaggiano come
  codici bassi (`\1` = à, `\2` = è ... `\6` = ù), perché in ASCII non ci sono.

Il piano di gioco del VDP è alto 256 pixel e le cave arrivano a 768: le righe
di celle si ridipingono man mano che la vista sale, due per volta, dentro il
ritorno di quadro.

### Cave e cose nuove

Le nove cave nuove costano in tutto un'ottantina di celle di disegni: quasi
tutto è codice e mappe.

- **l'ascensore** è l'asse mobile con la velocità sulla y invece che sulla x.
  La corsa è fissa, tre celle sopra e tre sotto il punto dove sta nella mappa:
  la prima versione rimbalzava contro il soffitto, e disegnare una cava voleva
  dire costruire un pozzo attorno a ogni ascensore. Chi ci sta sopra viene
  portato su e giù passando dalla stessa risoluzione delle collisioni del nano,
  o salendo lo infilerebbe nel soffitto;
- **l'asse a intermittenza** è la stessa asse con un contatore: centocinquanta
  quadri c'è, sessantasei non c'è, e negli ultimi quaranta lampeggia. Le due
  lettere della mappa (`i` e `j`) sono i due tempi opposti, così mentre una c'è
  l'altra non c'è e la strada esiste sempre, ma mai tutta insieme;
- **lo spiritello svelto** è lo stesso spiritello con un campo in più: corre una
  volta e mezzo, dorme tre quinti del tempo e si porta dietro una scintilla,
  messa dov'era quattro quadri fa. Zero disegni nuovi: la scia è il modo di
  distinguerlo;
- **la palla di fuoco** gira attorno a un perno e basta un angolo che avanza —
  niente ragionamento, niente collisioni col terreno. Il disegno è generato a
  fasce concentriche da `tools/md_assets.py`: un pallino da otto pixel non si
  vedeva abbastanza per una cosa che costa un cuore.

- **l'asse che si sbriciola** è un contatore che parte quando il nano ci mette
  il piede: trentaquattro quadri crepata e tremante, poi molla e cade, e dopo
  due secondi e mezzo torna al suo posto. Le crepe sono le stesse tavole con
  sei spaccature disegnate sopra da `tools/md_assets.py`;
- **il nastro** è una cella solida che spinge di lato chi ci sta sopra: il
  nano, i blocchi irti e soprattutto gli spiritelli addormentati, che così si
  consegnano al macchinario da soli — la bocca accetta anche chi arriva senza
  essere portato. Si anima **senza toccare la mappa**: i quattro fotogrammi
  della cella stanno in memoria di lavoro e a turno finiscono con un DMA nello
  stesso posto in memoria video. Ridipingere le celle costerebbe cento volte
  tanto, e il nastro che va a sinistra è lo stesso disegno ribaltato dal VDP;
- **lo spiritello con l'elmo** manda a vuoto l'onda d'urto e va pestato in
  testa: è l'unico che si può toccare impunemente, ma solo cadendogli addosso.
  L'elmo è uno sprite da 16x8 che sta *prima* di lui nella lista, o gli
  finirebbe dietro la testa invece che sopra.

- **il pipistrello** non ragiona: fa la spola sulla sua rotta e ondeggia con la
  tabella dei seni. Non si stordisce e non si inscatola — è l'ostacolo che si
  muove, che nelle cave mancava (i blocchi irti stanno fermi e le assi sono
  prevedibili);
- **la talpa** è uno spiritello con un orario invece che con un'intelligenza:
  sta nella sua buca, si affaccia per due secondi, e mentre è sotto non la
  tocca nessuno. Il controllo sta *dopo* quello del torpore, così una volta
  martellata torna a essere uno spiritello come gli altri e si lascia portare
  in scatola;
- **il carrello** è un'asse mobile senza motore: ha solo l'attrito, e va dove
  l'ha mandato l'ultima martellata — dalla parte opposta a dove batti, come una
  remata. Ci si può salire sopra e spingersi da soli, e il martello smette di
  essere solo un'arma.

Le mappe stanno in `tools/arenas.json` e si guardano con
`tools/preview_levels.py`, che le disegna tutte in fila e controlla quello che
il gioco dà per scontato: larghezza trenta, un solo punto di partenza, un solo
portale, il macchinario che occupa davvero quattro celle per quattro, e i tetti
delle strutture (otto spiritelli, sei blocchi, sei assi, sei scintille).

### Quello che si vede senza leggerlo

Tre indicazioni che l'originale dà con mezzi che qui non ci sono — un cerchio
disegnato attorno allo spiritello, un pallino colorato, il canvas che si
dissolve — e che sul VDP si fanno con quello che c'è:

- **la barra del torpore** è larga due celle e ha nove disegni pronti, da vuoto
  a pieno, uno per ogni ottavo: due celle affiancate danno sedici passi, e non
  serve disegnare niente al volo;
- **la freccia dei bersagli fuori vista** è un solo disegno da 16x16 che punta a
  destra. Le altre tre direzioni sono lo stesso disegno ribaltato dal VDP, che
  per gli sprite sa fare entrambi i ribaltamenti. Prima c'era un pallino, che
  diceva dove ma non da che parte;
- **il portale** si prende il nano con un vortice: parte da dov'era, gira
  attorno al centro allargandosi fino a quarantasei pixel e poi richiudendosi,
  con una scia di scintille sul giro che sta facendo. Gli sprite del Mega Drive
  non si possono rimpicciolire, ma un giro che si stringe racconta la stessa
  cosa. Il giro dev'essere largo e il nano dev'essere *davanti* al portale:
  l'ovale è di 48x64 e alla prima prova se lo mangiava — l'animazione c'era e
  non si vedeva. Solo nell'ultimo pezzo il nano passa dietro, ed è appunto il
  momento in cui deve sparirci dentro. Nella lista degli sprite del VDP chi
  viene prima sta davanti, quindi basta cambiargli posto.

Poi lo schermo si spegne e si riaccende sulla cava dopo. Il Mega Drive non ha
una dissolvenza: si riscrivono le quattro tavolozze scurite, otto livelli, un
passo ogni due quadri. Le componenti sono di tre bit, quindi la tabella dei
valori scuriti sta in settantadue byte — e nel ritorno di quadro non c'è
tempo per centonovantadue divisioni.

### Due lingue

Le frasi stanno tutte in `src/strings.h`, i nomi e i suggerimenti delle cave in
`tools/arenas.json` (campi `name_en` e `hint_en`). La lingua si sceglie
compilando: `make` fa quella italiana, `make LANG=en` quella inglese, che
definisce `LANG_EN` e prende l'altro ramo delle frasi. Cambia anche il titolo
scritto nell'intestazione della cartuccia — quello che gli emulatori mostrano
nell'elenco — e il logo del titolo, perché è un disegno e non una scritta:
`tools/make_logo_en.py` ne fa uno uguale con le parole inglesi, e i due logo
stanno tutti e due nella ROM (spartendosi i disegni ripetuti: costano 150
celle in più su 1472).

Le colonne delle schermate non si possono più contare a mano, perché
«martellate» e «hammer blows» non sono lunghe uguali: le coppie parola-numero
si centrano da sole (`label_num` in `src/game.c`).

### Stare dentro il quadro

Sessanta quadri al secondo vogliono dire 127.800 cicli a testa, e non uno di
più: se il conto sfora, il gioco aspetta il quadro dopo e va a trenta. La
prima versione sforava con quattro spiritelli. Le misure (contatore verticale
del VDP letto a ogni fase, così si vede dove va il tempo) hanno indicato:

- **le divisioni**. Il compilatore, per dividere due interi lunghi, chiamava
  una routine a forza bruta da milleduecento cicli, e ce n'erano una ventina
  per quadro. Il 68000 ha la DIVU (32 bit per 16, un centinaio di cicli): due
  passaggi coprono qualunque divisore normale. Vedi `src/mathi.s`;
- **la lettura della mappa**. Ogni corpo che si muove interroga le celle
  attorno a sé, e ogni interrogazione era una chiamata di funzione con
  moltiplicazione. Ora c'è un puntatore per riga e le funzioni stanno in linea
  (`arena_cell` in `src/game.h`);
- **gli spiritelli**. Ragionano a turno, metà per quadro, con passi doppi: la
  media non cambia e il conto si dimezza. Il movimento resta a sessanta;
- **`-O2` invece di `-Os`**: da solo ha tolto un quarto del tempo.

Alla fine la cava più affollata (sette spiritelli, quattro blocchi, cinque
assi) sta in circa 190 righe di schermo su 262.

### Scrivere nella memoria video

Il ritorno di quadro dura appena diciottomila cicli, e tutto quello che si
vede deve entrare lì dentro. Scrivendo parola per parola il processore ne
spende una trentina ciascuna: fra sprite, righe della cava e pannello si
arrivava al limite, e la coda finiva mentre il raster disegnava già la barra
in cima — per un quadro il pannello si vedeva a metà, cioè lo sfarfallio.

Ora sprite, pannello e righe della cava vanno in **DMA**: il VDP si prende i
dati da solo, un word ogni due cicli. Il pannello, in più, si compone in
memoria e parte in due soli trasferimenti, così non esiste più l'istante in
cui è stato cancellato ma non ancora riscritto.

### Aspettare il quadro

L'attesa del ritorno di quadro guarda il bit di stato del VDP, non il
contatore delle interruzioni: quest'ultimo, se per un motivo qualunque
l'interruzione scatta due volte, farebbe saltare un quadro intero a ogni giro.
La telecamera, poi, insegue il nano in virgola fissa e arrotonda solo al
momento di scrivere il registro di scorrimento: tenendo la posizione in pixel
interi l'inseguimento avanzava a scatti e lo scorrimento singhiozzava.

### Tre trappole del 68000

Chi parte da un compilatore per Linux/m68k le incontra tutte e tre, e nessuna
dà un messaggio d'errore: la macchina si limita a piantarsi.

1. **La libreria del compilatore è per 68020.** `__divsi3` e compagni usano
   `bsr` con spostamento a 32 bit, che il 68000 non conosce: interpreta i byte
   come un salto a un indirizzo dispari e va in errore. Le versioni in
   `src/mathi.s` sono scritte per il processore che c'è davvero.
2. **Il compilatore accorpa le scritture.** Due assegnamenti di un byte a campi
   vicini diventano una sola scrittura da 16 bit, anche a indirizzo dispari:
   `-fno-store-merging`.
3. **Prendere i pixel da una virgola fissa 8.8** significa leggere i sedici bit
   centrali di un numero lungo, cioè ancora un accesso dispari. Con la virgola
   fissa 16.16 la parte intera è la parola alta, allineata. `make` passa
   comunque il codice compilato a `tools/checkalign.py`, che si accorgerebbe di
   un altro caso. Il controllo guarda solo `.text`: le costanti hanno una
   sezione tutta loro (`link.ld`) perché una frase come *«...of you s»*, letta
   come istruzione, sembra tale e quale un accesso a un indirizzo dispari.

Se nonostante tutto il processore inciampa, `src/fault.c` disegna a schermo il
tipo di eccezione, il punto del programma e l'indirizzo incriminato, invece di
lasciare l'emulatore in un blocco muto.

### Suono

Gli effetti sono sintetizzati sul PSG (tre canali di tono e uno di rumore) e
ricalcano quelli dell'originale: il colpo sordo del martello con la polvere, lo
scampanellio del torpore, il salto, la scatola che si chiude, la caduta. La
musica non c'è, come nell'originale.
