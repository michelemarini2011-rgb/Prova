#!/usr/bin/env python3
"""Disegna il logo della versione inglese, nello stile di quello originale.

Il logo italiano (tools/png/logo.png) arriva dal gioco HTML: lettere color
crema con un contorno bruno spesso e una riga di sottotitolo. Qui se ne fa uno
uguale con le parole inglesi, sulla stessa tela di 760x200, così passa per lo
stesso convertitore senza nessun trattamento speciale.

    python3 tools/make_logo_en.py        (serve Pillow)
"""
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
PNG = os.path.join(HERE, "png")

SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
SANS = "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"

CREAM = (255, 232, 140, 255)
BROWN = (126, 60, 30, 255)
SHADOW = (94, 42, 20, 255)

SIZE = (760, 200)
TITLE = ["HAMMER", "& BOXES"]
SUBTITLE = "imps won't be caught bare-handed"


def centred(draw, text, font, cy, stroke, fill, outline):
    """Una riga centrata sulla tela, con contorno e ombra portata."""
    x0, y0, x1, y1 = draw.textbbox((0, 0), text, font=font, stroke_width=stroke)
    x = (SIZE[0] - (x1 - x0)) // 2 - x0
    y = cy - (y1 - y0) // 2 - y0
    draw.text((x, y + 5), text, font=font, fill=SHADOW,
              stroke_width=stroke, stroke_fill=SHADOW)
    draw.text((x, y), text, font=font, fill=fill,
              stroke_width=stroke, stroke_fill=outline)


def main():
    img = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    title = ImageFont.truetype(SERIF, 76)
    centred(draw, TITLE[0], title, 48, 7, CREAM, BROWN)
    centred(draw, TITLE[1], title, 118, 7, CREAM, BROWN)

    sub = ImageFont.truetype(SANS, 28)
    centred(draw, SUBTITLE, sub, 172, 3, CREAM, BROWN)

    out = os.path.join(PNG, "logo_en.png")
    img.save(out)
    print(f"scritto {out}")


if __name__ == "__main__":
    main()
