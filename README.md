# Martello & Scatole

Un nano con il martello ripulisce dagli spiritelli quattro cave a cielo aperto.
Platform a **vista laterale** con **mappe verticali** in HTML5 + canvas: nessuna
libreria, nessuna risorsa esterna, **tutta la grafica generata proceduralmente**
da uno script Python incluso nel repository e tutti i suoni sintetizzati con la
Web Audio API.

## Come si gioca

Apri `index.html` in un browser — basta un doppio clic, non serve un server.

| Comando | Azione |
|---|---|
| `←` `→` oppure `A` `D` | corri |
| `spazio`, `↑` o `W` | salta (tenendo premuto si salta più in alto) |
| `X` o `Z` | martella il terreno |
| `↓` + `spazio` | scendi attraverso le assi di legno |
| `Invio` | conferma / avanza |
| `P` · `R` · `M` | pausa · ricomincia la cava · audio |

Su telefono e tablet compaiono le frecce e i pulsanti *salta* e *martella*.

### Con un joypad

Funziona anche con un **joypad**, compresi quelli Bluetooth: una volta accoppiato
col sistema il browser lo vede come un gamepad qualunque, non serve fare altro.
Premi un tasto e il gioco se ne accorge — i browser tengono il pad nascosto
finché non lo si tocca, per non lasciarsi identificare da un sito.

| Comando | Azione |
|---|---|
| croce direzionale o levetta sinistra | corri, e ↓ per scendere dalle assi |
| **A** (il tasto in basso) | salta — e conferma nei menù |
| **B**, **X**, **Y**, dorsale o grilletto destro | martella |
| **Start** | pausa |

I tasti sono quelli della disposizione *standard*, in cui il browser normalizza i
pad **per posizione**: "A" è sempre quello in basso, comunque lo chiami il tuo
joypad. La levetta ha una zona morta a 0,4 così non parte da sola. Tastiera,
tocco e joypad restano attivi tutti insieme.

### Il giro completo

1. **Martella vicino a uno spiritello.** Non si colpisce direttamente: il
   martello batte per terra davanti al nano e l'onda d'urto — un'ellisse larga
   122 px e alta 96 — sbalza indietro tutto quello che ci finisce dentro,
   lasciandolo **stordito**. Gli spiritelli storditi cadono a terra.
2. **Trascinalo.** Passandogli sopra il nano se lo carica dietro; l'anello
   giallo attorno allo spiritello dice quanto torpore resta. Quando diventa
   rosso, sta per svegliarsi.
3. **Rinnova il torpore.** Il martello funziona anche mentre trascini: una
   battuta a terra ricarica l'anello. È così che si attraversa una cava
   lunga senza perdere il carico.
4. **Infilalo nell'imbuto** del macchinario in basso a destra: lo inscatola e
   la cassa si accatasta lì accanto.
5. Inscatolati tutti, **si apre il portale**: attraversalo per la cava
   successiva.

### Zattere e punte

Fra un'asse e l'altra ci sono **piattaforme mobili**: zattere di ferro che
scorrono da sole a destra e a sinistra e si fermano solo quando trovano il bordo
della mappa, un blocco di roccia o **un'altra piattaforma** — due che si
incontrano rimbalzano l'una sull'altra. Chi ci sale sopra viene trasportato: il
nano, e anche gli spiritelli storditi che gli scivolano di mano. Con ↓ + salto
ci si lascia cadere, come dalle assi.

E poi ci sono i **blocchi irti di punte**. Toccarli è fatale — non si perde un
cuore, si ricomincia la cava — quindi non si spingono a mani nude: si spostano
**a martellate**, con la stessa onda d'urto che stordisce gli spiritelli. Un
blocco cade, rotola, si ferma; e se finisce su una piattaforma mobile ci
viaggia sopra, arrivando dove non te lo aspetti.

Le mappe si sviluppano **in altezza**: larghe uno schermo, alte più schermi (due
il primo livello, tre gli ultimi). Il macchinario sta in fondo, gli spiritelli
presidiano i piani alti — quindi il giro è: sali, stordisci, e riportali giù. Uno
spiritello stordito **cade**, attraversando le assi di legno: spesso conviene
farlo cadere e raccoglierlo più in basso. Quando il macchinario o il portale sono
fuori schermo, una freccia sul bordo indica da che parte stanno.

Gli spiritelli volteggiano sopra la testa del nano e ogni tanto **piombano
giù**: è lì che fanno male. Tre cuori; se se ne libera uno mentre lo trasporti
prendi solo uno spintone — la punizione è doverlo rincorrere. A cuori finiti si
ricomincia la cava.

