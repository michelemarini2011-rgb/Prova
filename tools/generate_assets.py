#!/usr/bin/env python3
"""
Genera tutti gli asset grafici di Martello & Scatole (vista laterale, di giorno).

    python3 tools/generate_assets.py

Nessuna immagine di partenza: ogni PNG è disegnato con Pillow a 4x di
supersampling e ridotto in alpha premoltiplicato. La palette sta in
tools/palette.py.
"""

import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

import palette as P

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")

TILE = 32          # lato di una cella
DWARF = 64         # fotogramma del nano
IMP = 48           # fotogramma dello spiritello
VIEW_W, VIEW_H = 960, 540
SS = 4


# --------------------------------------------------------------------------
# utilità
# --------------------------------------------------------------------------
def canvas(w, h):
    return Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))


def s(v):
    return v * SS


def down(img, w, h):
    """Riduzione in alpha premoltiplicato: i bordi sfumati restano puliti."""
    arr = np.asarray(img).astype(np.float32)
    a = arr[..., 3:4] / 255.0
    pre = np.concatenate([arr[..., :3] * a, arr[..., 3:4]], axis=2)
    small = np.asarray(
        Image.fromarray(pre.astype(np.uint8), "RGBA").resize((w, h), Image.LANCZOS)
    ).astype(np.float32)
    out_a = small[..., 3:4]
    rgb = np.where(out_a > 0, small[..., :3] * 255.0 / np.maximum(out_a, 1e-6), 0.0)
    return Image.fromarray(
        np.concatenate([np.clip(rgb, 0, 255), out_a], axis=2).astype(np.uint8), "RGBA")


def glow(img, color, radius, alpha=200):
    a = img.getchannel("A").filter(ImageFilter.GaussianBlur(radius))
    layer = Image.new("RGBA", img.size, tuple(color) + (0,))
    layer.putalpha(a.point(lambda v: int(v * alpha / 255)))
    return Image.alpha_composite(layer, img)


def lerp(c1, c2, t):
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))


def vgradient(size, top, bottom):
    w, h = size
    img = Image.new("RGBA", (1, h))
    px = img.load()
    for y in range(h):
        px[0, y] = lerp(top, bottom, y / max(1, h - 1)) + (255,)
    return img.resize((w, h), Image.BILINEAR)


def save(img, name):
    img.save(os.path.join(ASSETS, name))
    print(f"  {name:16s} {img.size[0]:4d}x{img.size[1]:<4d}")


def ellipse(d, cx, cy, rx, ry, fill, alpha=255):
    d.ellipse([s(cx - rx), s(cy - ry), s(cx + rx), s(cy + ry)], fill=tuple(fill) + (alpha,))


