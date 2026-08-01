# Martello & Scatole

Un nano con il martello ripulisce dagli spiritelli quattro cave a cielo aperto.
Platform a **vista laterale** e **schermo fisso** in HTML5 + canvas: nessuna
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

Gli spiritelli volteggiano sopra la testa del nano e ogni tanto **piombano
giù**: è lì che fanno male. Tre cuori; se se ne libera uno mentre lo trasporti
prendi solo uno spintone — la punizione è doverlo rincorrere. A cuori finiti si
ricomincia la cava.

Le quattro cave hanno 3, 4, 5 e 6 spiritelli, sempre più veloci, e il torpore
scende da 9 a 6 secondi.

## Come è fatto

```
index.html              pagina di gioco
css/style.css           interfaccia e layout responsivo
js/arenas.js            arene (file generato)
js/assets.js            caricamento delle immagini
js/audio.js             sintesi dei suoni
js/input.js             tastiera e comandi a schermo
js/arena.js             griglia, collisioni, macchinario, disegno della cava
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

### Sfondo

`backdrop.png` è un'unica immagine da 960×540 — cielo, sole, nuvole e due file
di colline con alberelli — generata anch'essa dallo script. Lo schermo è fisso,
quindi non serve parallasse: il fondale sta dietro e basta.

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
| `backdrop.png` | cielo, sole, nuvole, colline |
| `tiles.png` | 16 raccordi del terreno in 2 varianti, asse di legno, cespuglio, sasso, fiori |
| `dwarf.png` | nano di profilo: fermo, corsa (6 fotogrammi), martellata (4), salto, caduta, traino |
| `imps.png` | spiritello: in volo, stordito, in picchiata |
| `machine.png` | macchinario inscatolatore, fermo e in funzione |
| `portal.png`, `crate.png`, `icons.png` | portale, cassa, cuori e martello |
| `logo.png`, `favicon.png` | logo e icona |

## Modificare le arene

`tools/arenas.txt` è la sorgente, in ASCII leggibile (30×16 celle):

```
#  terreno   =  asse di legno (ci si sale da sotto)   .  aria
P  partenza  S  spiritello (in volo)  M  angolo del macchinario  O  portale
b  cespuglio   r  sasso   f  fiori
!!! stordimento=<secondi> velocita=<px al secondo>
```

Dopo averlo modificato:

```bash
python3 tools/build_arenas.py
```

Lo script controlla che ogni arena abbia 16 righe, il terreno sotto la
partenza, una sola partenza, un solo macchinario, un solo portale e almeno uno
spiritello; poi riscrive `js/arenas.js`.

## Versione in un file solo

```bash
python3 tools/bundle.py dist/martello.html
```

Incorpora CSS, JavaScript e PNG (come data URI) in un'unica pagina.