Le quattro cave hanno 4, 5, 6 e 7 spiritelli, sempre più veloci, e il torpore
scende da 9 a 6 secondi. Crescono anche le piattaforme mobili (da 1 a 5, sempre
più svelte) e i blocchi irti (da 1 a 4).

## Come è fatto

```
index.html              pagina di gioco
css/style.css           interfaccia e layout responsivo
js/arenas.js            arene (file generato)
js/assets.js            caricamento delle immagini
js/audio.js             sintesi dei suoni
js/input.js             tastiera, comandi a schermo e joypad
js/arena.js             griglia, collisioni, macchinario, disegno della cava
js/platforms.js         piattaforme mobili e blocchi irti
js/dwarf.js             il nano: corsa, salto, martellata, trascinamento
js/imps.js              spiritelli: volo, picchiata, stordimento, fuga
js/game.js              stati, onda d'urto, consegna, portale, interfaccia
js/main.js              avvio e ciclo di gioco
tools/generate_assets.py  generatore di tutta la grafica
tools/palette.py          palette condivisa
tools/arenas.txt          arene in ASCII (sorgente)
tools/build_arenas.py     da arenas.txt a js/arenas.js, con verifiche
tools/bundle.py           versione in un unico file HTML
assets/*.png              immagini generate
```

### I numeri che contano

Stanno in cima a `js/dwarf.js`: corsa 196 px/s (134 trascinando), gravità
2000 px/s², spinta del salto 620 px/s — circa **3 celle** di altezza — con
*coyote time* 0,10 s e *jump buffer* 0,13 s. La martellata dura 0,42 s e
l'impatto cade a 0,19 s, 30 px davanti al nano. La spinta sugli spiritelli cala
con la distanza dal punto d'impatto, così colpire vicino li manda lontano.

Da qui discende la geometria delle cave: **gradini e assi non salgono mai più
di 2 celle** per volta (64 px), ben dentro i 96 px del salto.

Il torpore e la velocità degli spiritelli sono per cava, dentro
`tools/arenas.txt`.

### La vista si adatta allo schermo

Il canvas non ha più una forma fissa: `Game.resize()` misura lo spazio
disponibile in pixel CSS e sceglie **quanta parte del mondo mostrare**, tenendo
la stessa forma della finestra così non resta nessuna banda vuota. Se il gioco
risulterebbe più piccolo di 0,82 pixel per pixel di mondo, invece di rimpicciolire
tutto si restringe la vista — al minimo 15 celle di larghezza e 9 di altezza — e
la telecamera segue il nano anche in orizzontale.

In pratica: su un monitor si vedono tutte e 30 le colonne con la cella a ~42 px;
su un telefono in verticale se ne vedono 15 su 28 righe con la cella a ~25 px,
il doppio di prima.

I comandi a schermo stanno su una **griglia elastica** a cinque colonne
(`1fr 1fr 1fr 1.45fr 1.45fr`): i tasti si dividono la larghezza disponibile
invece di avere misure fisse, così non escono mai dallo schermo — nemmeno su un
telefono da 320 px. La pagina lascia al gioco tutta l'altezza che avanza.

### Come si ascolta il tocco

I pulsanti **non hanno un ascoltatore ciascuno**. A ogni evento di tocco
`js/input.js` ricalcola lo stato da zero, controllando dove si trovano *tutte* le
dita appoggiate allo schermo. Serve perché un tocco resta legato all'elemento su
cui è iniziato: facendo scorrere il pollice da ◀ a ▶, il secondo pulsante non
riceverebbe mai un `touchstart` — e un `touchend` perso lascerebbe un tasto
premuto per sempre. Attorno a ogni pulsante c'è un margine di tolleranza (6 px di
lato, 14 sopra e sotto, perché il pollice arriva dal basso) e, se due sono
entrambi a tiro, vince il più vicino.

Se sinistra e destra risultano premute insieme — capita di continuo appoggiando
il pollice sull'altro tasto prima di aver staccato il primo — **vince l'ultima
arrivata** invece di annullarsi a vicenda; mollandola torna a valere quella
ancora premuta. Vale anche per la tastiera.

Le posizioni dei pulsanti si **rileggono a ogni premuta**, non solo quando arriva
un `resize`: su un telefono la barra degli indirizzi che compare o scompare
sposta il pad di 50-100 px senza che l'evento arrivi sempre, e con misure vecchie
il tocco finirebbe accanto al tasto invece che dentro. Fra una premuta e l'altra
le misure restano in cache, altrimenti ogni `touchmove` costerebbe un reflow.

Il joypad invece **non manda eventi**: va interrogato, quindi `Input.poll()` lo
legge una volta per fotogramma dal ciclo di gioco e ne ricava lo stato allo
stesso modo dei tasti. Se il pad si scollega mentre si tiene premuta una
direzione, quella viene rilasciata invece di restare incollata.