# --------------------------------------------------------------------------
# fondale: cielo, sole, nuvole, colline
# --------------------------------------------------------------------------
def build_backdrop():
    img = vgradient((VIEW_W, VIEW_H), P.SKY_TOP, P.SKY_BOTTOM).convert("RGBA")

    # sole con alone
    sun = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sun)
    sx, sy, sr = 812, 96, 46
    sd.ellipse([sx - sr, sy - sr, sx + sr, sy + sr], fill=P.SUN + (255,))
    sun = glow(sun, P.SUN, 34, alpha=150)
    img = Image.alpha_composite(img, sun)

    d = ImageDraw.Draw(img)
    rnd = random.Random(12)

    # nuvole a lobi
    for _ in range(9):
        cx = rnd.uniform(20, VIEW_W - 20)
        cy = rnd.uniform(40, 210)
        scale = rnd.uniform(0.7, 1.5)
        for k in range(6):
            bx = cx + (k - 2.5) * 20 * scale + rnd.uniform(-8, 8)
            by = cy + rnd.uniform(-8, 8)
            br = rnd.uniform(18, 30) * scale
            d.ellipse([bx - br, by - br * 0.72, bx + br, by + br * 0.72], fill=P.CLOUD + (235,))
        for k in range(4):
            bx = cx + (k - 1.5) * 22 * scale
            by = cy + 12 * scale
            br = rnd.uniform(14, 22) * scale
            d.ellipse([bx - br, by - br * 0.5, bx + br, by + br * 0.5], fill=P.CLOUD_SHADE + (200,))

    # colline lontane e vicine
    for color, base, amp, freq, alpha in ((P.HILL_FAR, 372, 46, 0.0075, 255),
                                          (P.HILL_NEAR, 424, 34, 0.0110, 255)):
        pts = [(0, VIEW_H)]
        for x in range(0, VIEW_W + 12, 12):
            y = base - math.sin(x * freq) * amp - math.sin(x * freq * 2.3 + 1) * amp * 0.35
            pts.append((x, y))
        pts.append((VIEW_W, VIEW_H))
        d.polygon(pts, fill=color + (alpha,))

    # alberelli sulla collina vicina
    rnd2 = random.Random(5)
    for _ in range(16):
        x = rnd2.uniform(10, VIEW_W - 10)
        y = 424 - math.sin(x * 0.0110) * 34 - math.sin(x * 0.0110 * 2.3 + 1) * 12 + 6
        h = rnd2.uniform(20, 38)
        d.polygon([(x - 2.5, y), (x + 2.5, y), (x + 1.6, y - h * 0.5), (x - 1.6, y - h * 0.5)],
                  fill=P.TREE_DARK + (255,))
        for k in range(3):
            r = h * (0.34 - k * 0.07)
            cy = y - h * (0.5 + k * 0.22)
            d.ellipse([x - r, cy - r * 0.9, x + r, cy + r * 0.9],
                      fill=(P.TREE if k % 2 == 0 else P.TREE_DARK) + (255,))
    return img


# --------------------------------------------------------------------------
# terreno e piattaforme
# --------------------------------------------------------------------------
def ground_tile(mask, variant=0):
    """mask: bit0=sopra, bit1=destra, bit2=sotto, bit3=sinistra (1 = pieno)."""
    n, e, s_, w = mask & 1, mask & 2, mask & 4, mask & 8
    img = canvas(TILE, TILE)
    d = ImageDraw.Draw(img)
    corners = (not n and not w, not n and not e, not s_ and not e, not s_ and not w)
    d.rounded_rectangle([0, 0, s(TILE) - 1, s(TILE) - 1], radius=s(5),
                        fill=P.EARTH + (255,), corners=corners)

    rnd = random.Random(500 + mask + variant * 61)
    for _ in range(9):
        x, y = rnd.uniform(3, TILE - 3), rnd.uniform(8, TILE - 3)
        r = rnd.uniform(0.8, 2.0)
        ellipse(d, x, y, r, r * 0.8, P.PEBBLE, 170)
    if not s_:
        d.rectangle([0, s(TILE - 4), s(TILE), s(TILE)], fill=P.EARTH_DARK + (110,))

    if not n:
        top = canvas(TILE, TILE)
        td = ImageDraw.Draw(top)
        phase = mask * 0.8 + variant * 2.4
        pts = [(0, 0), (s(TILE), 0)]
        for i in range(17):
            x = s(TILE) - i * s(TILE) / 16
            y = s(10) + math.sin(i * 0.9 + phase) * s(1.8)
            pts.append((x, y))
        td.polygon(pts, fill=P.GRASS + (255,))
        td.rectangle([0, 0, s(TILE), s(3)], fill=P.GRASS_LIGHT + (255,))
        for _ in range(rnd.randint(3, 5)):
            x = rnd.uniform(2, TILE - 5)
            h = rnd.uniform(4, 9)
            td.polygon([(s(x), s(10)), (s(x + 1.7), s(10 - h)), (s(x + 3.4), s(10))],
                       fill=P.GRASS_LIGHT + (255,))
        for i in range(7):
            a = int(70 * (1 - i / 7))
            td.rectangle([0, s(10 + i), s(TILE), s(11 + i)], fill=P.EARTH_DARK + (a,))
        m = img.getchannel("A")
        top.putalpha(Image.composite(top.getchannel("A"), Image.new("L", top.size, 0), m))
        img = Image.alpha_composite(img, top)
    return img


