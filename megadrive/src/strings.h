/* Tutte le scritte del gioco, nelle due lingue.
 *
 * La ROM è una sola per lingua: `make` fa quella italiana, `make LANG=en`
 * quella inglese, che definisce LANG_EN. Tenere le frasi qui, e non sparse
 * nel codice, vuol dire che per aggiungere una lingua basta un blocco in più
 * — e che si vede a colpo d'occhio se una frase supera le quaranta colonne
 * dello schermo.
 *
 * I nomi e i suggerimenti delle cave stanno invece in res/levels.c, che li
 * sceglie con lo stesso LANG_EN (vedi tools/md_levels.py).
 */
#ifndef STRINGS_H
#define STRINGS_H

#ifdef LANG_EN

/* ------------------------------------------------------------- inglese */
#define TXT_START        "PRESS START TO BEGIN"
#define TXT_HELP_MOVE    "d-pad: run"
#define TXT_HELP_JUMP    "B jumps   A or C hammers"
#define TXT_HELP_DROP    "down + B to drop off a plank"
#define TXT_HELP_PAUSE   "START pauses"

#define TXT_CAVE         "cave"
#define TXT_IMPS_TO_BOX  "imps to box up:"

#define TXT_LOST         "The imps got the better of you"
#define TXT_SPIKES       "The spikes on the block never forgive"
#define TXT_BURNT        "Those sparks bite"
#define TXT_BAT          "The bats own this cave"
#define TXT_RETRY        "back to the top of the cave..."
#define TXT_CLEARED      "cave cleared!"

#define TXT_PAUSED       "paused"
#define TXT_PAUSE_HELP   "START resumes   A restarts"

#define TXT_FINALE       "ALL BOXED UP"
#define TXT_FOUR_CAVES   "every cave cleared in"
#define TXT_SECONDS      "seconds"
#define TXT_HAMMERS      "hammer blows:"
#define TXT_BEST         "best:"
#define TXT_AGAIN        "START to play again"

#define TXT_SECONDS_SHORT "s"

#define LOGO_MAP         logo_map_en

#else

/* ------------------------------------------------------------ italiano */
#define TXT_START        "PREMI START PER COMINCIARE"
#define TXT_HELP_MOVE    "croce direzionale: corri"
#define TXT_HELP_JUMP    "B salta   A o C martella"
#define TXT_HELP_DROP    "gi\006 + B per scendere dalle assi"
#define TXT_HELP_PAUSE   "START mette in pausa"

#define TXT_CAVE         "cava"
#define TXT_IMPS_TO_BOX  "spiritelli da inscatolare:"

#define TXT_LOST         "Gli spiritelli hanno avuto la meglio"
#define TXT_SPIKES       "Le punte del blocco non perdonano"
#define TXT_BURNT        "Le scintille pungono"
#define TXT_BAT          "I pipistrelli comandano qui"
#define TXT_RETRY        "si ricomincia la cava..."
#define TXT_CLEARED      "cava ripulita!"

#define TXT_PAUSED       "pausa"
#define TXT_PAUSE_HELP   "START riprende   A ricomincia"

#define TXT_FINALE       "TUTTI INSCATOLATI"
#define TXT_FOUR_CAVES   "tutte le cave ripulite in"
#define TXT_SECONDS      "secondi"
#define TXT_HAMMERS      "martellate:"
#define TXT_BEST         "record:"
#define TXT_AGAIN        "START per ricominciare"

#define TXT_SECONDS_SHORT "s"

#define LOGO_MAP         logo_map

#endif

#endif
