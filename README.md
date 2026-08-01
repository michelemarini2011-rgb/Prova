# Martello & Scatole

Un nano con il martello ripulisce quattro stanze di una miniera dagli spiritelli.
Gioco a **schermo fisso** in HTML5 + canvas: nessuna libreria, nessuna risorsa
esterna, **tutta la grafica generata proceduralmente** da uno script Python
incluso nel repository e tutti i suoni sintetizzati con la Web Audio API.

## Come si gioca

Apri `index.html` in un browser — basta un doppio clic, non serve un server.

| Comando | Azione |
|---|---|
| `←` `↑` `↓` `→` oppure `W` `A` `S` `D` | muovi il nano (otto direzioni) |
| `spazio` | martella il terreno |
| `Invio` | conferma / avanza |
| `P` · `R` · `M` | pausa · ricomincia la stanza · audio |

Su telefono e tablet compaiono la croce direzionale e il pulsante *martella*.

### Il giro completo

1. **Martella vicino a uno spiritello.** Non si colpisce direttamente: il
   martello batte per terra a mezza cella davanti al nano e l'onda d'urto
   sbalza indietro tutto quello che sta nel raggio, lasciandolo **stordito**.
2. **Trascinalo.** Passandogli sopra il nano se lo carica dietro; l'anello
   giallo attorno allo spiritello dice quanto torpore resta. Quando diventa
   rosso, sta per svegliarsi.
3. **Rinnova il torpore.** Il martello funziona anche mentre trascini: una
   battuta a terra ricarica l'anello. È così che si attraversa una stanza
   lunga senza perdere il carico.
4. **Infilalo nell'imbuto** del macchinario in basso a destra: lo inscatola e
   la cassa si accatasta lì accanto.
5. Inscatolati tutti, **si apre il portale**: attraversalo per la stanza
   successiva.

Tre cuori. Toccare uno spiritello sveglio costa un cuore; se se ne libera uno
mentre lo trasporti prendi solo uno spintone — la punizione è doverlo
rincorrere. A cuori finiti si ricomincia la stanza.

Le quattro stanze hanno 3, 4, 5 e 6 spiritelli, sempre più veloci, e il torpore
scende da 9 a 6 secondi.

## Come è fatto

```
index.html              pagina di gioco
css/style.css           interfaccia e layout responsivo
js/arenas.js            arene (file generato)
js/assets.js            caricamento delle immagini
js/audio.js             sintesi dei suoni
js/input.js             tastiera e comandi a schermo
js/arena.js             griglia, collisioni, macchinario, disegno della stanza
js/dwarf.js             il nano: movimento, martellata, trascinamento
js/imps.js              spiritelli: vagabondaggio, stordimento, fuga
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

Stanno in cima a `js/dwarf.js`: velocità 172 px/s (142 trascinando), martellata
lunga 0,42 s con l'impatto a 0,19 s, punto d'impatto 30 px davanti al nano,
raggio dell'onda d'urto 78 px. La spinta sugli spiritelli cala con la distanza
dal punto d'impatto, così colpire vicino li manda lontano.

Il torpore e la velocità degli spiritelli sono per stanza, dentro
`tools/arenas.txt`.

### Luce

Ogni fotogramma uno strato di buio viene ritagliato in `destination-out` con
gradienti radiali attorno al nano, alle torce, al macchinario, agli spiritelli e
a ogni onda d'urto; poi una passata additiva aggiunge il caldo delle torce. È
quello che dà alla miniera la sua profondità.

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
| `tiles.png` | 16 raccordi di parete, 4 pavimenti, masso e detriti |
| `dwarf.png` | nano: cammina e martella in 3 orientamenti, 4 fotogrammi ciascuno |
| `imps.png` | spiritello: fluttua, stordito, in allarme |
| `machine.png` | macchinario inscatolatore, fermo e in funzione |
| `portal.png`, `crate.png`, `icons.png` | portale, cassa, cuori e torcia |
| `logo.png`, `favicon.png` | logo e icona |

## Modificare le arene

`tools/arenas.txt` è la sorgente, in ASCII leggibile (30×16 celle):

```
#  roccia    .  pavimento   ,  detriti   R  masso
P  partenza  S  spiritello  M  angolo del macchinario  O  portale  T  torcia
!!! stordimento=<secondi> velocita=<px al secondo>
```

Dopo averlo modificato:

```bash
python3 tools/build_arenas.py
```

Lo script controlla che ogni arena abbia 16 righe, il bordo chiuso, una sola
partenza, un solo macchinario, un solo portale e almeno uno spiritello; poi
riscrive `js/arenas.js`.

## Versione in un file solo

```bash
python3 tools/bundle.py dist/martello.html
```

Incorpora CSS, JavaScript e PNG (come data URI) in un'unica pagina.
