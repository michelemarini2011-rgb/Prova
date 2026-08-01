#!/usr/bin/env python3
"""
Generatore di tutti gli asset grafici del gioco (PNG) + del file di layout JS.

    python3 tools/generate_assets.py

Produce:
    assets/maze.png          sfondo del labirinto
    assets/maze_flash.png    labirinto bianco (lampeggio fine livello)
    assets/pacman.png        sprite sheet 3 frame x 4 direzioni
    assets/pacman_death.png  animazione di morte (12 frame)
    assets/ghosts.png        7 righe (4 fantasmi, 2 stati spaventati, occhi) x 8 colonne
    assets/pellet.png        pallino
    assets/power_pellet.png  super pallino
    assets/fruits.png        8 bonus
    assets/logo.png          logo del titolo
    assets/favicon.png       icona
    js/maze-layout.js        layout + costanti condivise con il gioco

Nessuna risorsa esterna: tutto viene disegnato proceduralmente con Pillow.
"""

import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# --------------------------------------------------------------------------
# Costanti di progetto
# --------------------------------------------------------------------------
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")

TILE = 24          # pixel per cella nel gioco
SPRITE = 48        # lato di un frame sprite (2 celle)
PAD = 6            # margine attorno al labirinto (spazio per il bagliore)
SS = 4             # fattore di supersampling per l'antialiasing

COLS, ROWS = 28, 31

WALL_BLUE = (33, 41, 222)
WALL_GLOW = (12, 16, 120)
GATE_PINK = (255, 184, 255)
PELLET = (255, 222, 173)

PAC_BASE = (255, 214, 0)
PAC_LIGHT = (255, 244, 140)
PAC_DARK = (214, 158, 0)

GHOST_COLORS = {
    "blinky": ((255, 40, 40), (255, 140, 130)),
    "pinky": ((255, 168, 222), (255, 214, 244)),
    "inky": ((0, 222, 255), (150, 245, 255)),
    "clyde": ((255, 168, 60), (255, 214, 140)),
    "fright": ((36, 36, 230), (110, 110, 255)),
    "fright_white": ((240, 240, 250), (255, 255, 255)),
}
EYE_WHITE = (250, 250, 255)
EYE_BLUE = (40, 46, 200)


# --------------------------------------------------------------------------
# Utility
# --------------------------------------------------------------------------
def new_canvas(w, h):
    """Immagine RGBA trasparente alla risoluzione di supersampling."""
    return Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))


def downscale(img, w, h):
    return img.resize((w, h), Image.LANCZOS)


def s(v):
    """Da coordinate finali a coordinate supersampled."""
    return v * SS


def shade(img, light, dark, angle=-45.0, strength=1.0):
    """Applica un gradiente lineare (luce -> ombra) rispettando l'alpha."""
    arr = np.asarray(img).astype(np.float32)
    h, w = arr.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    rad = math.radians(angle)
    proj = (xx / w) * math.cos(rad) + (yy / h) * math.sin(rad)
    lo, hi = proj.min(), proj.max()
    t = (proj - lo) / max(hi - lo, 1e-6)
    t = np.clip(t, 0.0, 1.0)[..., None]
    grad = np.array(light, np.float32) * (1 - t) + np.array(dark, np.float32) * t
    arr[..., :3] = arr[..., :3] * (1 - strength) + grad * strength
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def specular(img, cx, cy, r, alpha=120):
    """Aggiunge un riflesso morbido di luce."""
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, alpha))
    glow = glow.filter(ImageFilter.GaussianBlur(r * 0.55))
    out = Image.alpha_composite(img, glow)
    # il riflesso non deve debordare dalla silhouette
    out.putalpha(img.getchannel("A"))
    return out


def add_glow(img, color, radius, alpha=170):
    """Alone morbido dietro alla forma."""
    a = img.getchannel("A").filter(ImageFilter.GaussianBlur(radius))
    glow = Image.new("RGBA", img.size, color + (0,))
    glow.putalpha(a.point(lambda v: int(v * alpha / 255)))
    return Image.alpha_composite(glow, img)