def platform_tile():
    """Asse di legno: ci si sale da sotto."""
    img = canvas(TILE, TILE)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, s(1), s(TILE) - 1, s(11)], radius=s(3), fill=P.WOOD + (255,))
    d.rounded_rectangle([0, s(1), s(TILE) - 1, s(5)], radius=s(2), fill=P.WOOD_LIGHT + (255,))
    d.rectangle([0, s(9), s(TILE), s(11)], fill=P.WOOD_DARK + (255,))
    for i in range(2):
        x = 9 + i * 14
        d.line([s(x), s(2), s(x), s(10)], fill=P.WOOD_DARK + (150,), width=int(s(1.2)))
    return img


def bush_tile():
    img = canvas(TILE, TILE)
    d = ImageDraw.Draw(img)
    for bx, by, br in ((10, 24, 8), (20, 23, 9), (15, 19, 8)):
        ellipse(d, bx, by, br, br * 0.85, P.TREE)
    for bx, by, br in ((12, 21, 5), (19, 20, 5)):
        ellipse(d, bx, by, br, br * 0.8, P.GRASS)
    for fx, fy in ((9, 20), (21, 19), (16, 15)):
        ellipse(d, fx, fy, 1.7, 1.7, (255, 240, 130))
    return img


def rock_tile():
    img = canvas(TILE, TILE)
    d = ImageDraw.Draw(img)
    d.polygon([(s(5), s(28)), (s(7), s(16)), (s(15), s(9)), (s(25), s(12)),
               (s(28), s(21)), (s(25), s(28))], fill=P.ROCK + (255,))
    d.polygon([(s(7), s(16)), (s(15), s(9)), (s(25), s(12)), (s(17), s(19))],
              fill=P.ROCK_LIGHT + (255,))
    d.polygon([(s(5), s(28)), (s(17), s(19)), (s(25), s(28))], fill=P.ROCK_DARK + (255,))
    return img


def flower_tile():
    img = canvas(TILE, TILE)
    d = ImageDraw.Draw(img)
    for fx, h, col in ((9, 12, (255, 120, 160)), (16, 16, (255, 226, 90)), (23, 11, (150, 190, 255))):
        d.line([s(fx), s(28), s(fx), s(28 - h)], fill=P.GRASS_DARK + (255,), width=int(s(1.2)))
        for k in range(5):
            a = math.radians(k * 72)
            ellipse(d, fx + math.cos(a) * 2.4, 28 - h + math.sin(a) * 2.4, 1.8, 1.8, col)
        ellipse(d, fx, 28 - h, 1.5, 1.5, (255, 250, 200))
    return img


