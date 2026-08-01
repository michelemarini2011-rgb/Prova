#!/usr/bin/env python3
"""
Genera tutti gli asset grafici di Forest Tale.

    python3 tools/generate_assets.py

Nessuna immagine di partenza: ogni PNG è disegnato con Pillow, a 4x di
supersampling per ottenere bordi puliti. La palette sta in tools/palette.py.
"""

import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

import palette as P

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")

TILE = 32          # lato di una cella del livello
FRAME = 48         # lato di un fotogramma dei personaggi
SS = 4             # supersampling
VIEW_W, VIEW_H = 960, 540
BG_W = 1920        # i fondali si ripetono in orizzontale


# --------------------------------------------------------------------------
# utilità
# --------------------------------------------------------------------------
def canvas(w, h):
    return Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))


def s(v):
    return v * SS


def down(img, w, h):
    """Riduzione in alpha premoltiplicato.

    Ridimensionando un RGBA normale, i pixel trasparenti (che valgono
    0,0,0,0) trascinano del nero dentro i bordi semitrasparenti e le
    sfumature si sporcano. Premoltiplicare prima di ricampionare e
    dividere dopo evita il problema.
    """
    arr = np.asarray(img).astype(np.float32)
    a = arr[..., 3:4] / 255.0
    pre = np.concatenate([arr[..., :3] * a, arr[..., 3:4]], axis=2)
    small = np.asarray(
        Image.fromarray(pre.astype(np.uint8), "RGBA").resize((w, h), Image.LANCZOS)
    ).astype(np.float32)
    out_a = small[..., 3:4]
    rgb = np.where(out_a > 0, small[..., :3] * 255.0 / np.maximum(out_a, 1e-6), 0.0)
    return Image.fromarray(
        np.concatenate([np.clip(rgb, 0, 255), out_a], axis=2).astype(np.uint8), "RGBA"
    )


def glow(img, color, radius, alpha=200):
    a = img.getchannel("A").filter(ImageFilter.GaussianBlur(radius))
    layer = Image.new("RGBA", img.size, tuple(color) + (0,))
    layer.putalpha(a.point(lambda v: int(v * alpha / 255)))
    return Image.alpha_composite(layer, img)


def lerp(c1, c2, t):
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))


def vgradient(size, top, bottom):
    """Sfondo con gradiente verticale."""
    w, h = size
    img = Image.new("RGBA", (1, h))
    px = img.load()
    for y in range(h):
        px[0, y] = lerp(top, bottom, y / max(1, h - 1)) + (255,)
    return img.resize((w, h), Image.BILINEAR)


def save(img, name):
    img.save(os.path.join(ASSETS, name))
    print(f"  {name:20s} {img.size[0]:4d}x{img.size[1]:<4d}")


# --------------------------------------------------------------------------
# terreno: un fotogramma per ciascuna combinazione di vicini
# --------------------------------------------------------------------------
def ground_tile(mask, variant=0):
    """mask: bit0=sopra, bit1=destra, bit2=sotto, bit3=sinistra (1 = pieno).

    Di ogni combinazione si generano due varianti, alternate sulla griglia,
    così i tratti lunghi di terreno non sembrano un motivo ripetuto.
    """
    n, e, s_, w = mask & 1, mask & 2, mask & 4, mask & 8
    img = canvas(TILE, TILE)
    d = ImageDraw.Draw(img)
    r = s(5)
    corners = (
        not n and not w,   # alto-sinistra
        not n and not e,   # alto-destra
        not s_ and not e,  # basso-destra
        not s_ and not w,  # basso-sinistra
    )
    d.rounded_rectangle([0, 0, s(TILE) - 1, s(TILE) - 1], radius=r,
                        fill=P.DIRT + (255,), corners=corners)

    rnd = random.Random(1000 + mask + variant * 97)
    for _ in range(13):
        x, y = rnd.uniform(3, TILE - 3), rnd.uniform(6, TILE - 3)
        rr = rnd.uniform(0.6, 1.5)
        d.ellipse([s(x - rr), s(y - rr), s(x + rr), s(y + rr)], fill=P.DIRT_SPECK + (120,))
    if not s_:
        d.rectangle([0, s(TILE - 4), s(TILE), s(TILE)], fill=P.DIRT_DARK + (90,))

    if not n:
        # manto erboso con bordo inferiore ondulato e ciuffi
        top = canvas(TILE, TILE)
        td = ImageDraw.Draw(top)
        phase = mask * 0.7 + variant * 2.1
        pts = [(0, 0), (s(TILE), 0)]
        for i in range(17):
            x = s(TILE) - i * s(TILE) / 16
            y = s(9) + math.sin(i * 0.9 + phase) * s(1.7)
            pts.append((x, y))
        td.polygon(pts, fill=P.GRASS + (255,))
        td.rectangle([0, 0, s(TILE), s(2.5)], fill=P.GRASS_LIGHT + (255,))
        blades = rnd.randint(3, 5)
        for i in range(blades):
            x = rnd.uniform(2, TILE - 5)
            h = rnd.uniform(3.5, 9.0)
            td.polygon([(s(x), s(9)), (s(x + 1.6), s(9 - h)), (s(x + 3.2), s(9))],
                       fill=P.GRASS_LIGHT + (255,))
        # penombra subito sotto la zolla: dà spessore solo in superficie,
        # quindi il terreno profondo resta uniforme e senza bande
        for i in range(7):
            a = int(80 * (1 - i / 7))
            td.rectangle([0, s(9 + i), s(TILE), s(10 + i)], fill=P.DIRT_DARK + (a,))
        mask_img = img.getchannel("A")
        top.putalpha(Image.composite(top.getchannel("A"), Image.new("L", top.size, 0), mask_img))
        img = Image.alpha_composite(img, top)
    return img


