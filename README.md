# Pac-Man HTML5

Clone giocabile di Pac-Man scritto in HTML5 + canvas 2D, senza librerie e senza
risorse esterne: **tutti gli asset grafici sono generati proceduralmente** da uno
script Python incluso nel repository, e tutti gli effetti sonori sono sintetizzati
al volo con la Web Audio API.

## Come si gioca

Apri `index.html` in un browser (basta un doppio clic, non serve un server web).

| Comando | Azione |
|---|---|
| Frecce direzionali o `W` `A` `S` `D` | muovi Pac-Man |
| `Invio` / `Spazio` | avvia la partita |
| `P` | pausa |
| `M` | attiva/disattiva l'audio |
| Scorrimento del dito o croce direzionale | comandi su dispositivi touch |

Obiettivo: mangiare tutti i 244 pallini del labirinto evitando i fantasmi. I quattro
super pallini agli angoli rendono i fantasmi commestibili per qualche secondo
(200, 400, 800 e 1600 punti in sequenza). Ogni tanto compare un bonus sotto la casa
dei fantasmi. Una vita extra a 10.000 punti; il record viene salvato nel browser.

## Fedeltà all'originale

- labirinto classico 28×31 con 240 pallini + 4 super pallini e tunnel laterali;
- comportamenti distinti dei quattro fantasmi (Blinky insegue, Pinky punta 4 caselle
  davanti a Pac-Man, Inky usa il vettore Blinky→Pac-Man, Clyde si allontana quando è
  vicino), incluso il famoso "bug" del bersaglio quando Pac-Man guarda verso l'alto;
- alternanza delle fasi di dispersione e inseguimento con inversione di marcia;
- uscita dalla casa regolata dal conteggio dei pallini mangiati e da un timeout;
- "Cruise Elroy": Blinky accelera quando restano pochi pallini;
- velocità di Pac-Man, dei fantasmi, nel tunnel e durante il panico variabili per livello;
- occhi che tornano alla casa dopo che un fantasma è stato mangiato;
- frutti bonus diversi per livello, dalla ciliegia alla chiave.

## Struttura del progetto

```
index.html              pagina di gioco
css/style.css           interfaccia, layout responsivo, comandi touch
js/maze-layout.js       layout del labirinto (file generato)
js/config.js            tabelle di bilanciamento per livello
js/assets.js            caricamento delle immagini
js/audio.js             sintesi degli effetti sonori (Web Audio)
js/level.js             griglia, pallini, disegno dello sfondo
js/entities.js          Pac-Man e fantasmi: movimento e IA
js/game.js              stati di gioco, punteggio, collisioni, HUD
js/main.js              avvio, ciclo di gioco, comandi
tools/generate_assets.py  generatore di tutti gli asset grafici
tools/maze_layout.txt     sorgente del labirinto in formato testo
assets/*.png            immagini generate
```

## Rigenerare gli asset grafici

Le immagini in `assets/` sono già presenti nel repository. Per rigenerarle (o per
cambiare colori, dimensione delle celle o il labirinto stesso):

```bash
pip install pillow numpy
python3 tools/generate_assets.py
```

Lo script disegna tutto con Pillow — niente immagini di partenza — usando un
supersampling 4× per l'antialiasing:

| File | Contenuto |
|---|---|
| `maze.png` / `maze_flash.png` | labirinto (contorno arrotondato ricavato dalla maschera dei muri) e versione bianca per il lampeggio di fine livello |
| `pacman.png` | 3 fotogrammi di apertura della bocca × 4 direzioni |
| `pacman_death.png` | 12 fotogrammi dell'animazione di morte |
| `ghosts.png` | 4 fantasmi + 2 stati di panico + occhi, × 4 direzioni × 2 fotogrammi |
| `pellet.png`, `power_pellet.png` | pallino e super pallino |
| `fruits.png` | 8 bonus |
| `logo.png`, `favicon.png` | logo del titolo e icona |

Modificando `tools/maze_layout.txt` cambiano sia l'immagine del labirinto sia la
logica di gioco: lo script rigenera anche `js/maze-layout.js`, unica fonte di verità
condivisa fra grafica e collisioni.

## Altro nel repository

`megadrive/` contiene una cosa diversa: la conversione del gioco *Martello &
Scatole* in una cartuccia per Sega Mega Drive (`megadrive/martello.bin`, da
aprire con un emulatore). I dettagli sono nel suo
[README](megadrive/README.md).
