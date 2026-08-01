#!/usr/bin/env python3
"""
Converte tools/levels.txt in js/levels.js e ne verifica la struttura.

    python3 tools/build_levels.py

Il file di testo resta l'unica sorgente dei livelli: si modifica a mano e si
rilancia questo script.
"""

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROWS = 20
LEGAL = set("#=^PDLobwmMftr ")


def parse(path):
    levels = []
    cur = None
    with open(path, encoding="utf-8") as fh:
        for raw in fh:
            line = raw.rstrip("\n")
            if line.startswith("#") and not line.startswith("###"):
                continue
            if line.startswith("=== "):
                cur = {"name": line[4:].strip(), "hint": "", "rows": []}
                levels.append(cur)
                continue
            if line.startswith("--- "):
                if cur:
                    cur["hint"] = line[4:].strip()
                continue
            if cur is not None and len(cur["rows"]) < ROWS:
                cur["rows"].append(line)
    return levels


def check(levels):
    errors = []
    for lv in levels:
        name = lv["name"]
        if len(lv["rows"]) != ROWS:
            errors.append(f"{name}: {len(lv['rows'])} righe invece di {ROWS}")
        width = max((len(r) for r in lv["rows"]), default=0)
        lv["rows"] = [r.ljust(width) for r in lv["rows"]]
        joined = "".join(lv["rows"])
        bad = set(joined) - LEGAL
        if bad:
            errors.append(f"{name}: simboli non validi {sorted(bad)}")
        for sym, label in (("P", "partenza"), ("D", "porta")):
            if joined.count(sym) != 1:
                errors.append(f"{name}: serve esattamente una {label} ('{sym}'), trovate {joined.count(sym)}")
        lv["width"] = width
        lv["fireflies"] = joined.count("o")
    return errors


def main():
    levels = parse(os.path.join(ROOT, "tools", "levels.txt"))
    errors = check(levels)
    for e in errors:
        print("ERRORE:", e)
    if errors:
        sys.exit(1)

    payload = [{"name": l["name"], "hint": l["hint"], "rows": l["rows"]} for l in levels]
    js = ("// GENERATO da tools/build_levels.py a partire da tools/levels.txt — non modificare a mano.\n"
          "window.LEVELS = " + json.dumps(payload, ensure_ascii=False, indent=1) + ";\n")
    with open(os.path.join(ROOT, "js", "levels.js"), "w", encoding="utf-8") as fh:
        fh.write(js)

    for l in levels:
        print(f"  {l['name']:32s} {l['width']:3d}x{ROWS}  {l['fireflies']:2d} lucciole")
    print("js/levels.js aggiornato.")


if __name__ == "__main__":
    main()