def platform_tile():
    """Piattaforma attraversabile dal basso: asse di legno con muschio."""
    img = canvas(TILE, TILE)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, s(1), s(TILE) - 1, s(10)], radius=s(3), fill=P.WOOD + (255,))
    d.rounded_rectangle([0, s(1), s(TILE) - 1, s(4.5)], radius=s(2), fill=P.WOOD_LIGHT + (255,))
    for i in range(3):
        x = 5 + i * 10
        d.ellipse([s(x), s(0.5), s(x + 6), s(4)], fill=P.GRASS_DARK + (255,))
    for i in range(2):
        x = 8 + i * 14
        d.line([s(x), s(10), s(x), s(13)], fill=P.WOOD + (200,), width=int(s(1.5)))
    return img


def thorn_tile():
    """Rovi: pericolo, si appoggia sul terreno sottostante."""
    img = canvas(TILE, TILE)
    d = ImageDraw.Draw(img)
    base = s(TILE)
    for i in range(4):
        x = i * 8
        d.polygon([(s(x), base), (s(x + 4), s(TILE - 15)), (s(x + 8), base)],
                  fill=P.THORN + (255,))
        d.polygon([(s(x + 2.6), base), (s(x + 4), s(TILE - 13)), (s(x + 5.4), base)],
                  fill=P.THORN_LIGHT + (255,))
    d.rectangle([0, s(TILE - 4), base, base], fill=P.THORN + (255,))
    return img