Il gesto viene annullato **solo per le dita partite da un pulsante del pad** (se
ne tengono gli identificatori): un dito appoggiato su una freccia non deve
impedire all'altra mano di toccare pausa o lo schermo. Sui comandi il CSS mette
`touch-action: none` e disattiva selezione, menu contestuale e evidenziazione del
tocco: sono tutti gesti che il browser si prenderebbe per sé, annullando la
premuta a metà. E siccome `preventDefault()` toglie anche lo stato `:active`, il
pulsante premuto si illumina da sé (classe `.on`).

### Telecamera e sfondo

La vista è larga quanto la mappa (30 celle) e alta uno schermo (16 celle): la
telecamera scorre solo in verticale, inseguendo il nano con un piccolo ritardo.
`backdrop.png` è alto 760 px contro i 512 della vista e scorre in parallasse fra
i due estremi: in fondo si vede l'orizzonte con le colline, in cima solo cielo.

## Rigenerare la grafica

Le immagini sono già nel repository. Per rifarle — o per cambiare palette,
aspetto del nano, dimensione delle celle:

```bash
pip install pillow numpy
python3 tools/generate_assets.py
```

Tutto è disegnato con Pillow a 4× di supersampling e ridotto in **alpha
premoltiplicato** (senza, i bordi sfumati si sporcano di nero).

| File | Contenuto |
|---|---|
| `backdrop.png` | cielo, sole, nuvole, colline (960×760, scorre in parallasse) |
| `tiles.png` | 16 raccordi del terreno in 2 varianti, asse di legno, cespuglio, sasso, fiori |
| `dwarf.png` | nano di profilo: fermo, corsa (6 fotogrammi), martellata (4), salto, caduta, traino |
| `imps.png` | spiritello: in volo, stordito, in picchiata |
| `machine.png` | macchinario inscatolatore, fermo e in funzione |
| `movplat.png` | piattaforma mobile in tre pezzi: testa, corpo ripetibile, coda |
| `hazard.png` | blocco irto di punte |
| `portal.png`, `crate.png`, `icons.png` | portale, cassa, cuori e martello |
| `logo.png`, `favicon.png` | logo e icona |

## Modificare le arene

`tools/arenas.txt` è la sorgente, in ASCII leggibile: 30 colonne di larghezza e
un multiplo di 16 righe: **ogni 16 righe è uno schermo di altezza**. Per fare un
livello più alto basta aggiungere righe in cima.

```
#  terreno   =  asse di legno (ci si sale da sotto)   .  aria
P  partenza  S  spiritello (in volo)  M  angolo del macchinario  O  portale
b  cespuglio   r  sasso   f  fiori
~  piattaforma mobile (2-6 celle)     x  blocco irto di punte
!!! stordimento=<secondi> velocita=<px/s spiritelli> piattaforme=<px/s>
```

Una piattaforma mobile è un tratto orizzontale di `~`: nel gioco corre finché non
incontra il bordo, un `#` o un'altra piattaforma, quindi i `#` isolati sulla sua
riga fanno da respingenti e ne definiscono la corsa. Due tratti sulla stessa riga
si rimbalzano a vicenda. Un `x` cade fin dove trova appoggio — anche su una
piattaforma mobile, e allora viaggia con lei.

Dopo averlo modificato:

```bash
python3 tools/build_arenas.py
```

Lo script controlla che le righe siano un multiplo di 16, che partenza e portale
poggino sul terreno, che il macchinario ci stia per intero e appoggi, e che ci
siano una sola partenza, un solo macchinario, un solo portale e almeno uno
spiritello. Delle piattaforme mobili verifica che siano lunghe da 2 a 6 celle,
che abbiano spazio per muoversi e che nella loro corsa non ci sia altro che aria
— altrimenti attraverserebbero assi e decorazioni.

Soprattutto fa una **verifica di raggiungibilità**: ricava i ripiani calpestabili,
li collega fra loro con gli archi che il salto del nano consente davvero (fino a
3 celle in su e 3 di distanza, discese fino a 4) e controlla per BFS che dalla
partenza si arrivi a ogni spiritello, al macchinario e al portale. È il controllo
che ha scovato tre spiritelli irraggiungibili nella quarta cava. Una piattaforma
mobile vi entra come un ripiano largo quanto la sua corsa: prima o poi passa da
ogni colonna che attraversa.

Poi riscrive `js/arenas.js`.

## Versione in un file solo

```bash
python3 tools/bundle.py dist/martello.html
```

Incorpora CSS, JavaScript e PNG (come data URI) in un'unica pagina.
