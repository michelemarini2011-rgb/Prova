#!/usr/bin/env python3
"""
Converte tools/arenas.txt in js/arenas.js e ne verifica la struttura.

    python3 tools/build_arenas.py

Il file di testo resta l'unica sorgente delle arene: si modifica a mano e si
rilancia questo script.
"""

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COLS, ROWS = 30, 16
LEGAL = set("#.,RPSMOT")


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
            elif cur is not None and len(cur["rows"]) < ROWS and line.strip():
                cur["rows"].append(line)
    return arenas


def check(arenas):
    errors = []
    for a in arenas:
        name = a["name"]
        if len(a["rows"]) != ROWS:
            errors.append(f"{name}: {len(a['rows'])} righe invece di {ROWS}")
            continue
        a["rows"] = [r.ljust(COLS)[:COLS].replace(" ", ".") for r in a["rows"]]
        joined = "".join(a["rows"])
        bad = set(joined) - LEGAL
        if bad:
            errors.append(f"{name}: simboli non validi {sorted(bad)}")
        for sym, label in (("P", "partenza"), ("M", "macchinario"), ("O", "portale")):
            if joined.count(sym) != 1:
                errors.append(f"{name}: serve un solo '{sym}' ({label}), trovati {joined.count(sym)}")
        a["imps"] = joined.count("S")
        if a["imps"] < 1:
            errors.append(f"{name}: nessuno spiritello")
        # il bordo dev'essere chiuso, altrimenti si esce dall'arena
        border_ok = all(a["rows"][0][x] in "#T" and a["rows"][ROWS - 1][x] in "#T" for x in range(COLS)) \
            and all(a["rows"][y][0] in "#T" and a["rows"][y][COLS - 1] in "#T" for y in range(ROWS))
        if not border_ok:
            errors.append(f"{name}: il bordo dell'arena non è chiuso")
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
        print(f"  {a['name']:26s} {a['imps']} spiritelli · stordimento {a['stun']}s · velocità {a['speed']}")
    print("js/arenas.js aggiornato.")


if __name__ == "__main__":
    main()
