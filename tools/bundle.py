#!/usr/bin/env python3
"""
Impacchetta il gioco in un unico file HTML autosufficiente.

    python3 tools/bundle.py dist/pacman.html

CSS e JavaScript vengono incorporati nella pagina e ogni PNG diventa un
data URI, così il file si può aprire o condividere da solo, senza la
cartella `assets/`.

Con --body viene prodotto solo il contenuto del <body> (senza <!DOCTYPE>,
<html> e <head>), come richiesto da alcuni host che avvolgono da soli la
pagina.
"""

import argparse
import base64
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CSS_FILES = ["css/style.css"]
JS_FILES = [
    "js/maze-layout.js",
    "js/config.js",
    "js/assets.js",
    "js/audio.js",
    "js/level.js",
    "js/entities.js",
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
    """Sostituisce ogni percorso assets/*.png con il rispettivo data URI."""
    def repl(match):
        return data_uri(match.group(0))
    return re.sub(r"assets/[A-Za-z0-9_.-]+\.png", repl, js)


def body_markup():
    html = read("index.html")
    body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
    # via i riferimenti a file esterni: css e js finiscono incorporati
    body = re.sub(r"\s*<script src=\"[^\"]+\"></script>", "", body)
    return body.strip()


def build(body_only):
    css = "\n".join(read(p) for p in CSS_FILES)
    js = inline_assets("\n".join(read(p) for p in JS_FILES))
    parts = [
        "<title>Pac-Man HTML5</title>",
        "<style>\n" + css + "\n</style>",
        body_markup(),
        "<script>\n" + js + "\n</script>",
    ]
    body = "\n\n".join(parts)
    if body_only:
        return body + "\n"
    return (
        '<!DOCTYPE html>\n<html lang="it">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + body
        + "\n</html>\n"
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("output", nargs="?", default="dist/pacman.html")
    ap.add_argument("--body", action="store_true", help="produce solo il contenuto del body")
    args = ap.parse_args()

    out = args.output if os.path.isabs(args.output) else os.path.join(ROOT, args.output)
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    html = build(args.body)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(html)
    print(f"{out}  ({len(html) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