def build_tiles():
    """8x3: due varianti dei 16 raccordi, poi asse, cespuglio, sasso, fiori."""
    sheet = Image.new("RGBA", (8 * TILE, 5 * TILE), (0, 0, 0, 0))
    for variant in (0, 1):
        for mask in range(16):
            t = down(ground_tile(mask, variant), TILE, TILE)
            sheet.alpha_composite(t, ((mask % 8) * TILE, (mask // 8 + variant * 2) * TILE))
    for i, mk in enumerate((platform_tile, bush_tile, rock_tile, flower_tile)):
        sheet.alpha_composite(down(mk(), TILE, TILE), (i * TILE, 4 * TILE))
    return sheet


# --------------------------------------------------------------------------
# il nano, di profilo
# --------------------------------------------------------------------------
def draw_hammer(d, x, y, angle, scale=1.0, behind=False):
    a = math.radians(angle)
    ln = 21 * scale
    hx, hy = x + math.cos(a) * ln, y + math.sin(a) * ln
    d.line([s(x), s(y), s(hx), s(hy)],
           fill=(P.HANDLE_DARK if behind else P.HANDLE) + (255,), width=int(s(3.6 * scale)))
    px, py = -math.sin(a), math.cos(a)
    hw, hh = 5.4 * scale, 7.4 * scale
    quad = [
        (hx + px * hh - math.cos(a) * hw, hy + py * hh - math.sin(a) * hw),
        (hx - px * hh - math.cos(a) * hw, hy - py * hh - math.sin(a) * hw),
        (hx - px * hh + math.cos(a) * hw, hy - py * hh + math.sin(a) * hw),
        (hx + px * hh + math.cos(a) * hw, hy + py * hh + math.sin(a) * hw),
    ]
    d.polygon([(s(qx), s(qy)) for qx, qy in quad],
              fill=(P.IRON_DARK if behind else P.IRON) + (255,))
    if not behind:
        d.line([s(quad[0][0]), s(quad[0][1]), s(quad[1][0]), s(quad[1][1])],
               fill=P.IRON_LIGHT + (255,), width=int(s(1.8)))


def dwarf_frame(pose, phase):
    """pose: 'idle' | 'walk' | 'hammer' | 'jump' | 'fall' | 'drag'. Guarda a destra."""
    img = canvas(DWARF, DWARF)
    d = ImageDraw.Draw(img)
    cx = DWARF / 2 - 2
    ground = 56.0

    step = math.sin(phase * math.pi * 2)
    bob = 0.0
    lean = 0.0
    if pose == "walk":
        bob = -abs(step) * 1.4
    elif pose == "idle":
        bob = math.sin(phase * math.pi * 2) * 0.7
    elif pose == "drag":
        bob = -abs(step) * 1.0
        lean = 2.2
    elif pose == "jump":
        bob = -1.5
    elif pose == "fall":
        bob = 1.0

    hip = ground - 13 + bob
    chest = hip - 9
    head = chest - 8

    # gambe
    if pose in ("jump", "fall"):
        offs = ((-4.5, -2.5), (3.5, 1.5)) if pose == "jump" else ((-4.0, 2.0), (3.5, 3.0))
        for ox, lift in offs:
            d.rounded_rectangle([s(cx + ox - 3.6), s(ground - 9 + lift),
                                 s(cx + ox + 3.6), s(ground - 1 + lift)],
                                radius=s(1.8), fill=P.BOOT + (255,))
    else:
        for i, ox in enumerate((-4.6, 3.4)):
            sw = step * (1 if i == 0 else -1)
            amp = 5.0 if pose in ("walk", "drag") else 0.0
            lift = max(0.0, sw) * (3.4 if pose in ("walk", "drag") else 0.0)
            d.rounded_rectangle([s(cx + ox - 3.6 + sw * amp * 0.5), s(ground - 9 - lift),
                                 s(cx + ox + 3.6 + sw * amp * 0.5), s(ground - lift)],
                                radius=s(1.8), fill=P.BOOT + (255,))

    # martello dietro nelle prime fasi del colpo
    swing = None
    if pose == "hammer":
        swing = [-150, -95, 20, -55][int(phase * 4) % 4]
        if int(phase * 4) % 4 < 2:
            draw_hammer(d, cx + 5 + lean, chest + 3, swing, 1.0, behind=True)

    # corpo
    d.rounded_rectangle([s(cx - 9 + lean * 0.4), s(chest - 1), s(cx + 9 + lean * 0.4), s(hip + 4)],
                        radius=s(4.5), fill=P.TUNIC + (255,))
    d.polygon([(s(cx - 9 + lean * 0.4), s(chest + 3)), (s(cx - 4 + lean * 0.4), s(chest - 1)),
               (s(cx - 4 + lean * 0.4), s(chest + 9))], fill=P.TUNIC_DARK + (255,))
    d.rectangle([s(cx - 9 + lean * 0.4), s(hip), s(cx + 9 + lean * 0.4), s(hip + 3.4)],
                fill=P.BELT + (255,))
    d.rounded_rectangle([s(cx + 1), s(hip - 0.4), s(cx + 5), s(hip + 3.8)],
                        radius=s(1), fill=P.BRASS + (255,))

    # braccio dietro (o che trascina)
    if pose == "drag":
        d.line([s(cx - 6), s(chest + 5), s(cx - 15), s(chest + 11)],
               fill=P.SKIN_DARK + (255,), width=int(s(3.4)))
    arm_y = chest + 5

    # testa: elmo, faccia, barba
    hx = cx + 2 + lean
    d.ellipse([s(hx - 9), s(head - 10), s(hx + 9), s(head + 2)], fill=P.HELMET + (255,))
    d.ellipse([s(hx - 8), s(head - 9.4), s(hx + 5), s(head - 1)], fill=P.HELMET_LIGHT + (255,))
    d.ellipse([s(hx - 7.5), s(head + 1), s(hx + 8), s(head + 11)], fill=P.SKIN + (255,))
    d.rounded_rectangle([s(hx - 10.5), s(head + 0.6), s(hx + 10.5), s(head + 4.0)],
                        radius=s(1.8), fill=P.HELMET_DARK + (255,))
    ellipse(d, hx + 3.4, head + 6.4, 1.3, 1.5, (48, 36, 44))
    d.polygon([(s(hx + 6), s(head + 5.2)), (s(hx + 11), s(head + 7.6)), (s(hx + 6), s(head + 9.4))],
              fill=P.SKIN_DARK + (255,))
    beard = [(hx - 8.4, head + 7.4), (hx + 7.6, head + 7.4), (hx + 5.4, head + 16.5),
             (hx + 1.4, head + 18.2), (hx - 2.6, head + 18.2), (hx - 6.4, head + 16.5)]
    d.polygon([(s(px), s(py)) for px, py in beard], fill=P.BEARD + (255,))
    d.polygon([(s(hx - 8.4), s(head + 7.4)), (s(hx + 7.6), s(head + 7.4)),
               (s(hx + 6.8), s(head + 10.0)), (s(hx - 7.4), s(head + 10.0))],
              fill=P.BEARD_DARK + (150,))
    d.polygon([(s(hx + 5), s(head + 8.6)), (s(hx + 12), s(head + 9.8)), (s(hx + 5), s(head + 11.6))],
              fill=P.BEARD + (255,))

    # mano e martello davanti
    d.ellipse([s(cx + 5 + lean), s(arm_y - 2.6), s(cx + 11 + lean), s(arm_y + 3.4)],
              fill=P.SKIN + (255,))
    if pose == "hammer":
        if int(phase * 4) % 4 >= 2:
            draw_hammer(d, cx + 8 + lean, arm_y, swing, 1.0)
    elif pose == "drag":
        draw_hammer(d, cx + 8 + lean, arm_y, -70, 0.95)
    else:
        draw_hammer(d, cx + 8, arm_y, -34, 0.95)
    return img


def build_dwarf():
    """4 righe da 6: fermo, cammina, martella, in aria + trascina."""
    rows = [
        [("idle", i / 2) for i in range(2)],
        [("walk", i / 6) for i in range(6)],
        [("hammer", i / 4) for i in range(4)],
        [("jump", 0), ("fall", 0), ("drag", 0.0), ("drag", 0.5)],
    ]
    sheet = Image.new("RGBA", (6 * DWARF, 4 * DWARF), (0, 0, 0, 0))
    for r, row in enumerate(rows):
        for c, (pose, ph) in enumerate(row):
            sheet.alpha_composite(down(dwarf_frame(pose, ph), DWARF, DWARF), (c * DWARF, r * DWARF))
    return sheet


# --------------------------------------------------------------------------
# spiritelli
# --------------------------------------------------------------------------
def imp_frame(state, phase):
    img = canvas(IMP, IMP)
    d = ImageDraw.Draw(img)
    a = phase * math.pi * 2
    cx, cy = IMP / 2, IMP / 2 + math.sin(a) * 1.8
    tilt = math.sin(a) * 7 if state == "stunned" else 0.0
    if state == "stunned":
        cy += 3

    r = 10.5 + math.sin(a * 2) * 0.6
    body = []
    for k in range(25):
        t = k / 24
        ang = math.pi * (0.15 + 1.7 * t)
        rr = r * (1.0 + 0.10 * math.sin(t * 6 + a))
        body.append((cx + math.cos(ang) * rr + tilt * 0.4, cy + math.sin(ang) * rr))
    body.append((cx + tilt, cy - r * 1.7))
    d.polygon([(s(px), s(py)) for px, py in body], fill=P.SPRITE + (250,))
    d.ellipse([s(cx - r * 0.6), s(cy - r * 0.5), s(cx + r * 0.1), s(cy + r * 0.4)],
              fill=P.SPRITE_PALE + (140,))

    # alette, così si capisce che vola
    if state != "stunned":
        for sgn in (-1, 1):
            wob = math.sin(a * 3) * 2.2 * sgn
            d.polygon([(s(cx + sgn * 7), s(cy - 2)), (s(cx + sgn * 15), s(cy - 7 + wob)),
                       (s(cx + sgn * 13), s(cy + 2))], fill=P.SPRITE_PALE + (190,))

    if state == "stunned":
        for sx in (-3.6, 3.6):
            ellipse(d, cx + sx + tilt * 0.5, cy - 1, 2.7, 2.7, P.SPRITE_PALE)
            d.arc([s(cx + sx - 2.3 + tilt * 0.5), s(cy - 3.3),
                   s(cx + sx + 2.3 + tilt * 0.5), s(cy + 1.3)], 0, 300,
                  fill=P.SPRITE_EYE + (255,), width=int(s(1.0)))
        for k in range(3):
            ang = a * 2 + k * 2.09
            sx2, sy2 = cx + math.cos(ang) * 10, cy - r - 5 + math.sin(ang) * 3
            for j in range(4):
                jj = math.radians(j * 90 + 45)
                d.line([s(sx2), s(sy2), s(sx2 + math.cos(jj) * 2.8), s(sy2 + math.sin(jj) * 2.8)],
                       fill=P.STUN_STAR + (255,), width=int(s(1.0)))
    else:
        for sx in (-3.4, 3.4):
            ellipse(d, cx + sx, cy - 1.2, 2.6, 3.1, P.SPRITE_EYE)
            ellipse(d, cx + sx + 0.8, cy - 2.3, 0.95, 1.05, (255, 255, 255))
        if state == "alert":
            d.arc([s(cx - 3.6), s(cy + 2), s(cx + 3.6), s(cy + 7)], 200, 340,
                  fill=P.SPRITE_EYE + (255,), width=int(s(1.2)))
    return glow(img, P.SPRITE, s(2.6), alpha=120)


def build_imps():
    rows = ["float", "stunned", "alert"]
    sheet = Image.new("RGBA", (4 * IMP, len(rows) * IMP), (0, 0, 0, 0))
    for r, state in enumerate(rows):
        for i in range(4):
            sheet.alpha_composite(down(imp_frame(state, i / 4), IMP, IMP), (i * IMP, r * IMP))
    return sheet


# --------------------------------------------------------------------------
# macchinario inscatolatore
# --------------------------------------------------------------------------
def machine_frame(phase):
    W, Hh = 128, 128
    img = canvas(W, Hh)
    d = ImageDraw.Draw(img)
    shake = math.sin(phase * math.pi * 6) * (1.6 if phase > 0 else 0)

    d.rounded_rectangle([s(20 + shake), s(24), s(W - 8 + shake), s(Hh - 4)], radius=s(8),
                        fill=P.MACHINE + (255,))
    d.rounded_rectangle([s(20 + shake), s(24), s(W - 8 + shake), s(42)], radius=s(7),
                        fill=P.MACHINE_LIGHT + (255,))
    d.rounded_rectangle([s(20 + shake), s(Hh - 20), s(W - 8 + shake), s(Hh - 4)], radius=s(5),
                        fill=P.MACHINE_DARK + (255,))

    # imbuto d'ingresso, in basso a sinistra: si consegna da lì
    d.polygon([(s(0), s(74)), (s(30), s(62)), (s(30), s(116)), (s(0), s(112))],
              fill=P.BRASS + (255,))
    d.polygon([(s(5), s(78)), (s(27), s(68)), (s(27), s(110)), (s(5), s(107))],
              fill=(38, 44, 58) + (255,))
    d.line([s(2), s(74), s(2), s(112)], fill=P.BRASS_LIGHT + (255,), width=int(s(2.4)))

    # oblò
    d.ellipse([s(52 + shake), s(52), s(92 + shake), s(92)], fill=P.MACHINE_DARK + (255,))
    d.ellipse([s(56 + shake), s(56), s(88 + shake), s(88)],
              fill=P.GLASS + (255 if phase > 0 else 210,))
    if phase > 0:
        for k in range(3):
            ang = phase * 12 + k * 2.09
            ellipse(d, 72 + shake + math.cos(ang) * 9, 72 + math.sin(ang) * 9, 2.6, 2.6, P.SPRITE)
    else:
        ellipse(d, 66 + shake, 64, 5, 4, (255, 255, 255), 150)

    # camino e spie
    d.rounded_rectangle([s(96), s(6), s(116), s(28)], radius=s(4), fill=P.BRASS + (255,))
    d.rounded_rectangle([s(100), s(2), s(112), s(12)], radius=s(3), fill=P.BRASS_LIGHT + (255,))
    for k in range(3):
        on = phase > 0 and k == int(phase * 3) % 3
        ellipse(d, 38 + k * 11, 106, 3.6, 3.6, P.BRASS_LIGHT if on else P.MACHINE_DARK)
    # scivolo di uscita
    d.polygon([(s(W - 30), s(Hh - 34)), (s(W - 2), s(Hh - 34)), (s(W - 2), s(Hh - 10)),
               (s(W - 26), s(Hh - 10))], fill=P.BRASS + (255,))
    return img


def build_machine():
    sheet = Image.new("RGBA", (3 * 128, 128), (0, 0, 0, 0))
    for i, ph in enumerate((0.0, 0.35, 0.7)):
        sheet.alpha_composite(down(machine_frame(ph), 128, 128), (i * 128, 0))
    return sheet


def build_crate():
    size = 32
    img = canvas(size, size)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([s(3), s(6), s(29), s(29)], radius=s(2), fill=P.CRATE + (255,))
    d.rounded_rectangle([s(3), s(6), s(29), s(11)], radius=s(2), fill=P.CRATE_LIGHT + (255,))
    for x in (3, 15, 27):
        d.line([s(x), s(6), s(x), s(29)], fill=P.CRATE_DARK + (255,), width=int(s(1.4)))
    d.line([s(3), s(18), s(29), s(18)], fill=P.CRATE_DARK + (255,), width=int(s(1.4)))
    d.line([s(4), s(8), s(28), s(27)], fill=P.CRATE_LIGHT + (170,), width=int(s(1.2)))
    return down(img, size, size)


# --------------------------------------------------------------------------
# portale
# --------------------------------------------------------------------------
def portal_frame(phase):
    W, Hh = 96, 128
    img = canvas(W, Hh)
    d = ImageDraw.Draw(img)
    cx, cy = W / 2, Hh / 2
    a = phase * math.pi * 2
    for i in range(5):
        t = i / 4
        rw, rh = 36 - t * 10, 58 - t * 15
        col = lerp(P.PORTAL_DEEP, P.PORTAL_PALE, t)
        d.ellipse([s(cx - rw), s(cy - rh), s(cx + rw), s(cy + rh)],
                  fill=col + (int(140 + 100 * t),))
    pts = []
    for k in range(46):
        t = k / 45
        ang = a + t * 7.5
        rr = 6 + t * 26
        pts.append((s(cx + math.cos(ang) * rr), s(cy + math.sin(ang) * rr * 1.5)))
    d.line(pts, fill=P.PORTAL_PALE + (235,), width=int(s(2.4)), joint="curve")
    ellipse(d, cx, cy, 7, 10, P.PORTAL_PALE)
    return glow(img, P.PORTAL, s(6), alpha=190)


def build_portal():
    sheet = Image.new("RGBA", (4 * 96, 128), (0, 0, 0, 0))
    for i in range(4):
        sheet.alpha_composite(down(portal_frame(i / 4), 96, 128), (i * 96, 0))
    return sheet


# --------------------------------------------------------------------------
# icone e logo
# --------------------------------------------------------------------------
def build_icons():
    """cuore pieno, cuore vuoto, cassa, martello."""
    size = 32
    sheet = Image.new("RGBA", (4 * size, size), (0, 0, 0, 0))
    for i, full in enumerate((True, False)):
        img = canvas(size, size)
        d = ImageDraw.Draw(img)
        col = P.HEART if full else P.HEART_DARK
        d.polygon([(s(16), s(27)), (s(4), s(15)), (s(4), s(10)), (s(9), s(6)), (s(16), s(11)),
                   (s(23), s(6)), (s(28), s(10)), (s(28), s(15))], fill=col + (255,))
        if full:
            d.ellipse([s(9), s(9), s(14), s(14)], fill=(255, 210, 210, 200))
        sheet.alpha_composite(down(img, size, size), (i * size, 0))
    sheet.alpha_composite(build_crate().resize((size, size), Image.LANCZOS), (2 * size, 0))
    ham = canvas(size, size)
    draw_hammer(ImageDraw.Draw(ham), 8, 24, -40, 0.85)
    sheet.alpha_composite(down(ham, size, size), (3 * size, 0))
    return sheet


def find_font(paths, size):
    for p in paths:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def build_logo():
    W, Hh = 760, 200
    img = canvas(W, Hh)
    d = ImageDraw.Draw(img)
    big = find_font(["/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
                     "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"], int(s(60)))
    small = find_font(["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                       "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"], int(s(21)))
    for i, line in enumerate(("MARTELLO", "& SCATOLE")):
        box = d.textbbox((0, 0), line, font=big, stroke_width=int(s(6)))
        x = (s(W) - (box[2] - box[0])) / 2 - box[0]
        d.text((x, s(12 + i * 64)), line, font=big,
               fill=(P.HELMET_LIGHT if i == 0 else P.BRASS_LIGHT) + (255,),
               stroke_width=int(s(6)), stroke_fill=(126, 60, 30, 255))
    sub = "gli spiritelli non si prendono a mani nude"
    box = d.textbbox((0, 0), sub, font=small)
    d.text(((s(W) - (box[2] - box[0])) / 2 - box[0], s(154)), sub, font=small,
           fill=(255, 255, 255, 245), stroke_width=int(s(2.4)), stroke_fill=(126, 60, 30, 220))
    return down(img, W, Hh)


def build_favicon():
    return down(dwarf_frame("hammer", 0.5), 64, 64)


# --------------------------------------------------------------------------
def main():
    os.makedirs(ASSETS, exist_ok=True)
    print("Generazione asset di Martello & Scatole...")
    save(build_backdrop(), "backdrop.png")
    save(build_tiles(), "tiles.png")
    save(build_dwarf(), "dwarf.png")
    save(build_imps(), "imps.png")
    save(build_machine(), "machine.png")
    save(build_crate(), "crate.png")
    save(build_portal(), "portal.png")
    save(build_icons(), "icons.png")
    save(build_logo(), "logo.png")
    save(build_favicon(), "favicon.png")
    print("Fatto.")


if __name__ == "__main__":
    main()
