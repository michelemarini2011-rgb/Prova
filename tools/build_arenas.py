#!/usr/bin/env python3
"""
Converte tools/arenas.txt in js/arenas.js e ne verifica la struttura.

    python3 tools/build_arenas.py

Il file di testo resta l'unica sorgente delle arene: si modifica a mano e si
rilancia questo script.
"""

import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COLS, SCREEN = 30, 16      # la mappa è larga uno schermo e alta N schermi
LEGAL = set("#.=PSMObrf")


def parse(path):
    arenas, cur = [], None
    with open(path, encoding="utf-8") as fh:
        for raw in fh:
            line = raw.rstrip("\n")
            if line.startswith("# "):
                continue
            if line.startswith("=== "):
                cur = {"name": line[4:].strip(), "hint": "", "stun": 5.0, "speed": 50, "rows": []}
                arenas.append(cur)
            elif line.startswith("--- ") and cur:
                cur["hint"] = line[4:].strip()
            elif line.startswith("!!! ") and cur:
                for part in line[4:].split():
                    key, _, value = part.partition("=")
                    if key == "stordimento":
                        cur["stun"] = float(value)
                    elif key == "velocita":
                        cur["speed"] = float(value)
            elif cur is not None and line.strip():
                cur["rows"].append(line)
    return arenas


# ---------------------------------------------------------------- raggiungibilità
# Il salto del nano copre 3 celle in altezza e circa 3,5 in lunghezza.
JUMP_UP = 3
JUMP_ACROSS = 3
FALL_ACROSS = 4


def platforms(rows):
    """Ripiani calpestabili: tratti orizzontali contigui con il cielo sopra."""
    out = []
    for y, row in enumerate(rows):
        x = 0
        while x < len(row):
            walkable = row[x] in "#=M" and (y == 0 or rows[y - 1][x] not in "#M")
            if not walkable:
                x += 1
                continue
            x0 = x
            while x < len(row) and row[x] in "#=M" and (y == 0 or rows[y - 1][x] not in "#M"):
                x += 1
            out.append({"y": y, "x0": x0, "x1": x - 1})
    return out


def gap(a, b):
    """Distanza orizzontale fra due ripiani, 0 se si sovrappongono."""
    if b["x1"] < a["x0"]:
        return a["x0"] - b["x1"]
    if b["x0"] > a["x1"]:
        return b["x0"] - a["x1"]
    return 0


def reachable(rows, start_x, start_y):
    """Ripiani raggiungibili dalla partenza, saltando in su e lasciandosi cadere."""
    plats = platforms(rows)
    start = None
    for p in plats:
        if p["y"] == start_y and p["x0"] <= start_x <= p["x1"]:
            start = p
    if start is None:
        return plats, set()
    index = {id(p): i for i, p in enumerate(plats)}
    seen = {index[id(start)]}
    queue = [start]
    while queue:
        cur = queue.pop()
        for p in plats:
            i = index[id(p)]
            if i in seen:
                continue
            dy = cur["y"] - p["y"]
            g = gap(cur, p)
            up = 0 < dy <= JUMP_UP and g <= JUMP_ACROSS
            down = dy < 0 and g <= FALL_ACROSS
            same = dy == 0 and g <= JUMP_ACROSS
            if up or down or same:
                seen.add(i)
                queue.append(p)
    return plats, {id(plats[i]) for i in seen}


def check_reachability(name, rows):
    """Ogni spiritello, il macchinario e il portale devono essere avvicinabili."""
    errors = []
    sx = sy = None
    for y, row in enumerate(rows):
        if "P" in row:
            sx, sy = row.index("P"), y + 1
    if sx is None:
        return ["%s: manca la partenza" % name]
    plats, ok = reachable(rows, sx, sy)
    if not ok:
        return ["%s: la partenza non poggia su un ripiano" % name]

    def near_ok(tx, ty, radius_tiles):
        for p in plats:
            if id(p) not in ok:
                continue
            px = min(max(tx, p["x0"]), p["x1"])
            if math.hypot(px - tx, p["y"] - ty) <= radius_tiles:
                return True
        return False

    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == "S" and not near_ok(x, y, 8):
                errors.append(f"{name}: spiritello in ({x},{y}) troppo lontano da un ripiano raggiungibile")
            elif ch == "M" and not near_ok(x, y + 3, 3):
                errors.append(f"{name}: il macchinario non è avvicinabile")
            elif ch == "O" and not near_ok(x, y + 1, 2):
                errors.append(f"{name}: il portale non è avvicinabile")
    return errors


def check(arenas):
    errors = []
    for a in arenas:
        name = a["name"]
        rows = a["rows"]
        if not rows or len(rows) % SCREEN != 0:
            errors.append(f"{name}: {len(rows)} righe, devono essere un multiplo di {SCREEN}")
            continue
        a["screens"] = len(rows) // SCREEN
        width = max(len(r) for r in rows)
        if width > COLS:
            errors.append(f"{name}: {width} colonne, il massimo è {COLS}")
        a["rows"] = [r.ljust(COLS)[:COLS].replace(" ", ".") for r in rows]
        rows = a["rows"]
        joined = "".join(rows)
        bad = set(joined) - LEGAL
        if bad:
            errors.append(f"{name}: simboli non validi {sorted(bad)}")
        for sym, label in (("P", "partenza"), ("M", "macchinario"), ("O", "portale")):
            if joined.count(sym) != 1:
                errors.append(f"{name}: serve un solo '{sym}' ({label}), trovati {joined.count(sym)}")
        a["imps"] = joined.count("S")
        if a["imps"] < 1:
            errors.append(f"{name}: nessuno spiritello")

        # partenza e portale devono poggiare su terreno solido
        for sym, label in (("P", "partenza"), ("O", "portale")):
            for y, r in enumerate(rows):
                x = r.find(sym)
                if x < 0:
                    continue
                if y + 1 >= len(rows) or rows[y + 1][x] != "#":
                    errors.append(f"{name}: {label} senza terreno sotto (riga {y}, colonna {x})")
        if "#" not in rows[-1]:
            errors.append(f"{name}: manca il terreno sull'ultima riga")

        # il macchinario deve starci per intero e appoggiare sul terreno
        for y, r in enumerate(rows):
            x = r.find("M")
            if x < 0:
                continue
            if x + 4 > COLS or y + 4 > len(rows):
                errors.append(f"{name}: il macchinario non ci sta (riga {y}, colonna {x})")
            elif rows[y + 4][x] != "#":
                errors.append(f"{name}: il macchinario non poggia sul terreno")

        errors.extend(check_reachability(name, rows))
    return errors


def main():
    arenas = parse(os.path.join(ROOT, "tools", "arenas.txt"))
    errors = check(arenas)
    for e in errors:
        print("ERRORE:", e)
    if errors:
        sys.exit(1)

    payload = [{"name": a["name"], "hint": a["hint"], "stun": a["stun"],
                "speed": a["speed"], "rows": a["rows"]} for a in arenas]
    js = ("// GENERATO da tools/build_arenas.py a partire da tools/arenas.txt — non modificare a mano.\n"
          "window.ARENAS = " + json.dumps(payload, ensure_ascii=False, indent=1) + ";\n")
    with open(os.path.join(ROOT, "js", "arenas.js"), "w", encoding="utf-8") as fh:
        fh.write(js)

    for a in arenas:
        print(f"  {a['name']:24s} {a['screens']} schermi ({len(a['rows'])} righe) · "
              f"{a['imps']} spiritelli · torpore {a['stun']}s · velocità {a['speed']}")
    print("js/arenas.js aggiornato.")


if __name__ == "__main__":
    main()
