#!/usr/bin/env python3
"""
Impacchetta Martello & Scatole in un unico file HTML autosufficiente.

    python3 tools/bundle.py dist/martello.html

CSS e JavaScript finiscono dentro la pagina e ogni PNG diventa un data URI,
così il file si può aprire o condividere da solo, senza la cartella assets/.

Con --body viene prodotto solo il contenuto del <body>, per gli host che
avvolgono da sé la pagina.
"""

import argparse
import base64
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CSS_FILES = ["css/style.css"]
JS_FILES = [
    "js/arenas.js",
    "js/assets.js",
    "js/audio.js",
    "js/input.js",
    "js/arena.js",
    "js/dwarf.js",
    "js/imps.js",
    "js/game.js",
    "js/main.js",
]


def read(path):
    with open(os.path.join(ROOT, path), encoding="utf-8") as fh:
        return fh.read()


def data_uri(path):
    with open(os.path.join(ROOT, path), "rb") as fh:
        return "data:image/png;base64," + base64.b64encode(fh.read()).decode("ascii")


def inline_assets(js):
    return re.sub(r"assets/[A-Za-z0-9_.-]+\.png", lambda m: data_uri(m.group(0)), js)


def body_markup():
    html = read("index.html")
    body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
    return re.sub(r"\s*<script src=\"[^\"]+\"></script>", "", body).strip()


def build(body_only):
    parts = [
        "<title>Martello &amp; Scatole</title>",
        "<style>\n" + "\n".join(read(p) for p in CSS_FILES) + "\n</style>",
        body_markup(),
        "<script>\n" + inline_assets("\n".join(read(p) for p in JS_FILES)) + "\n</script>",
    ]
    body = "\n\n".join(parts)
    if body_only:
        return body + "\n"
    return ('<!DOCTYPE html>\n<html lang="it">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            + body + "\n</html>\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("output", nargs="?", default="dist/martello.html")
    ap.add_argument("--body", action="store_true", help="solo il contenuto del body")
    args = ap.parse_args()

    out = args.output if os.path.isabs(args.output) else os.path.join(ROOT, args.output)
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    html = build(args.body)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(html)
    print(f"{out}  ({len(html) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