def save(img, name):
    path = os.path.join(ASSETS, name)
    img.save(path)
    print(f"  {name:22s} {img.size[0]:4d}x{img.size[1]:<4d}")


# --------------------------------------------------------------------------
# Labirinto
# --------------------------------------------------------------------------
def load_layout():
    with open(os.path.join(ROOT, "tools", "maze_layout.txt"), encoding="utf-8") as fh:
        rows = [line.rstrip("\n") for line in fh if line.strip("\n") != "" or True]
    rows = [r for r in rows if r != ""] if len(rows) > ROWS else rows
    rows = [r.ljust(COLS)[:COLS] for r in rows][:ROWS]
    assert len(rows) == ROWS, f"attese {ROWS} righe, trovate {len(rows)}"
    return rows


def erode(mask, px):
    """Erosione morfologica di `px` pixel (kernel 3x3 ripetuto)."""
    out = mask
    for _ in range(px):
        out = out.filter(ImageFilter.MinFilter(3))
    return out


def build_maze(layout, wall_color, glow_color, gate_color, flash=False):
    w = (COLS * TILE + PAD * 2)
    h = (ROWS * TILE + PAD * 2)
    cell = TILE * SS
    pad = PAD * SS

    # 1. maschera binaria dei muri
    mask = Image.new("L", (w * SS, h * SS), 0)
    md = ImageDraw.Draw(mask)
    for y, row in enumerate(layout):
        for x, ch in enumerate(row):
            if ch == "#":
                md.rectangle(
                    [pad + x * cell, pad + y * cell,
                     pad + (x + 1) * cell - 1, pad + (y + 1) * cell - 1],
                    fill=255,
                )

    # 2. arrotondamento degli spigoli (blur + soglia)
    rounded = mask.filter(ImageFilter.GaussianBlur(cell * 0.30))
    rounded = rounded.point(lambda v: 255 if v >= 128 else 0)

    # 3. contorno = forma arrotondata meno la sua erosione
    thickness = max(2, int(round(3 * SS)))
    inner = erode(rounded, thickness)
    outline = Image.fromarray(
        np.clip(np.asarray(rounded).astype(np.int16) - np.asarray(inner).astype(np.int16), 0, 255)
        .astype(np.uint8),
        "L",
    )

    # 4. colorazione + alone
    img = Image.new("RGBA", mask.size, wall_color + (0,))
    img.putalpha(outline)
    img = add_glow(img, glow_color, cell * 0.22, alpha=200 if not flash else 120)

    # 5. cancello della casa dei fantasmi
    gate = Image.new("RGBA", mask.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(gate)
    for y, row in enumerate(layout):
        for x, ch in enumerate(row):
            if ch == "-":
                cy = pad + y * cell + cell * 0.5
                gd.rectangle(
                    [pad + x * cell, cy - cell * 0.10,
                     pad + (x + 1) * cell, cy + cell * 0.10],
                    fill=gate_color + (255,),
                )
    img = Image.alpha_composite(img, gate)
    return downscale(img, w, h)


# --------------------------------------------------------------------------
# Pac-Man
# --------------------------------------------------------------------------
def pac_frame(dir_deg, half_angle):
    img = new_canvas(SPRITE, SPRITE)
    d = ImageDraw.Draw(img)
    c = s(SPRITE / 2)
    r = s(SPRITE / 2 - 3)
    box = [c - r, c - r, c + r, c + r]
    if half_angle <= 0.5:
        d.ellipse(box, fill=PAC_BASE + (255,))
    else:
        d.pieslice(box, dir_deg + half_angle, dir_deg - half_angle + 360, fill=PAC_BASE + (255,))
    img = shade(img, PAC_LIGHT, PAC_DARK, angle=-55, strength=0.85)
    img = specular(img, c - r * 0.35, c - r * 0.45, r * 0.30, alpha=150)
    return img


def build_pacman():
    frames = [0.0, 24.0, 48.0]          # apertura della bocca (mezzo angolo)
    dirs = [0, 90, 180, 270]            # destra, giù, sinistra, su (angoli PIL, y verso il basso)
    sheet = Image.new("RGBA", (SPRITE * len(frames), SPRITE * len(dirs)), (0, 0, 0, 0))
    for r, deg in enumerate(dirs):
        for c, half in enumerate(frames):
            f = downscale(pac_frame(deg, half), SPRITE, SPRITE)
            sheet.paste(f, (c * SPRITE, r * SPRITE), f)
    return sheet


def build_pacman_death(n=12):
    sheet = Image.new("RGBA", (SPRITE * n, SPRITE), (0, 0, 0, 0))
    for i in range(n - 1):
        half = 10 + (170 * i / (n - 2))
        f = downscale(pac_frame(270, half), SPRITE, SPRITE)
        sheet.paste(f, (i * SPRITE, 0), f)
    # ultimo frame: scintilla
    spark = new_canvas(SPRITE, SPRITE)
    sd = ImageDraw.Draw(spark)
    c = s(SPRITE / 2)
    for k in range(6):
        a = math.radians(k * 60 + 15)
        sd.line(
            [c + math.cos(a) * s(7), c + math.sin(a) * s(7),
             c + math.cos(a) * s(17), c + math.sin(a) * s(17)],
            fill=PAC_LIGHT + (255,), width=int(s(2.5)),
        )
    sheet.paste(downscale(spark, SPRITE, SPRITE), ((n - 1) * SPRITE, 0))
    return sheet


# --------------------------------------------------------------------------
# Fantasmi
# --------------------------------------------------------------------------
def ghost_body(base, light, phase):
    """Silhouette del fantasma: cupola + gonna ondulata."""
    img = new_canvas(SPRITE, SPRITE)
    d = ImageDraw.Draw(img)
    left, right = s(3.0), s(SPRITE - 3.0)
    top, bottom = s(3.0), s(SPRITE - 4.0)
    r = (right - left) / 2
    cx = (left + right) / 2

    pts = []
    # cupola (da sinistra a destra passando dall'alto)
    for a in range(180, 361):
        rad = math.radians(a)
        pts.append((cx + math.cos(rad) * r, top + r + math.sin(rad) * r))
    # lato destro
    pts.append((right, bottom))
    # gonna ondulata destra -> sinistra
    amp = s(5.0)
    steps = 96
    for i in range(steps + 1):
        t = 1 - i / steps
        x = left + t * (right - left)
        wave = 0.5 + 0.5 * math.cos(2 * math.pi * (3 * t + phase))
        pts.append((x, bottom - amp * (1 - wave)))
    pts.append((left, top + r))

    d.polygon(pts, fill=base + (255,))
    img = shade(img, light, base, angle=-70, strength=0.55)
    img = specular(img, cx - r * 0.4, top + r * 0.55, r * 0.35, alpha=110)
    return img


def ghost_eyes(dx, dy, white=EYE_WHITE, pupil=EYE_BLUE):
    img = new_canvas(SPRITE, SPRITE)
    d = ImageDraw.Draw(img)
    for sx in (-1, 1):
        ex = s(SPRITE / 2 + sx * 8.0)
        ey = s(20.0)
        rx, ry = s(6.4), s(8.0)
        d.ellipse([ex - rx, ey - ry, ex + rx, ey + ry], fill=white + (255,))
        px = ex + dx * s(3.0)
        py = ey + dy * s(3.6)
        pr = s(4.0)
        d.ellipse([px - pr, py - pr, px + pr, py + pr], fill=pupil + (255,))
    return img


def fright_face(color):
    img = new_canvas(SPRITE, SPRITE)
    d = ImageDraw.Draw(img)
    for sx in (-1, 1):
        ex = s(SPRITE / 2 + sx * 7.5)
        ey = s(19.0)
        rr = s(3.6)
        d.ellipse([ex - rr, ey - rr, ex + rr, ey + rr], fill=color + (255,))
    # bocca a zigzag
    pts = []
    x0, x1 = s(11.0), s(37.0)
    n = 6
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        y = s(31.0) + (s(3.5) if i % 2 else -s(3.5))
        pts.append((x, y))
    d.line(pts, fill=color + (255,), width=int(s(2.4)), joint="curve")
    return img


def build_ghosts():
    dirs = [(1, 0), (0, 1), (-1, 0), (0, -1)]   # destra, giù, sinistra, su
    rows = ["blinky", "pinky", "inky", "clyde", "fright", "fright_white", "eyes"]
    sheet = Image.new("RGBA", (SPRITE * 8, SPRITE * len(rows)), (0, 0, 0, 0))

    for ri, name in enumerate(rows):
        for di, (dx, dy) in enumerate(dirs):
            for fi in range(2):
                phase = 0.0 if fi == 0 else 0.5
                if name == "eyes":
                    frame = ghost_eyes(dx, dy)
                else:
                    base, light = GHOST_COLORS[name]
                    frame = ghost_body(base, light, phase)
                    if name.startswith("fright"):
                        face = (255, 255, 255) if name == "fright" else (240, 40, 40)
                        frame = Image.alpha_composite(frame, fright_face(face))
                    else:
                        frame = Image.alpha_composite(frame, ghost_eyes(dx, dy))
                f = downscale(frame, SPRITE, SPRITE)
                sheet.paste(f, ((di * 2 + fi) * SPRITE, ri * SPRITE), f)
    return sheet


# --------------------------------------------------------------------------
# Pallini
# --------------------------------------------------------------------------
def build_pellet(diameter, glow):
    img = new_canvas(TILE, TILE)
    d = ImageDraw.Draw(img)
    c = s(TILE / 2)
    r = s(diameter / 2)
    d.ellipse([c - r, c - r, c + r, c + r], fill=PELLET + (255,))
    img = specular(img, c - r * 0.3, c - r * 0.3, r * 0.45, alpha=170)
    img = add_glow(img, (255, 180, 120), s(glow), alpha=150)
    return downscale(img, TILE, TILE)


# --------------------------------------------------------------------------
# Frutti / bonus
# --------------------------------------------------------------------------
def _stem(d, x0, y0, x1, y1, w=2.6, color=(90, 170, 60)):
    d.line([s(x0), s(y0), s(x1), s(y1)], fill=color + (255,), width=int(s(w)))


def _leaf(d, cx, cy, rx, ry, color=(90, 190, 70)):
    d.ellipse([s(cx - rx), s(cy - ry), s(cx + rx), s(cy + ry)], fill=color + (255,))


def fruit_cherry():
    img = new_canvas(SPRITE, SPRITE)
    d = ImageDraw.Draw(img)
    _stem(d, 24, 10, 15, 28, 2.4)
    _stem(d, 24, 10, 32, 26, 2.4)
    _leaf(d, 29, 9, 7, 3.4)
    for cx, cy, r in ((16, 33, 10), (33, 31, 9)):
        d.ellipse([s(cx - r), s(cy - r), s(cx + r), s(cy + r)], fill=(228, 30, 40, 255))
        d.ellipse([s(cx - r * 0.45), s(cy - r * 0.55), s(cx - r * 0.05), s(cy - r * 0.1)],
                  fill=(255, 190, 190, 210))
    return img


def fruit_strawberry():
    img = new_canvas(SPRITE, SPRITE)
    d = ImageDraw.Draw(img)
    d.polygon([(s(24), s(44)), (s(9), s(22)), (s(16), s(14)), (s(32), s(14)), (s(39), s(22))],
              fill=(226, 32, 48, 255))
    d.ellipse([s(9), s(12), s(39), s(34)], fill=(226, 32, 48, 255))
    for gx, gy in ((16, 22), (24, 19), (32, 22), (20, 29), (28, 29), (24, 36)):
        d.ellipse([s(gx - 1.3), s(gy - 1.3), s(gx + 1.3), s(gy + 1.3)], fill=(255, 235, 160, 255))
    _leaf(d, 24, 12, 11, 4.5, (70, 180, 70))
    _stem(d, 24, 12, 24, 5, 2.6)
    return img


def fruit_orange():
    img = new_canvas(SPRITE, SPRITE)
    d = ImageDraw.Draw(img)
    d.ellipse([s(9), s(13), s(39), s(43)], fill=(255, 150, 20, 255))
    d.ellipse([s(14), s(18), s(23), s(25)], fill=(255, 210, 130, 160))
    _stem(d, 24, 14, 24, 7, 2.6)
    _leaf(d, 30, 9, 7, 3.2)
    return img


def fruit_apple():
    img = new_canvas(SPRITE, SPRITE)
    d = ImageDraw.Draw(img)
    d.ellipse([s(8), s(14), s(28), s(44)], fill=(220, 30, 45, 255))
    d.ellipse([s(20), s(14), s(40), s(44)], fill=(220, 30, 45, 255))
    d.ellipse([s(13), s(19), s(21), s(27)], fill=(255, 190, 180, 170))
    _stem(d, 24, 15, 25, 6, 2.4, (120, 80, 40))
    _leaf(d, 31, 9, 7, 3.4)
    return img


def fruit_melon():
    img = new_canvas(SPRITE, SPRITE)
    d = ImageDraw.Draw(img)
    d.ellipse([s(8), s(12), s(40), s(44)], fill=(60, 200, 80, 255))
    for k in range(-2, 3):
        x = 24 + k * 6.5
        d.line([s(x), s(14), s(x), s(42)], fill=(180, 240, 170, 210), width=int(s(1.8)))
    _stem(d, 24, 13, 22, 5, 2.6, (150, 200, 90))
    return img


def fruit_galaxian():
    img = new_canvas(SPRITE, SPRITE)
    d = ImageDraw.Draw(img)
    d.polygon([(s(24), s(6)), (s(31), s(28)), (s(24), s(34)), (s(17), s(28))],
              fill=(240, 245, 255, 255))
    d.polygon([(s(17), s(24)), (s(6), s(38)), (s(19), s(36))], fill=(255, 200, 30, 255))
    d.polygon([(s(31), s(24)), (s(42), s(38)), (s(29), s(36))], fill=(255, 200, 30, 255))
    d.polygon([(s(24), s(12)), (s(28), s(26)), (s(20), s(26))], fill=(60, 120, 255, 255))
    return img


def fruit_bell():
    img = new_canvas(SPRITE, SPRITE)
    d = ImageDraw.Draw(img)
    d.pieslice([s(8), s(10), s(40), s(46)], 180, 360, fill=(255, 210, 40, 255))
    d.rectangle([s(8), s(28), s(40), s(37)], fill=(255, 210, 40, 255))
    d.rounded_rectangle([s(6), s(35), s(42), s(41)], radius=s(3), fill=(255, 230, 120, 255))
    d.ellipse([s(21), s(40), s(27), s(46)], fill=(230, 170, 20, 255))
    d.ellipse([s(14), s(16), s(20), s(26)], fill=(255, 250, 200, 170))
    return img


def fruit_key():
    img = new_canvas(SPRITE, SPRITE)
    d = ImageDraw.Draw(img)
    d.ellipse([s(14), s(5), s(34), s(25)], outline=(180, 220, 255, 255), width=int(s(4)))
    d.rectangle([s(21.5), s(20), s(26.5), s(43)], fill=(180, 220, 255, 255))
    d.rectangle([s(26.5), s(31), s(35), s(35)], fill=(180, 220, 255, 255))
    d.rectangle([s(26.5), s(38), s(33), s(42)], fill=(180, 220, 255, 255))
    return img


def build_fruits():
    makers = [fruit_cherry, fruit_strawberry, fruit_orange, fruit_apple,
              fruit_melon, fruit_galaxian, fruit_bell, fruit_key]
    sheet = Image.new("RGBA", (SPRITE * len(makers), SPRITE), (0, 0, 0, 0))
    for i, make in enumerate(makers):
        f = downscale(make(), SPRITE, SPRITE)
        sheet.paste(f, (i * SPRITE, 0), f)
    return sheet


# --------------------------------------------------------------------------
# Logo
# --------------------------------------------------------------------------
def find_font(size):
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    ):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def build_logo():
    w, h = 620, 150
    img = new_canvas(w, h)
    d = ImageDraw.Draw(img)
    font = find_font(int(s(78)))
    text = "PAC-MAN"
    box = d.textbbox((0, 0), text, font=font, stroke_width=int(s(6)))
    tx = (s(w) - (box[2] - box[0])) / 2 - box[0]
    ty = s(24)
    d.text((tx, ty), text, font=font, fill=PAC_BASE + (255,),
           stroke_width=int(s(6)), stroke_fill=(20, 24, 140, 255))
    img = add_glow(img, (255, 190, 40), s(9), alpha=140)

    # una pallina e tre pallini a fare da "sottotitolo"
    d2 = ImageDraw.Draw(img)
    y = s(126)
    pac = downscale(pac_frame(0, 42), 34, 34)
    for i, x in enumerate((s(300), s(340), s(380))):
        d2.ellipse([x - s(4), y - s(4), x + s(4), y + s(4)], fill=PELLET + (255,))
    out = downscale(img, w, h)
    out.paste(pac, (int(w / 2 - 90), int(h - 41)), pac)
    return out


