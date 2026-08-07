#!/usr/bin/env python3
"""Guarda le cave e controlla che stiano in piedi.

Disegna la mappa di ogni cava in un PNG (una cella, un quadratino) e verifica
quello che il gioco dà per scontato: la larghezza, i simboli, un solo punto di
partenza, un solo portale, il macchinario che occupa davvero quattro celle per
quattro, e i limiti delle strutture (otto spiritelli, sei blocchi, sei assi,
sei scintille).

    python3 tools/preview_levels.py [uscita.png]
"""
import json
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
COLS = 30

# come si vede ogni simbolo nell'anteprima
INK = {
    ".": (86, 156, 214),        # cielo
    "#": (150, 96, 56),         # terra
    "=": (222, 170, 110),       # asse fissa
    "~": (255, 214, 140),       # asse che va avanti e indietro
    "|": (140, 230, 190),       # ascensore
    "i": (240, 240, 130),       # asse a intermittenza (accesa)
    "j": (150, 150, 70),        # asse a intermittenza (spenta)
    "c": (190, 120, 60),        # asse che si sbriciola
    "n": (120, 90, 50),         # nastro verso destra
    "N": (95, 70, 40),          # nastro verso sinistra
    "k": (200, 140, 70),        # carrello da miniera
    "x": (60, 60, 90),          # blocco irto
    "o": (255, 150, 40),        # perno della scintilla
    "S": (230, 90, 230),        # spiritello
    "V": (255, 60, 160),        # spiritello svelto
    "A": (170, 200, 230),       # spiritello con l'elmo
    "p": (150, 110, 190),       # pipistrello
    "t": (210, 160, 60),        # talpa
    "P": (255, 255, 255),       # partenza
    "O": (120, 255, 120),       # portale
    "M": (200, 200, 200),       # macchinario
    "b": (70, 150, 70),         # cespuglio
    "r": (120, 120, 120),       # sasso
    "f": (240, 120, 160),       # fiore
    "B": (255, 60, 60),         # tana del mostro
}

IMPS = "SVAt"           # anche le talpe sono spiritelli                    # tutte le razze contano sullo stesso tetto
LIMITS = [("x", 6, "blocchi"), ("o", 6, "scintille")]
PLATS = "~|ijck"                 # tutti i tipi di asse mobile


def check(a, index):
    rows = a["rows"]
    bad = []
    for r, row in enumerate(rows):
        if len(row) != COLS:
            bad.append(f"riga {r}: {len(row)} colonne invece di {COLS}")
        for c in row:
            if c not in INK:
                bad.append(f"riga {r}: simbolo sconosciuto {c!r}")
    joined = "".join(rows)
    # Nella cava del mostro non c'è macchinario: non si inscatola niente. Ci
    # sono invece le tane, da una a quattro (il verme se le gira tutte).
    wanted = ("P", "partenze"), ("O", "portali")
    if not a.get("boss"):
        wanted += (("M", "macchinari"),)
    for sym, name in wanted:
        if joined.count(sym) != 1:
            bad.append(f"{joined.count(sym)} {name} invece di uno")
    if a.get("boss"):
        n = joined.count("B")
        if not 1 <= n <= 4:
            bad.append(f"{n} tane del mostro: ne servono da una a quattro")
        if sum(joined.count(c) for c in IMPS):
            bad.append("nella cava del mostro non ci vanno spiritelli")
    elif joined.count("B"):
        bad.append("una tana senza mostro")
    if sum(joined.count(c) for c in IMPS) > 8:
        bad.append("più di otto spiritelli")
    for sym, cap, name in LIMITS:
        if joined.count(sym) > cap:
            bad.append(f"più di {cap} {name}")

    # le assi mobili: ogni fila di simboli uguali è una sola asse
    plats = 0
    for kind in PLATS:
        for r, row in enumerate(rows):
            for c in range(COLS):
                if row[c] == kind and (c == 0 or row[c - 1] != kind):
                    plats += 1
    if plats > 6:
        bad.append(f"{plats} assi mobili: il massimo è sei")

    # il macchinario occupa quattro celle per quattro, tutte piene
    if joined.count("M") == 1:
        for r, row in enumerate(rows):
            if "M" not in row:
                continue
            c = row.index("M")
            for dy in range(4):
                for dx in range(4):
                    y, x = r + dy, c + dx
                    if y >= len(rows) or x >= COLS or rows[y][x] not in "M#":
                        bad.append(f"il macchinario esce dal muro in ({y},{x})")
    if bad:
        print(f"cava {index + 1} «{a['name']}»:")
        for b in bad:
            print("   !", b)
    return not bad


def draw(arenas, out):
    cell = 6
    pad = 10
    height = max(len(a["rows"]) for a in arenas)
    w = len(arenas) * (COLS * cell + pad) + pad
    h = height * cell + pad * 2 + 16
    img = Image.new("RGB", (w, h), (24, 26, 32))
    d = ImageDraw.Draw(img)
    for i, a in enumerate(arenas):
        ox = pad + i * (COLS * cell + pad)
        for r, row in enumerate(a["rows"]):
            for c, ch in enumerate(row):
                col = INK.get(ch, (255, 0, 0))
                d.rectangle([ox + c * cell, pad + 16 + r * cell,
                             ox + c * cell + cell - 1, pad + 16 + r * cell + cell - 1],
                            fill=col)
        d.text((ox, 4), f"{i + 1}. {a['name']}", fill=(230, 230, 235))
    img.save(out)
    print("anteprima:", out)


def main():
    arenas = json.load(open(os.path.join(HERE, "arenas.json"), encoding="utf8"))
    ok = True
    for i, a in enumerate(arenas):
        ok = check(a, i) and ok
    draw(arenas, sys.argv[1] if len(sys.argv) > 1 else
         os.path.join(ROOT, "build", "cave.png"))
    for i, a in enumerate(arenas):
        j = "".join(a["rows"])
        print(f"  {i + 1}. {a['name']:24s} {len(a['rows']):2d} righe, "
              f"spiritelli {sum(j.count(c) for c in IMPS)} "
              f"(svelti {j.count('V')}, elmi {j.count('A')}), "
              f"blocchi {j.count('x')}, scintille {j.count('o')}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