def build_tiles():
    """8 colonne x 5 righe: due varianti dei 16 raccordi + gli elementi speciali."""
    cols, rows = 8, 5
    sheet = Image.new("RGBA", (cols * TILE, rows * TILE), (0, 0, 0, 0))
    for variant in (0, 1):
        for mask in range(16):
            t = down(ground_tile(mask, variant), TILE, TILE)
            sheet.alpha_composite(t, ((mask % 8) * TILE, (mask // 8 + variant * 2) * TILE))
    for i, e in enumerate([platform_tile(), thorn_tile()]):
        sheet.alpha_composite(down(e, TILE, TILE), (i * TILE, 4 * TILE))
    return sheet


# --------------------------------------------------------------------------
# fondali in parallasse
# --------------------------------------------------------------------------
def draw_conifer(d, x, base, h, w, color):
    layers = 5
    d.polygon([(s(x - w * 0.10), s(base)), (s(x + w * 0.10), s(base)),
               (s(x + w * 0.07), s(base - h * 0.45)), (s(x - w * 0.07), s(base - h * 0.45))],
              fill=color + (255,))
    for i in range(layers):
        t = i / (layers - 1)
        y0 = base - h * (0.30 + 0.62 * t)
        ww = w * (1.0 - 0.62 * t)
        d.polygon([(s(x - ww / 2), s(y0)), (s(x), s(y0 - h * 0.24)), (s(x + ww / 2), s(y0))],
                  fill=color + (255,))


def draw_broadleaf(d, x, base, h, w, color, rnd):
    d.polygon([(s(x - w * 0.09), s(base)), (s(x + w * 0.09), s(base)),
               (s(x + w * 0.05), s(base - h * 0.55)), (s(x - w * 0.05), s(base - h * 0.55))],
              fill=color + (255,))
    cx, cy = x, base - h * 0.72
    for _ in range(9):
        bx = cx + rnd.uniform(-w * 0.42, w * 0.42)
        by = cy + rnd.uniform(-h * 0.16, h * 0.18)
        br = rnd.uniform(w * 0.20, w * 0.33)
        d.ellipse([s(bx - br), s(by - br * 0.82), s(bx + br), s(by + br * 0.82)],
                  fill=color + (255,))


def draw_trunk(d, x, base, top, w, color, rnd):
    """Tronco ravvicinato: esce dallo schermo in alto, incornicia la scena."""
    d.polygon([(s(x - w / 2), s(base)), (s(x + w / 2), s(base)),
               (s(x + w * 0.34), s(top)), (s(x - w * 0.34), s(top))], fill=color + (255,))
    for _ in range(3):
        by = rnd.uniform(top + 30, base - 160)
        side = rnd.choice((-1, 1))
        bl = rnd.uniform(w * 0.9, w * 1.8)
        d.polygon([(s(x), s(by)), (s(x + side * bl), s(by - bl * 0.55)),
                   (s(x + side * bl * 0.9), s(by - bl * 0.30)), (s(x), s(by + w * 0.30))],
                  fill=color + (255,))
    # poco fogliame, appena sotto il bordo superiore
    for _ in range(7):
        bx = x + rnd.uniform(-w * 1.6, w * 1.6)
        by = top + rnd.uniform(0, 90)
        br = rnd.uniform(w * 0.7, w * 1.3)
        d.ellipse([s(bx - br), s(by - br * 0.8), s(bx + br), s(by + br * 0.8)], fill=color + (255,))


def tree_layer(color, count, hmin, hmax, seed, base_y, blur=0.0, alpha=255, kind="mixed"):
    img = canvas(BG_W, VIEW_H)
    d = ImageDraw.Draw(img)
    rnd = random.Random(seed)
    xs = [i * (BG_W / count) + rnd.uniform(-30, 30) for i in range(count)]
    for x in xs:
        h = rnd.uniform(hmin, hmax)
        w = h * rnd.uniform(0.32, 0.5)
        # ripete l'albero oltre i bordi per uno scorrimento continuo
        for dx in (-BG_W, 0, BG_W):
            if kind == "trunks":
                draw_trunk(d, x + dx, base_y, -60, rnd.uniform(26, 46), color,
                           random.Random(int(x) + seed))
            elif kind == "broadleaf" or rnd.random() >= 0.45:
                draw_broadleaf(d, x + dx, base_y, h, w, color, random.Random(int(x) + seed))
            else:
                draw_conifer(d, x + dx, base_y, h, w, color)
    if blur:
        img = img.filter(ImageFilter.GaussianBlur(s(blur)))
    out = down(img, BG_W, VIEW_H)
    if alpha < 255:
        a = out.getchannel("A").point(lambda v: int(v * alpha / 255))
        out.putalpha(a)
    return out


def build_sky():
    img = vgradient((VIEW_W, VIEW_H), P.SKY_TOP, P.SKY_BOTTOM).convert("RGBA")
    d = ImageDraw.Draw(img)
    rnd = random.Random(7)
    for _ in range(90):
        x, y = rnd.uniform(0, VIEW_W), rnd.uniform(0, VIEW_H * 0.62)
        r = rnd.uniform(0.5, 1.4)
        a = int(rnd.uniform(60, 190) * (1 - y / (VIEW_H * 0.8)))
        d.ellipse([x - r, y - r, x + r, y + r], fill=P.MOON + (max(0, a),))
    moon = Image.new("RGBA", img.size, (0, 0, 0, 0))
    md = ImageDraw.Draw(moon)
    mx, my, mr = VIEW_W * 0.76, VIEW_H * 0.20, 34
    md.ellipse([mx - mr, my - mr, mx + mr, my + mr], fill=P.MOON + (255,))
    crater = lerp(P.MOON, P.SKY_TOP, 0.10)
    for ox, oy, cr in ((-11, -6, 7), (8, 5, 9), (-4, 14, 5), (14, -12, 4)):
        md.ellipse([mx + ox - cr, my + oy - cr, mx + ox + cr, my + oy + cr], fill=crater + (255,))
    moon = glow(moon, (180, 200, 220), 26, alpha=120)
    return Image.alpha_composite(img, moon)


def build_mist():
    img = Image.new("RGBA", (BG_W, 220), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rnd = random.Random(21)
    for _ in range(70):
        x = rnd.uniform(0, BG_W)
        y = rnd.uniform(40, 190)
        w = rnd.uniform(120, 380)
        h = rnd.uniform(16, 46)
        d.ellipse([x - w / 2, y - h / 2, x + w / 2, y + h / 2], fill=P.MIST + (26,))
    return img.filter(ImageFilter.GaussianBlur(18))


# --------------------------------------------------------------------------
# la volpe
# --------------------------------------------------------------------------
def fox_frame(state, phase):
    img = canvas(FRAME, FRAME)
    d = ImageDraw.Draw(img)

    bob = 0.0
    tilt = 0.0
    legs = [0, 0, 0, 0]
    tail_up = 0.0
    ear_back = 0.0

    if state == "idle":
        bob = math.sin(phase * math.pi * 2) * 0.8
        tail_up = math.sin(phase * math.pi * 2 + 1) * 2.0
    elif state == "run":
        a = phase * math.pi * 2
        bob = abs(math.sin(a)) * 1.6 - 0.8
        tilt = 2.0
        legs = [math.sin(a) * 5, math.sin(a + math.pi) * 5,
                math.sin(a + math.pi * 0.8) * 5, math.sin(a + math.pi * 1.8) * 5]
        tail_up = 3.0 + math.sin(a) * 1.5
    elif state == "jump":
        bob = -1.0
        legs = [-3, -2, -3, -2]
        tail_up = 5.0
        ear_back = 1.0
    elif state == "fall":
        bob = 1.0
        legs = [3, 4, 3, 4]
        tail_up = 1.0
        ear_back = 1.5
    elif state == "hurt":
        bob = 1.5
        tail_up = -1.0
        ear_back = 2.5

    bx, by = 22.5, 29.0 + bob
    hx, hy = 33.0 - tilt * 0.4, 22.5 + bob - tilt * 0.3

    # coda: quattro lobi che si assottigliano verso l'alto, con la punta accesa
    tail = canvas(FRAME, FRAME)
    td = ImageDraw.Draw(tail)
    tx, ty = 10.5, by - 2
    lobes = ((2.5, 1.0, 6.4), (-1.5, -2.5 - tail_up * 0.4, 5.8),
             (-4.5, -6.0 - tail_up * 0.8, 4.6), (-6.5, -9.5 - tail_up * 1.3, 3.2))
    for i, (ox, oy, rr) in enumerate(lobes):
        col = P.FOX if i < 2 else (P.FOX_CREAM if i == 2 else P.AMBER_LIGHT)
        td.ellipse([s(tx + ox - rr), s(ty + oy - rr * 0.92),
                    s(tx + ox + rr), s(ty + oy + rr * 0.92)], fill=col + (255,))
    # alone caldo attorno alla sola punta
    tip = canvas(FRAME, FRAME)
    ox, oy, rr = lobes[-1]
    ImageDraw.Draw(tip).ellipse([s(tx + ox - rr), s(ty + oy - rr), s(tx + ox + rr), s(ty + oy + rr)],
                                fill=P.AMBER_LIGHT + (255,))
    img = Image.alpha_composite(img, glow(tip, P.AMBER, s(4.0), alpha=190))
    img = Image.alpha_composite(img, tail)
    d = ImageDraw.Draw(img)

    # zampe
    for i, (lx, w) in enumerate(((16.5, 3.4), (20.0, 3.2), (28.0, 3.2), (31.0, 3.4))):
        off = legs[i]
        d.rounded_rectangle([s(lx - w / 2), s(by + 4), s(lx + w / 2), s(by + 12 + off * 0.35)],
                            radius=s(1.6), fill=(P.FOX_DARK if i < 2 else P.FOX) + (255,))

    # corpo e pancia
    d.ellipse([s(bx - 13), s(by - 8.5), s(bx + 13), s(by + 8.5)], fill=P.FOX + (255,))
    d.ellipse([s(bx - 9), s(by + 1), s(bx + 11), s(by + 8.5)], fill=P.FOX_CREAM + (255,))

    # orecchie
    for ox, sz in ((-4.2, 1.05), (1.8, 1.15)):
        base_x = hx + ox
        d.polygon([(s(base_x - 3.6 * sz), s(hy - 4.0)),
                   (s(base_x - 0.6 * sz + ear_back * 1.6), s(hy - 15.0 * sz + ear_back * 2.6)),
                   (s(base_x + 3.0 * sz), s(hy - 4.6))], fill=P.FOX + (255,))
        d.polygon([(s(base_x - 1.9 * sz), s(hy - 5.0)),
                   (s(base_x - 0.6 * sz + ear_back * 1.3), s(hy - 12.0 * sz + ear_back * 2.1)),
                   (s(base_x + 1.6 * sz), s(hy - 5.2))], fill=P.FOX_DARK + (255,))

    # testa e muso
    d.ellipse([s(hx - 8), s(hy - 7), s(hx + 8), s(hy + 7.5)], fill=P.FOX + (255,))
    d.polygon([(s(hx + 3), s(hy - 1)), (s(hx + 11.5), s(hy + 2.6)), (s(hx + 3), s(hy + 6))],
              fill=P.FOX_CREAM + (255,))
    d.ellipse([s(hx + 9.8), s(hy + 1.3), s(hx + 12.2), s(hy + 3.7)], fill=P.FOX_EYE + (255,))

    # occhio
    if state == "hurt":
        for dx1, dy1, dx2, dy2 in ((-2, -2, 2, 2), (-2, 2, 2, -2)):
            d.line([s(hx + 3 + dx1), s(hy - 1 + dy1), s(hx + 3 + dx2), s(hy - 1 + dy2)],
                   fill=P.FOX_EYE + (255,), width=int(s(1.2)))
    else:
        d.ellipse([s(hx + 1.6), s(hy - 2.8), s(hx + 4.6), s(hy + 0.6)], fill=P.FOX_EYE + (255,))
        d.ellipse([s(hx + 2.6), s(hy - 2.4), s(hx + 3.6), s(hy - 1.4)], fill=(255, 255, 255, 220))

    return img


def build_fox():
    layout = [("idle", 4), ("run", 6), ("jump", 1), ("fall", 1), ("hurt", 1)]
    cols = max(n for _, n in layout)
    sheet = Image.new("RGBA", (cols * FRAME, len(layout) * FRAME), (0, 0, 0, 0))
    for row, (state, n) in enumerate(layout):
        for i in range(n):
            f = fox_frame(state, i / n)
            # punta della coda luminosa
            f = glow(f, P.AMBER, s(1.2), alpha=60)
            f = down(f, FRAME, FRAME)
            sheet.alpha_composite(f, (i * FRAME, row * FRAME))
    return sheet


# --------------------------------------------------------------------------
# nemici
# --------------------------------------------------------------------------
def beetle_frame(phase):
    img = canvas(FRAME, FRAME)
    d = ImageDraw.Draw(img)
    cx, cy = 24.0, 30.0
    a = phase * math.pi * 2
    for i in range(3):
        for side in (-1, 1):
            lx = cx - 7 + i * 7
            off = math.sin(a + i * 1.6 + (0 if side > 0 else math.pi)) * 2.4
            d.line([s(lx), s(cy + 3), s(lx + off), s(cy + 10)],
                   fill=P.BEETLE + (255,), width=int(s(1.6)))
    d.ellipse([s(cx - 13), s(cy - 9), s(cx + 13), s(cy + 6)], fill=P.BEETLE + (255,))
    d.ellipse([s(cx - 11), s(cy - 8), s(cx + 4), s(cy + 1)], fill=P.BEETLE_LIGHT + (200,))
    d.line([s(cx - 12), s(cy - 2), s(cx + 12), s(cy - 2)], fill=P.BEETLE_GLOW + (220,),
           width=int(s(1.4)))
    # testa e antenne
    d.ellipse([s(cx + 8), s(cy - 6), s(cx + 17), s(cy + 3)], fill=P.BEETLE + (255,))
    for sgn in (-1, 1):
        d.line([s(cx + 14), s(cy - 4), s(cx + 20), s(cy - 8 + sgn * 2)],
               fill=P.BEETLE_LIGHT + (255,), width=int(s(1.1)))
    d.ellipse([s(cx + 12.5), s(cy - 3.5), s(cx + 15), s(cy - 1)], fill=P.BEETLE_GLOW + (255,))
    return glow(img, P.BEETLE_GLOW, s(1.4), alpha=70)


def wisp_frame(phase):
    img = canvas(FRAME, FRAME)
    d = ImageDraw.Draw(img)
    a = phase * math.pi * 2
    cx, cy = 24.0, 24.0 + math.sin(a) * 1.5
    r = 8.0 + math.sin(a * 2) * 0.8
    d.ellipse([s(cx - r), s(cy - r), s(cx + r), s(cy + r)], fill=P.WISP + (235,))
    d.ellipse([s(cx - r * 0.5), s(cy - r * 0.6), s(cx + r * 0.2), s(cy + r * 0.1)],
              fill=(255, 255, 255, 220))
    # scia ondeggiante
    for i in range(4):
        t = (i + 1) / 5
        tr = r * (1 - t) * 0.7
        ty = cy + r * 0.7 + t * 11
        tx = cx + math.sin(a + t * 3) * 3.2 * t
        d.ellipse([s(tx - tr), s(ty - tr), s(tx + tr), s(ty + tr)],
                  fill=P.WISP + (int(180 * (1 - t)),))
    return glow(img, P.WISP, s(3.0), alpha=150)


def build_enemies():
    rows = [beetle_frame, wisp_frame]
    sheet = Image.new("RGBA", (4 * FRAME, len(rows) * FRAME), (0, 0, 0, 0))
    for r, fn in enumerate(rows):
        for i in range(4):
            f = down(fn(i / 4), FRAME, FRAME)
            sheet.alpha_composite(f, (i * FRAME, r * FRAME))
    return sheet


# --------------------------------------------------------------------------
# oggetti di scena
# --------------------------------------------------------------------------
def prop_mushroom(big):
    img = canvas(FRAME, FRAME)
    d = ImageDraw.Draw(img)
    scale = 1.0 if big else 0.62
    cx, base = 24.0, 44.0
    sw = 3.2 * scale
    d.rounded_rectangle([s(cx - sw), s(base - 13 * scale), s(cx + sw), s(base)],
                        radius=s(1.6), fill=(232, 224, 206) + (255,))
    cw = 13 * scale
    d.pieslice([s(cx - cw), s(base - 13 * scale - cw * 0.85),
                s(cx + cw), s(base - 13 * scale + cw * 0.85)], 180, 360,
               fill=P.GLOW_TEAL_DEEP + (255,))
    d.pieslice([s(cx - cw), s(base - 13 * scale - cw * 0.85),
                s(cx + cw), s(base - 13 * scale + cw * 0.6)], 180, 360,
               fill=P.GLOW_TEAL + (255,))
    for i in range(3):
        px = cx - cw * 0.5 + i * cw * 0.5
        py = base - 15 * scale - cw * 0.25
        d.ellipse([s(px - 1.4), s(py - 1.4), s(px + 1.4), s(py + 1.4)], fill=(240, 255, 250, 230))
    return glow(img, P.GLOW_TEAL, s(2.4), alpha=110)


def prop_fern():
    img = canvas(FRAME, FRAME)
    d = ImageDraw.Draw(img)
    cx, base = 24.0, 45.0
    for k in range(5):
        ang = math.radians(-90 + (k - 2) * 26)
        ln = 16 - abs(k - 2) * 2.4
        ex, ey = cx + math.cos(ang) * ln, base + math.sin(ang) * ln
        d.line([s(cx), s(base), s(ex), s(ey)], fill=P.GRASS_DARK + (255,), width=int(s(2.2)))
        for j in range(4):
            t = 0.3 + j * 0.2
            px, py = cx + (ex - cx) * t, base + (ey - base) * t
            d.ellipse([s(px - 2.4), s(py - 1.6), s(px + 2.4), s(py + 1.6)],
                      fill=P.GRASS + (255,))
    return img


def prop_tuft():
    img = canvas(FRAME, FRAME)
    d = ImageDraw.Draw(img)
    base = 45.0
    for k in range(7):
        x = 12 + k * 3.4
        h = 8 + (k % 3) * 4
        d.polygon([(s(x), s(base)), (s(x + 1.4), s(base - h)), (s(x + 2.8), s(base))],
                  fill=(P.GRASS if k % 2 else P.GRASS_DARK) + (255,))
    return img


def prop_rock():
    img = canvas(FRAME, FRAME)
    d = ImageDraw.Draw(img)
    d.polygon([(s(9), s(45)), (s(14), s(33)), (s(24), s(29)), (s(34), s(34)), (s(39), s(45))],
              fill=P.ROCK + (255,))
    d.polygon([(s(14), s(33)), (s(24), s(29)), (s(26), s(35)), (s(17), s(38))],
              fill=lerp(P.ROCK, (255, 255, 255), 0.18) + (255,))
    d.ellipse([s(26), s(41), s(34), s(45)], fill=P.GRASS_DARK + (255,))
    return img


def prop_lantern(lit):
    img = canvas(FRAME, FRAME)
    d = ImageDraw.Draw(img)
    cx = 24.0
    d.line([s(cx), s(6), s(cx), s(13)], fill=P.WOOD + (255,), width=int(s(1.6)))
    d.arc([s(cx - 6), s(9), s(cx + 6), s(19)], 180, 360, fill=P.WOOD_LIGHT + (255,), width=int(s(1.6)))
    body = P.AMBER if lit else (78, 82, 96)
    d.polygon([(s(cx - 7), s(19)), (s(cx + 7), s(19)), (s(cx + 8.5), s(38)), (s(cx - 8.5), s(38))],
              fill=P.WOOD + (255,))
    d.polygon([(s(cx - 5), s(21)), (s(cx + 5), s(21)), (s(cx + 6), s(36)), (s(cx - 6), s(36))],
              fill=body + (255,))
    if lit:
        d.ellipse([s(cx - 3.4), s(25), s(cx + 3.4), s(33)], fill=P.AMBER_LIGHT + (255,))
    d.rounded_rectangle([s(cx - 9), s(37), s(cx + 9), s(41)], radius=s(1.6), fill=P.WOOD + (255,))
    if lit:
        img = glow(img, P.AMBER, s(4.5), alpha=190)
    return img


def prop_firefly():
    img = canvas(FRAME, FRAME)
    d = ImageDraw.Draw(img)
    cx, cy = 24.0, 24.0
    d.ellipse([s(cx - 4.5), s(cy - 4.5), s(cx + 4.5), s(cy + 4.5)], fill=P.AMBER + (255,))
    d.ellipse([s(cx - 2.2), s(cy - 2.8), s(cx + 1.4), s(cy + 0.8)], fill=P.AMBER_LIGHT + (255,))
    for sgn in (-1, 1):
        d.ellipse([s(cx + sgn * 4 - 3), s(cy - 6), s(cx + sgn * 4 + 3), s(cy - 1)],
                  fill=(255, 255, 255, 90))
    return glow(img, P.AMBER, s(4.0), alpha=210)


def prop_acorn():
    img = canvas(FRAME, FRAME)
    d = ImageDraw.Draw(img)
    cx, cy = 24.0, 26.0
    d.ellipse([s(cx - 6), s(cy - 3), s(cx + 6), s(cy + 11)], fill=(198, 150, 96) + (255,))
    d.pieslice([s(cx - 7), s(cy - 9), s(cx + 7), s(cy + 4)], 180, 360, fill=P.WOOD + (255,))
    d.line([s(cx), s(cy - 8), s(cx), s(cy - 12)], fill=P.WOOD + (255,), width=int(s(1.4)))
    return img


def build_props():
    makers = [
        lambda: prop_mushroom(False), lambda: prop_mushroom(True), prop_fern, prop_tuft,
        prop_rock, lambda: prop_lantern(False), lambda: prop_lantern(True),
        prop_firefly, prop_acorn,
    ]
    sheet = Image.new("RGBA", (len(makers) * FRAME, FRAME), (0, 0, 0, 0))
    for i, mk in enumerate(makers):
        f = down(mk(), FRAME, FRAME)
        sheet.alpha_composite(f, (i * FRAME, 0))
    return sheet


def build_door():
    w, h = 96, 128
    sheet = Image.new("RGBA", (w * 2, h), (0, 0, 0, 0))
    for i, open_ in enumerate((False, True)):
        img = canvas(w, h)
        d = ImageDraw.Draw(img)
        # tronco cavo
        d.rounded_rectangle([s(8), s(6), s(w - 8), s(h)], radius=s(16), fill=P.WOOD + (255,))
        d.rounded_rectangle([s(14), s(12), s(w - 14), s(h)], radius=s(12),
                            fill=lerp(P.WOOD, (0, 0, 0), 0.25) + (255,))
        for k in range(4):
            x = 20 + k * 16
            d.line([s(x), s(20), s(x + 3), s(h - 6)], fill=P.WOOD_LIGHT + (90,), width=int(s(1.4)))
        # apertura ad arco
        arch = [s(26), s(h - 74), s(w - 26), s(h - 4)]
        inner = P.AMBER_LIGHT if open_ else (18, 16, 26)
        d.rounded_rectangle(arch, radius=s(22), fill=inner + (255,))
        if open_:
            d.rounded_rectangle([s(32), s(h - 66), s(w - 32), s(h - 4)], radius=s(18),
                                fill=P.AMBER + (255,))
        # chioma di foglie sopra
        rnd = random.Random(5 + i)
        for _ in range(14):
            bx = rnd.uniform(6, w - 6)
            by = rnd.uniform(0, 22)
            br = rnd.uniform(9, 16)
            d.ellipse([s(bx - br), s(by - br * 0.8), s(bx + br), s(by + br * 0.8)],
                      fill=P.NEAR_TREES + (255,))
        if open_:
            img = glow(img, P.AMBER, s(6), alpha=150)
        sheet.alpha_composite(down(img, w, h), (i * w, 0))
    return sheet


def build_leaf():
    """Indicatore di vita: foglia viva / foglia appassita."""
    size = 32
    sheet = Image.new("RGBA", (size * 2, size), (0, 0, 0, 0))
    for i, alive in enumerate((True, False)):
        img = canvas(size, size)
        d = ImageDraw.Draw(img)
        col = P.GRASS_LIGHT if alive else (72, 76, 88)
        vein = P.GRASS_DARK if alive else (52, 56, 66)
        d.polygon([(s(16), s(4)), (s(27), s(16)), (s(16), s(28)), (s(5), s(16))], fill=col + (255,))
        d.line([s(16), s(5), s(16), s(27)], fill=vein + (255,), width=int(s(1.4)))
        for k in range(3):
            y = 11 + k * 5
            d.line([s(16), s(y), s(22), s(y + 3)], fill=vein + (200,), width=int(s(1)))
            d.line([s(16), s(y), s(10), s(y + 3)], fill=vein + (200,), width=int(s(1)))
        sheet.alpha_composite(down(img, size, size), (i * size, 0))
    return sheet


# --------------------------------------------------------------------------
# logo
# --------------------------------------------------------------------------
def find_font(path_candidates, size):
    for p in path_candidates:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def build_logo():
    w, h = 720, 210
    img = canvas(w, h)
    d = ImageDraw.Draw(img)
    serif = find_font(["/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
                       "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"], int(s(74)))
    small = find_font(["/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
                       "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf"], int(s(23)))

    for i, line in enumerate(("FOREST", "TALE")):
        box = d.textbbox((0, 0), line, font=serif, stroke_width=int(s(5)))
        x = (s(w) - (box[2] - box[0])) / 2 - box[0]
        y = s(14 + i * 76)
        d.text((x, y), line, font=serif, fill=P.AMBER_LIGHT + (255,),
               stroke_width=int(s(5)), stroke_fill=(14, 20, 34, 255))
    sub = "una storia del bosco al crepuscolo"
    box = d.textbbox((0, 0), sub, font=small)
    d.text(((s(w) - (box[2] - box[0])) / 2 - box[0], s(174)), sub, font=small,
           fill=P.GLOW_TEAL + (235,))
    img = glow(img, P.AMBER, s(7), alpha=110)
    out = down(img, w, h)

    # due lucciole ai lati del sottotitolo
    fly = down(prop_firefly(), 26, 26)
    out.alpha_composite(fly, (int(w / 2 - 168), 172))
    out.alpha_composite(fly, (int(w / 2 + 142), 172))
    return out


def build_favicon():
    f = fox_frame("idle", 0.0)
    return down(f, 64, 64)


# --------------------------------------------------------------------------
def main():
    os.makedirs(ASSETS, exist_ok=True)
    print("Generazione asset di Forest Tale...")
    save(build_tiles(), "tiles.png")
    save(build_sky(), "sky.png")
    save(tree_layer(P.FAR_TREES, 14, 200, 300, 3, VIEW_H * 0.86, blur=0.7, alpha=210), "trees_far.png")
    save(tree_layer(P.MID_TREES, 11, 280, 400, 11, VIEW_H * 0.96, blur=0.25), "trees_mid.png")
    # il piano ravvicinato è fatto di soli tronchi: incornicia senza coprire il gioco
    save(tree_layer(P.NEAR_TREES, 6, 600, 700, 29, VIEW_H * 1.15, kind="trunks"), "trees_near.png")
    save(build_mist(), "mist.png")
    save(build_fox(), "fox.png")
    save(build_enemies(), "enemies.png")
    save(build_props(), "props.png")
    save(build_door(), "door.png")
    save(build_leaf(), "leaf.png")
    save(build_logo(), "logo.png")
    save(build_favicon(), "favicon.png")
    print("Fatto.")


if __name__ == "__main__":
    main()