def build_favicon():
    f = pac_frame(30, 40)
    img = Image.new("RGBA", f.size, (0, 0, 0, 0))
    img = Image.alpha_composite(img, f)
    return downscale(img, 64, 64)


# --------------------------------------------------------------------------
# File di layout condiviso con il gioco
# --------------------------------------------------------------------------
def write_layout_js(layout):
    lines = ",\n".join('  "%s"' % row.replace('"', '\\"') for row in layout)
    js = f"""// GENERATO AUTOMATICAMENTE da tools/generate_assets.py — non modificare a mano.
// Legenda: '#' muro  '.' pallino  'o' super pallino  '-' cancello  ' ' vuoto
window.MAZE = {{
  COLS: {COLS},
  ROWS: {ROWS},
  TILE: {TILE},
  SPRITE: {SPRITE},
  PAD: {PAD},
  LAYOUT: [
{lines}
  ]
}};
"""
    path = os.path.join(ROOT, "js", "maze-layout.js")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(js)
    print(f"  js/maze-layout.js      {COLS}x{ROWS}")


# --------------------------------------------------------------------------
def main():
    os.makedirs(ASSETS, exist_ok=True)
    layout = load_layout()
    print("Generazione asset...")

    save(build_maze(layout, WALL_BLUE, WALL_GLOW, GATE_PINK), "maze.png")
    save(build_maze(layout, (245, 248, 255), (120, 140, 255), (255, 255, 255), flash=True),
         "maze_flash.png")
    save(build_pacman(), "pacman.png")
    save(build_pacman_death(), "pacman_death.png")
    save(build_ghosts(), "ghosts.png")
    save(build_pellet(6.5, 3.0), "pellet.png")
    save(build_pellet(15.0, 5.0), "power_pellet.png")
    save(build_fruits(), "fruits.png")
    save(build_logo(), "logo.png")
    save(build_favicon(), "favicon.png")
    write_layout_js(layout)
    print("Fatto.")


if __name__ == "__main__":
    main()
