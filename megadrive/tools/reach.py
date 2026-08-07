#!/usr/bin/env python3
"""Controlla che le cave si possano salire davvero.

Il nano salta tre celle in alto e ne copre quattro in orizzontale: se la prima
asse è più su, dal punto di partenza non ci si stacca. A occhio non si vede —
la mappa sembra sempre ragionevole — quindi qui si simula.

Il modello è approssimato per eccesso (concede il salto massimo in ogni
direzione): se dice che una cosa non si raggiunge, di sicuro non si raggiunge.

    python3 tools/reach.py
"""
import json
import os
import sys
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))
COLS = 30

SOLID = set("#MnN")          # terreno, macchinario, nastri
ONEWAY = set("=")            # assi fisse: si sale da sotto, si sta sopra
PLATS = set("~|ijck")        # assi mobili di ogni tipo
MOLES = set("t")             # le uniche che stanno ferme dove le metti

JUMP_UP = 3                  # celle: 48 pixel contro i 48 del salto
JUMP_SIDE = 4
HAMMER_X = 4                 # portata dell'onda d'urto, in celle
HAMMER_Y = 3


def load(rows):
    grid = [list(r) for r in rows]
    return grid


def support(grid, cx, cy):
    """C'è qualcosa su cui stare, sotto la cella (cx, cy)?"""
    if cy + 1 >= len(grid):
        return False
    c = grid[cy + 1][cx]
    return c in SOLID or c in ONEWAY or c in PLATS


def free(grid, cx, cy):
    if cx < 0 or cx >= COLS or cy < 0 or cy >= len(grid):
        return False
    return grid[cy][cx] not in SOLID


def stands(grid, cx, cy):
    return free(grid, cx, cy) and support(grid, cx, cy)


def plat_cells(grid):
    """Le caselle su cui si sta, offerte dalle assi mobili lungo tutta la loro
    corsa. Quella che scorre non sta dove l'hai disegnata: va da un muro
    all'altro della riga. Senza questo, metà delle cave sembra irraggiungibile
    — e sono quelle che si giocano da mesi."""
    cells = set()
    for y, row in enumerate(grid):
        x = 0
        while x < COLS:
            c = row[x]
            if c not in PLATS:
                x += 1
                continue
            n = 0
            while x + n < COLS and row[x + n] == c:
                n += 1
            if c in "~k":                       # scorre fino ai muri della riga
                left, right = x, x + n - 1
                while left > 0 and row[left - 1] not in SOLID:
                    left -= 1
                while right < COLS - 1 and row[right + 1] not in SOLID:
                    right += 1
                cells.update((px, y - 1) for px in range(left, right + 1))
            elif c == "|":                      # sale e scende di tre celle
                cells.update((px, y - 1 + dy)
                             for px in range(x, x + n) for dy in range(-3, 4))
            else:                               # ferma dov'è
                cells.update((px, y - 1) for px in range(x, x + n))
            x += n
    return cells


def reachable(grid, start, extra):
    """Tutte le posizioni in piedi che si toccano partendo da quella iniziale."""

    def stand(cx, cy):
        if not free(grid, cx, cy):
            return False
        return support(grid, cx, cy) or (cx, cy) in extra

    seen = set()
    q = deque([start])
    while q:
        cx, cy = q.popleft()
        if (cx, cy) in seen:
            continue
        seen.add((cx, cy))
        # camminare, e cadere di lato fino al primo appoggio
        for dx in (-1, 1):
            nx = cx + dx
            if not free(grid, nx, cy):
                continue
            ny = cy
            while ny < len(grid) and not stand(nx, ny):
                if not free(grid, nx, ny):
                    ny = -1
                    break
                ny += 1
            if 0 <= ny < len(grid) and (nx, ny) not in seen:
                q.append((nx, ny))
        # saltare: tre celle in alto, quattro di lato
        for ny in range(cy - JUMP_UP, cy + 1):
            for nx in range(cx - JUMP_SIDE, cx + JUMP_SIDE + 1):
                if (nx, ny) in seen or not (0 <= nx < COLS):
                    continue
                if abs(nx - cx) + max(0, cy - ny) > JUMP_SIDE + JUMP_UP:
                    continue
                if stand(nx, ny):
                    q.append((nx, ny))
    return seen


def check(a, index):
    rows = a["rows"]
    # La cava del mostro è un'arena piatta: non si sale da nessuna parte, e non
    # deve. Qui il controllo non ha niente da dire.
    if a.get("boss"):
        return []
    grid = load(rows)
    bad = []

    start = None
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c == "P":
                start = (x, y)
    if start is None:
        return ["nessuna partenza"]
    sx, sy = start
    while sy < len(grid) and not stands(grid, sx, sy):
        sy += 1
    seen = reachable(grid, (sx, sy), plat_cells(grid))

    # da fermo, quante posizioni si toccano? Se sono solo quelle del suolo di
    # partenza, la cava è una prigione.
    ground = set(p for p in seen if p[1] >= len(grid) - 4)
    if len(seen) - len(ground) == 0:
        bad.append("dal punto di partenza non ci si stacca dal suolo")

    # Gli spiritelli volano e vengono loro incontro, quindi dove stanno di casa
    # non conta. Le talpe no: quelle stanno dove le metti, e se non sono a tiro
    # di martello la cava non si finisce.
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c not in MOLES:
                continue
            ok = any(abs(px - x) <= HAMMER_X and abs(py - y) <= HAMMER_Y
                     for (px, py) in seen)
            if not ok:
                bad.append(f"la talpa in ({y},{x}) non è a tiro")

    # ogni asse dev'essere calpestabile: una che non si raggiunge è arredamento
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c not in ONEWAY and c not in PLATS:
                continue
            if x and r[x - 1] == c:
                continue                    # solo il primo pezzo di ogni asse
            span = 0
            while x + span < COLS and r[x + span] == c:
                span += 1
            if not any((px, y - 1) in seen for px in range(x, x + span)):
                bad.append(f"l'asse in ({y},{x}) non si raggiunge")

    # il portale e la bocca del macchinario
    for sym, name in (("O", "il portale"), ("M", "il macchinario")):
        for y, r in enumerate(rows):
            for x, c in enumerate(r):
                if c != sym:
                    continue
                near = any(abs(px - x) <= 3 and abs(py - y) <= 3 for (px, py) in seen)
                if not near:
                    bad.append(f"{name} in ({y},{x}) non si raggiunge")
    return bad


def main():
    arenas = json.load(open(os.path.join(HERE, "arenas.json"), encoding="utf8"))
    ko = 0
    for i, a in enumerate(arenas):
        bad = check(a, i)
        mark = "ok " if not bad else "NO "
        print(f"{mark}{i + 1:2d}. {a['name']}")
        for b in bad:
            print("      !", b)
        ko += bool(bad)
    print(f"\n{len(arenas) - ko} cave su {len(arenas)} in piedi")
    return 1 if ko else 0


if __name__ == "__main__":
    sys.exit(main())
