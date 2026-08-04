# Martello & Scatole — versione per Sega Mega Drive

Conversione del gioco HTML5 *Martello & Scatole* in una cartuccia per Sega Mega
Drive / Genesis: stesse quattro cave, stessi movimenti, stessa regia, scritta
in C e assembly 68000 e compilata in una ROM da 512 KB.

## Giocare

Il file da dare all'emulatore è **`martello.bin`** (va bene anche rinominarlo
`.md` o `.gen`). Funziona con BlastEm, Genesis Plus GX, Kega Fusion, Exodus,
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

## Costruire la ROM

Serve un compilatore incrociato per 68000 e Python con Pillow (solo per
rigenerare grafica e livelli):

```bash
sudo apt install gcc-m68k-linux-gnu binutils-m68k-linux-gnu python3-pil kbd
make            # produce martello.bin
make assets     # rigenera res/gfx.* dai PNG in tools/png
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
src/arena.c       mappa della cava, disegno del terreno, scorrimento verticale
src/entities.c    nano, spiritelli, blocchi irti, assi mobili
src/game.c        stati, onda d'urto, macchinario, portale, pannello, sprite
src/fault.c       schermata di errore se il processore inciampa
res/gfx.*         disegni e tavolozze (generati)
res/levels.*      le quattro cave (generate)
tools/md_assets.py   converte i PNG dell'originale nel formato del VDP
tools/md_levels.py   converte le mappe delle cave
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
  immagine basta, perché il VDP sa ribaltarla e la giuntura sparisce;
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
   un altro caso.

Se nonostante tutto il processore inciampa, `src/fault.c` disegna a schermo il
tipo di eccezione, il punto del programma e l'indirizzo incriminato, invece di
lasciare l'emulatore in un blocco muto.

### Suono

Gli effetti sono sintetizzati sul PSG (tre canali di tono e uno di rumore) e
ricalcano quelli dell'originale: il colpo sordo del martello con la polvere, lo
scampanellio del torpore, il salto, la scatola che si chiude, la caduta. La
musica non c'è, come nell'originale.
