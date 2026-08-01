# Forest Tale

Un platform 2D ambientato in un bosco al crepuscolo, in HTML5 + canvas.
Nessuna libreria e nessuna risorsa esterna: **tutta la grafica è generata
proceduralmente** da uno script Python incluso nel repository, e i suoni sono
sintetizzati al volo con la Web Audio API.

Una volpe con la punta della coda accesa attraversa tre capitoli di bosco
raccogliendo lucciole e accendendo lanterne. La luce non è solo atmosfera: il
buio copre la scena e si apre solo attorno alle sorgenti luminose.

## Come si gioca

Apri `index.html` in un browser — basta un doppio clic, non serve un server.

| Comando | Azione |
|---|---|
| `←` `→` oppure `A` `D` | corri |
| `spazio`, `↑` o `W` | salta (tenendo premuto si salta più in alto) |
| `↓` + `spazio` | scendi attraverso le assi di legno |
| `Invio` | conferma / avanza |
| `P` · `R` · `M` | pausa · ricomincia il capitolo · audio |

Su telefono e tablet compaiono i pulsanti a schermo.

Tre foglie di vita. I coleotteri si stordiscono saltandoci sopra; i fuochi
fatui no, vanno evitati. Le lanterne accese diventano il punto di ripartenza.
Le lucciole non servono per finire il capitolo: sono la ragione per esplorarlo.

## Come è fatto

```
index.html              pagina di gioco
css/style.css           interfaccia e layout responsivo
js/levels.js            livelli (file generato)
js/assets.js            caricamento delle immagini
js/audio.js             sintesi dei suoni
js/input.js             tastiera e comandi a schermo
js/world.js             griglia, collisioni, autotile, disegno dello scenario
js/player.js            fisica della volpe
js/enemies.js           coleotteri e fuochi fatui
js/game.js              stati, telecamera, luci, particelle, interfaccia
js/main.js              avvio e ciclo di gioco
tools/generate_assets.py  generatore di tutta la grafica
tools/palette.py          palette condivisa
tools/levels.txt          livelli in ASCII (sorgente)
tools/build_levels.py     da levels.txt a js/levels.js, con verifiche
tools/bundle.py           versione in un unico file HTML
assets/*.png              immagini generate
```

### Fisica del salto

I valori stanno in `js/player.js`: gravità 2000 px/s², spinta del salto 640 px/s,
corsa 232 px/s. Ne discende un salto alto circa **3,2 celle** e lungo circa
**4,6 celle**, ed è il vincolo con cui sono disegnati i livelli: nessuna
piattaforma a più di 3 celle sopra l'appoggio, nessun vuoto oltre 3 celle.
Ci sono anche *coyote time* (0,10 s di salto concesso dopo il bordo) e *jump
buffer* (0,13 s di salto memorizzato prima di atterrare), che rendono i comandi
indulgenti senza cambiare la difficoltà.

### Luce

Ogni fotogramma un livello di buio viene ritagliato in `destination-out` con
gradienti radiali sulle sorgenti (coda della volpe, lanterne accese, lucciole,
fuochi fatui), poi una passata additiva aggiunge l'alone caldo. È il motivo per
cui il bosco resta leggibile pur essendo notte.

## Rigenerare la grafica

Le immagini sono già nel repository. Per rifarle — o per cambiare palette,
dimensione delle celle, aspetto della volpe:

```bash
pip install pillow numpy
python3 tools/generate_assets.py
```

Tutto è disegnato con Pillow a 4× di supersampling, poi ridotto in **alpha
premoltiplicato** (senza, i bordi sfumati si sporcano di nero).

| File | Contenuto |
|---|---|
| `tiles.png` | 16 raccordi del terreno in 2 varianti + assi e rovi |
| `sky.png`, `trees_far/mid/near.png`, `mist.png` | cielo con luna e stelle, tre piani di parallasse, nebbia |
| `fox.png` | volpe: 4 fotogrammi fermi, 6 di corsa, salto, caduta, colpita |
| `enemies.png` | coleottero e fuoco fatuo, 4 fotogrammi ciascuno |
| `props.png` | funghi, felce, erba, sasso, lanterna spenta/accesa, lucciola, ghianda |
| `door.png`, `leaf.png`, `logo.png`, `favicon.png` | porta nel tronco, vita, logo, icona |

## Modificare i livelli

`tools/levels.txt` è la sorgente, in ASCII leggibile:

```
#  terreno       =  asse attraversabile dal basso   ^  rovi
P  partenza      D  porta di uscita                 L  lanterna
o  lucciola      b  coleottero                      w  fuoco fatuo
m M f t r        decorazioni
```

Dopo averlo modificato:

```bash
python3 tools/build_levels.py
```

Lo script controlla che ogni livello abbia 20 righe, esattamente una partenza e
una porta, e solo simboli previsti; poi riscrive `js/levels.js`.

## Versione in un file solo

```bash
python3 tools/bundle.py dist/forest-tale.html
```

Incorpora CSS, JavaScript e PNG (come data URI) in un'unica pagina, comoda da
spostare o condividere senza la cartella `assets/`.
