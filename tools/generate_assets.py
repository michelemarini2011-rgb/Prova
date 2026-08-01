#!/usr/bin/env python3
"""
Genera tutti gli asset grafici di Martello & Scatole.

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

TILE = 32          # lato di una cella dell'arena
DWARF = 64         # fotogramma del nano
IMP = 48           # fotogramma dello spiritello
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


def save(img, name):
    img.save(os.path.join(ASSETS, name))
    print(f"  {name:16s} {img.size[0]:4d}x{img.size[1]:<4d}")


def ellipse(d, cx, cy, rx, ry, fill):
    d.ellipse([s(cx - rx), s(cy - ry), s(cx + rx), s(cy + ry)], fill=fill + (255,))


# --------------------------------------------------------------------------
# pavimento, muri, sassi
# --------------------------------------------------------------------------
def floor_tile(variant):
    img = canvas(TILE, TILE)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, s(TILE), s(TILE)], fill=P.FLOOR + (255,))
    rnd = random.Random(400 + variant)
    # lastre di pietra
    for _ in range(3):
        x0, y0 = rnd.uniform(1, 20), rnd.uniform(1, 20)
        w, h = rnd.uniform(8, 14), rnd.uniform(7, 12)
        col = lerp(P.FLOOR, P.FLOOR_LIGHT if rnd.random() < 0.5 else P.FLOOR_DARK, 0.5)
        d.rounded_rectangle([s(x0), s(y0), s(x0 + w), s(y0 + h)], radius=s(2), fill=col + (255,))
    for _ in range(4):
        x0, y0 = rnd.uniform(2, 28), rnd.uniform(2, 28)
        d.line([s(x0), s(y0), s(x0 + rnd.uniform(-6, 6)), s(y0 + rnd.uniform(-6, 6))],
               fill=P.CRACK + (170,), width=int(s(0.8)))
    for _ in range(10):
        x0, y0 = rnd.uniform(0, TILE), rnd.uniform(0, TILE)
        r = rnd.uniform(0.4, 1.1)
        ellipse(d, x0, y0, r, r, lerp(P.FLOOR, P.FLOOR_DARK, 0.6))
    return img


def wall_tile(mask):
    """mask: 1 sopra, 2 destra, 4 sotto, 8 sinistra (1 = c'è muro)."""
    n, e, s_, w = mask & 1, mask & 2, mask & 4, mask & 8
    img = canvas(TILE, TILE)
    d = ImageDraw.Draw(img)
    face_h = 0 if s_ else 11          # la parete si vede solo dove sotto c'è pavimento
    top_h = TILE - face_h

    corners = (not n and not w, not n and not e, False, False)
    d.rounded_rectangle([0, 0, s(TILE), s(top_h)], radius=s(5),
                        fill=P.WALL_TOP + (255,), corners=corners)
    d.rounded_rectangle([0, 0, s(TILE), s(3.5)], radius=s(2),
                        fill=P.WALL_TOP_LIGHT + (200,), corners=(corners[0], corners[1], False, False))
    rnd = random.Random(900 + mask)
    for _ in range(7):
        x0, y0 = rnd.uniform(2, TILE - 3), rnd.uniform(3, max(4, top_h - 3))
        r = rnd.uniform(0.7, 1.9)
        ellipse(d, x0, y0, r, r, lerp(P.WALL_TOP, P.WALL_FACE, 0.45))
    if face_h:
        d.rectangle([0, s(top_h), s(TILE), s(TILE)], fill=P.WALL_FACE + (255,))
        d.rectangle([0, s(top_h), s(TILE), s(top_h + 2)], fill=P.WALL_FACE_DARK + (255,))
        for k in range(2):
            x = 6 + k * 14 + (mask % 3)
            d.line([s(x), s(top_h + 3), s(x), s(TILE - 1)], fill=P.WALL_FACE_DARK + (160,),
                   width=int(s(1.2)))
    return img


def rock_tile():
    img = canvas(TILE, TILE)
    d = ImageDraw.Draw(img)
    d.polygon([(s(4), s(28)), (s(6), s(14)), (s(14), s(6)), (s(25), s(9)),
               (s(29), s(20)), (s(26), s(29))], fill=P.ROCK + (255,))
    d.polygon([(s(6), s(14)), (s(14), s(6)), (s(25), s(9)), (s(17), s(17))],
              fill=lerp(P.ROCK, (255, 255, 255), 0.14) + (255,))
    d.polygon([(s(4), s(28)), (s(17), s(17)), (s(26), s(29))], fill=P.ROCK_DARK + (255,))
    return img


def rubble_tile():
    img = canvas(TILE, TILE)
    d = ImageDraw.Draw(img)
    rnd = random.Random(77)
    for _ in range(7):
        x, y = rnd.uniform(6, 26), rnd.uniform(16, 27)
        r = rnd.uniform(1.5, 3.4)
        ellipse(d, x, y, r, r * 0.8, P.ROCK_DARK if rnd.random() < 0.5 else P.ROCK)
    return img


def build_tiles():
    """8x3: 16 raccordi di muro, 4 pavimenti, sasso e detriti."""
    sheet = Image.new("RGBA", (8 * TILE, 3 * TILE), (0, 0, 0, 0))
    for mask in range(16):
        sheet.alpha_composite(down(wall_tile(mask), TILE, TILE),
                              ((mask % 8) * TILE, (mask // 8) * TILE))
    for i in range(4):
        sheet.alpha_composite(down(floor_tile(i), TILE, TILE), (i * TILE, 2 * TILE))
    sheet.alpha_composite(down(rock_tile(), TILE, TILE), (4 * TILE, 2 * TILE))
    sheet.alpha_composite(down(rubble_tile(), TILE, TILE), (5 * TILE, 2 * TILE))
    return sheet


# --------------------------------------------------------------------------
# il nano con il martello
# --------------------------------------------------------------------------
def draw_hammer(d, x, y, angle, scale=1.0, behind=False):
    """Martello con manico: `angle` in gradi, 0 = orizzontale verso destra."""
    a = math.radians(angle)
    ln = 20 * scale
    hx, hy = x + math.cos(a) * ln, y + math.sin(a) * ln
    d.line([s(x), s(y), s(hx), s(hy)],
           fill=(P.HANDLE_DARK if behind else P.HANDLE) + (255,), width=int(s(3.4 * scale)))
    # testa del martello, perpendicolare al manico
    px, py = -math.sin(a), math.cos(a)
    hw, hh = 5.2 * scale, 7.0 * scale
    quad = [
        (hx + px * hh - math.cos(a) * hw, hy + py * hh - math.sin(a) * hw),
        (hx - px * hh - math.cos(a) * hw, hy - py * hh - math.sin(a) * hw),
        (hx - px * hh + math.cos(a) * hw, hy - py * hh + math.sin(a) * hw),
        (hx + px * hh + math.cos(a) * hw, hy + py * hh + math.sin(a) * hw),
    ]
    iron = P.IRON_DARK if behind else P.IRON
    d.polygon([(s(qx), s(qy)) for qx, qy in quad], fill=iron + (255,))
    if not behind:
        d.line([s(quad[0][0]), s(quad[0][1]), s(quad[1][0]), s(quad[1][1])],
               fill=P.IRON_LIGHT + (255,), width=int(s(1.6)))
    return hx, hy


def dwarf_frame(facing, action, phase):
    """facing: 'down' | 'side' | 'up'.  action: 'walk' | 'hammer'."""
    img = canvas(DWARF, DWARF)
    d = ImageDraw.Draw(img)
    cx = DWARF / 2
    ground = 54.0

    step = math.sin(phase * math.pi * 2)
    bob = -abs(step) * 1.2 if action == "walk" else 0.0
    hip = ground - 12 + bob
    chest = hip - 9
    head = chest - 8

    # ombra
    d.ellipse([s(cx - 11), s(ground - 3.5), s(cx + 11), s(ground + 3.5)], fill=(0, 0, 0, 70))

    # martello dietro alla schiena nelle pose alte
    swing = 0.0
    if action == "hammer":
        # 0: alzato  1: sopra la testa  2: impatto  3: risalita
        swing = [-115, -60, 28, -35][int(phase * 4) % 4]

    side = 1 if facing != "up" else -1
    if action == "hammer" and facing == "up" and int(phase * 4) % 4 < 2:
        draw_hammer(d, cx + 6, chest + 1, swing * side - 90, 1.0, behind=True)

    # stivali
    for i, ox in enumerate((-5.2, 4.2)):
        sw = step * (1 if i == 0 else -1)
        off = sw * (4.0 if action == "walk" else 0)
        lift = max(0.0, sw) * (3.0 if action == "walk" else 0)
        d.rounded_rectangle([s(cx + ox - 3.4 + off * 0.5), s(ground - 8 - lift),
                             s(cx + ox + 3.4 + off * 0.5), s(ground - lift)],
                            radius=s(1.6), fill=P.BOOT + (255,))

    # corpo
    d.rounded_rectangle([s(cx - 10), s(chest - 1), s(cx + 10), s(hip + 3)],
                        radius=s(4.5), fill=P.TUNIC + (255,))
    d.rectangle([s(cx - 10), s(hip - 1), s(cx + 10), s(hip + 2.4)], fill=P.BELT + (255,))
    d.rounded_rectangle([s(cx - 2.2), s(hip - 1.4), s(cx + 2.2), s(hip + 2.8)],
                        radius=s(1), fill=P.BRASS + (255,))
    d.polygon([(s(cx - 10), s(chest + 4)), (s(cx - 6), s(chest - 1)), (s(cx - 6), s(chest + 8))],
              fill=P.TUNIC_DARK + (255,))

    # braccia
    arm_y = chest + 4
    d.ellipse([s(cx - 13), s(arm_y - 2.4), s(cx - 7.4), s(arm_y + 3.2)], fill=P.SKIN + (255,))
    d.ellipse([s(cx + 7.4), s(arm_y - 2.4), s(cx + 13), s(arm_y + 3.2)], fill=P.SKIN + (255,))

    # testa: elmo, falda, faccia, barba (in quest'ordine, così la faccia resta libera)
    if facing == "up":
        d.ellipse([s(cx - 9), s(head + 1), s(cx + 9), s(head + 15)], fill=P.BEARD_DARK + (255,))
        d.ellipse([s(cx - 10), s(head - 10), s(cx + 10), s(head + 2)], fill=P.HELMET + (255,))
        d.ellipse([s(cx - 10), s(head - 10), s(cx + 10), s(head - 2)], fill=P.HELMET_DARK + (255,))
        d.rounded_rectangle([s(cx - 11.5), s(head + 0.5), s(cx + 11.5), s(head + 4.2)],
                            radius=s(1.8), fill=P.HELMET_DARK + (255,))
    else:
        offx = 2.4 if facing == "side" else 0.0
        # calotta dell'elmo
        d.ellipse([s(cx - 10), s(head - 10), s(cx + 10), s(head + 2)], fill=P.HELMET + (255,))
        d.ellipse([s(cx - 9), s(head - 9.4), s(cx + 7), s(head - 1)], fill=P.HELMET_LIGHT + (255,))
        # faccia
        d.ellipse([s(cx - 8 + offx * 0.4), s(head + 1), s(cx + 8 + offx * 0.4), s(head + 11)],
                  fill=P.SKIN + (255,))
        # falda, sopra la fronte ma non sugli occhi
        d.rounded_rectangle([s(cx - 11.5), s(head + 0.6), s(cx + 11.5), s(head + 4.0)],
                            radius=s(1.8), fill=P.HELMET_DARK + (255,))
        # occhi e naso
        eyes = [(cx + offx + 2.4, head + 6.4)] if facing == "side" else \
               [(cx - 3.2, head + 6.2), (cx + 3.2, head + 6.2)]
        for ex, ey in eyes:
            ellipse(d, ex, ey, 1.2, 1.4, (40, 34, 40))
        if facing == "side":
            d.polygon([(s(cx + 6.5), s(head + 5.4)), (s(cx + 11), s(head + 7.6)),
                       (s(cx + 6.5), s(head + 9.2))], fill=P.SKIN_DARK + (255,))
        else:
            ellipse(d, cx, head + 8.2, 1.9, 2.2, P.SKIN_DARK)
        # barba, che parte sotto la faccia
        beard = [(cx - 8.6 + offx * 0.3, head + 7.5), (cx + 8.6 + offx * 0.3, head + 7.5),
                 (cx + 6.0 + offx * 0.3, head + 16.5), (cx + 2.0, head + 18.0),
                 (cx - 2.0, head + 18.0), (cx - 6.0 + offx * 0.3, head + 16.5)]
        d.polygon([(s(px), s(py)) for px, py in beard], fill=P.BEARD + (255,))
        d.polygon([(s(cx - 8.6 + offx * 0.3), s(head + 7.5)), (s(cx + 8.6 + offx * 0.3), s(head + 7.5)),
                   (s(cx + 7.4 + offx * 0.3), s(head + 10.0)), (s(cx - 7.4 + offx * 0.3), s(head + 10.0))],
                  fill=P.BEARD_DARK + (150,))
        if facing == "side":
            # baffi in fuori, per rendere evidente da che parte guarda
            d.polygon([(s(cx + 5), s(head + 8.4)), (s(cx + 12), s(head + 9.6)),
                       (s(cx + 5), s(head + 11.4))], fill=P.BEARD + (255,))

    # martello davanti
    if action == "hammer":
        if facing == "side":
            draw_hammer(d, cx + 9, arm_y, swing, 1.0)
        elif facing == "down":
            draw_hammer(d, cx + 9, arm_y, swing * 0.6 + 20, 1.0)
        elif int(phase * 4) % 4 >= 2:
            draw_hammer(d, cx + 7, arm_y - 2, -70, 0.95)
    else:
        rest = -28 if facing != "up" else -150
        draw_hammer(d, cx + 9.5, arm_y, rest, 0.95, behind=(facing == "up"))

    return img


def build_dwarf():
    rows = [("down", "walk"), ("side", "walk"), ("up", "walk"),
            ("down", "hammer"), ("side", "hammer"), ("up", "hammer")]
    sheet = Image.new("RGBA", (4 * DWARF, len(rows) * DWARF), (0, 0, 0, 0))
    for r, (facing, action) in enumerate(rows):
        for i in range(4):
            f = down(dwarf_frame(facing, action, i / 4), DWARF, DWARF)
            sheet.alpha_composite(f, (i * DWARF, r * DWARF))
    return sheet


# --------------------------------------------------------------------------
# spiritelli
# --------------------------------------------------------------------------
def imp_frame(state, phase):
    img = canvas(IMP, IMP)
    d = ImageDraw.Draw(img)
    a = phase * math.pi * 2
    cx, cy = IMP / 2, IMP / 2 + math.sin(a) * 1.8

    d.ellipse([s(cx - 8), s(IMP - 8), s(cx + 8), s(IMP - 3)], fill=(0, 0, 0, 55))

    tilt = 0.0
    if state == "stunned":
        tilt = math.sin(a) * 7
        cy += 3

    # corpo a fiammella
    r = 10.0 + math.sin(a * 2) * 0.6
    body = []
    for k in range(25):
        t = k / 24
        ang = math.pi * (0.15 + 1.7 * t)
        rr = r * (1.0 + 0.10 * math.sin(t * 6 + a))
        body.append((cx + math.cos(ang) * rr + tilt * 0.4, cy + math.sin(ang) * rr))
    body.append((cx + tilt, cy - r * 1.75))
    d.polygon([(s(px), s(py)) for px, py in body], fill=P.SPRITE + (245,))
    d.ellipse([s(cx - r * 0.55), s(cy - r * 0.5), s(cx + r * 0.15), s(cy + r * 0.35)],
              fill=P.SPRITE_PALE + (150,))

    if state == "stunned":
        # occhi a spirale e stelline
        for sx in (-3.6, 3.6):
            ellipse(d, cx + sx + tilt * 0.5, cy - 1, 2.6, 2.6, P.SPRITE_PALE)
            d.arc([s(cx + sx - 2.2 + tilt * 0.5), s(cy - 3.2),
                   s(cx + sx + 2.2 + tilt * 0.5), s(cy + 1.2)], 0, 300,
                  fill=P.SPRITE_EYE + (255,), width=int(s(0.9)))
        for k in range(3):
            ang = a * 2 + k * 2.09
            sx2, sy2 = cx + math.cos(ang) * 10, cy - r - 4 + math.sin(ang) * 3
            for j in range(4):
                jj = math.radians(j * 90 + 45)
                d.line([s(sx2), s(sy2), s(sx2 + math.cos(jj) * 2.6), s(sy2 + math.sin(jj) * 2.6)],
                       fill=P.STUN_STAR + (255,), width=int(s(0.9)))
    else:
        for sx in (-3.4, 3.4):
            ellipse(d, cx + sx, cy - 1.2, 2.5, 3.0, P.SPRITE_EYE)
            ellipse(d, cx + sx + 0.7, cy - 2.2, 0.9, 1.0, (255, 255, 255))
        if state == "alert":
            d.arc([s(cx - 3.5), s(cy + 2), s(cx + 3.5), s(cy + 7)], 200, 340,
                  fill=P.SPRITE_EYE + (255,), width=int(s(1.1)))

    return glow(img, P.SPRITE, s(3.2), alpha=150)


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

    d.ellipse([s(10), s(Hh - 18), s(W - 6), s(Hh - 2)], fill=(0, 0, 0, 70))
    # corpo
    d.rounded_rectangle([s(18 + shake), s(28), s(W - 10 + shake), s(Hh - 8)], radius=s(7),
                        fill=P.MACHINE + (255,))
    d.rounded_rectangle([s(18 + shake), s(28), s(W - 10 + shake), s(44)], radius=s(6),
                        fill=P.MACHINE_LIGHT + (255,))
    # imbuto d'ingresso a sinistra
    d.polygon([(s(2), s(56)), (s(28), s(44)), (s(28), s(92)), (s(2), s(80))],
              fill=P.MACHINE_DARK + (255,))
    d.polygon([(s(6), s(58)), (s(26), s(49)), (s(26), s(87)), (s(6), s(78))],
              fill=(24, 26, 34) + (255,))
    # oblò
    glass_a = 235 if phase > 0 else 150
    d.ellipse([s(48 + shake), s(56), s(84 + shake), s(92)], fill=P.MACHINE_DARK + (255,))
    d.ellipse([s(52 + shake), s(60), s(80 + shake), s(88)], fill=P.GLASS + (glass_a,))
    if phase > 0:
        for k in range(3):
            ang = phase * 12 + k * 2.09
            ellipse(d, 66 + shake + math.cos(ang) * 8, 74 + math.sin(ang) * 8, 2.4, 2.4, P.SPRITE)
    # camino e valvole
    d.rounded_rectangle([s(92), s(10), s(112), s(30)], radius=s(4), fill=P.BRASS + (255,))
    d.rounded_rectangle([s(96), s(6), s(108), s(14)], radius=s(3), fill=P.BRASS_LIGHT + (255,))
    for k in range(3):
        ellipse(d, 34 + k * 10, 106, 3.4, 3.4, P.BRASS if (phase == 0 or k != int(phase * 3) % 3)
                else P.BRASS_LIGHT)
    # scivolo di uscita in basso a destra
    d.polygon([(s(W - 34), s(Hh - 26)), (s(W - 2), s(Hh - 26)), (s(W - 2), s(Hh - 6)),
               (s(W - 30), s(Hh - 6))], fill=P.MACHINE_DARK + (255,))
    if phase > 0:
        img = glow(img, P.GLASS, s(3), alpha=90)
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
    d.line([s(4), s(8), s(28), s(27)], fill=P.CRATE_LIGHT + (160,), width=int(s(1.2)))
    return down(img, size, size)


# --------------------------------------------------------------------------
# portale
# --------------------------------------------------------------------------
def portal_frame(phase):
    W, Hh = 96, 96
    img = canvas(W, Hh)
    d = ImageDraw.Draw(img)
    cx, cy = W / 2, Hh / 2
    a = phase * math.pi * 2
    for i in range(5):
        t = i / 4
        rr = 34 - t * 9
        col = lerp(P.PORTAL_DEEP, P.PORTAL_PALE, t)
        d.ellipse([s(cx - rr), s(cy - rr * 1.18), s(cx + rr), s(cy + rr * 1.18)],
                  fill=col + (int(120 + 110 * t),))
    # spirale
    pts = []
    for k in range(46):
        t = k / 45
        ang = a + t * 7.5
        rr = 6 + t * 26
        pts.append((s(cx + math.cos(ang) * rr), s(cy + math.sin(ang) * rr * 1.15)))
    d.line(pts, fill=P.PORTAL_PALE + (220,), width=int(s(2.2)), joint="curve")
    ellipse(d, cx, cy, 7, 8, P.PORTAL_PALE)
    return glow(img, P.PORTAL, s(6), alpha=190)


def build_portal():
    sheet = Image.new("RGBA", (4 * 96, 96), (0, 0, 0, 0))
    for i in range(4):
        sheet.alpha_composite(down(portal_frame(i / 4), 96, 96), (i * 96, 0))
    return sheet


# --------------------------------------------------------------------------
# icone e logo
# --------------------------------------------------------------------------
def build_icons():
    """cuore pieno, cuore vuoto, cassa piccola, torcia."""
    size = 32
    sheet = Image.new("RGBA", (4 * size, size), (0, 0, 0, 0))

    for i, full in enumerate((True, False)):
        img = canvas(size, size)
        d = ImageDraw.Draw(img)
        col = P.HEART if full else P.HEART_DARK
        d.polygon([(s(16), s(27)), (s(4), s(15)), (s(4), s(10)), (s(9), s(6)), (s(16), s(11)),
                   (s(23), s(6)), (s(28), s(10)), (s(28), s(15))], fill=col + (255,))
        if full:
            d.ellipse([s(9), s(9), s(14), s(14)], fill=(255, 190, 190, 190))
        sheet.alpha_composite(down(img, size, size), (i * size, 0))

    sheet.alpha_composite(build_crate().resize((size, size), Image.LANCZOS), (2 * size, 0))

    torch = canvas(size, size)
    d = ImageDraw.Draw(torch)
    d.line([s(16), s(30), s(16), s(14)], fill=P.HANDLE + (255,), width=int(s(3)))
    d.polygon([(s(16), s(3)), (s(21), s(13)), (s(16), s(18)), (s(11), s(13))], fill=P.TORCH + (255,))
    d.polygon([(s(16), s(7)), (s(19), s(13)), (s(16), s(16)), (s(13), s(13))],
              fill=P.TORCH_PALE + (255,))
    sheet.alpha_composite(down(glow(torch, P.TORCH, s(3), alpha=170), size, size), (3 * size, 0))
    return sheet


def find_font(paths, size):
    for p in paths:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def build_logo():
    W, Hh = 760, 210
    img = canvas(W, Hh)
    d = ImageDraw.Draw(img)
    big = find_font(["/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
                     "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"], int(s(62)))
    small = find_font(["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                       "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"], int(s(21)))

    for i, line in enumerate(("MARTELLO", "& SCATOLE")):
        box = d.textbbox((0, 0), line, font=big, stroke_width=int(s(5)))
        x = (s(W) - (box[2] - box[0])) / 2 - box[0]
        d.text((x, s(16 + i * 66)), line, font=big,
               fill=(P.HELMET_LIGHT if i == 0 else P.BRASS) + (255,),
               stroke_width=int(s(5)), stroke_fill=(26, 22, 32, 255))
    sub = "gli spiritelli non si prendono a mani nude"
    box = d.textbbox((0, 0), sub, font=small)
    d.text(((s(W) - (box[2] - box[0])) / 2 - box[0], s(160)), sub, font=small,
           fill=P.SPRITE + (235,))
    img = glow(img, P.TORCH, s(7), alpha=105)
    return down(img, W, Hh)


def build_favicon():
    return down(dwarf_frame("down", "hammer", 0.5), 64, 64)


# --------------------------------------------------------------------------
def main():
    os.makedirs(ASSETS, exist_ok=True)
    print("Generazione asset di Martello & Scatole...")
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
