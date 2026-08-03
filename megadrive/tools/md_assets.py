#!/usr/bin/env python3
"""Converte la grafica del gioco HTML nei disegni e nelle tavolozze del VDP.

Gli originali sono PNG a colori pieni pensati per celle da 32 pixel; il Mega
Drive lavora con disegni da 8x8 a 16 colori, quattro tavolozze da 9 bit in
tutto. Qui si dimezza ogni immagine (la cella del mondo diventa 16 pixel), si
riducono i colori alla griglia del VDP e si impacchettano i disegni a 4 bit.

    python3 tools/md_assets.py            (serve Pillow)

Produce res/gfx.c e res/gfx.h, più delle anteprime in build/preview per
controllare a occhio come sono venute le tavolozze.
"""
import json
import os
import sys
from collections import Counter

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PNG = os.path.join(HERE, "png")
RES = os.path.join(ROOT, "res")
PREVIEW = os.path.join(ROOT, "build", "preview")

# Gli otto livelli per componente del VDP (3 bit) riportati a 8 bit.
LEVELS = [i * 255 // 7 for i in range(8)]

# Ogni immagine finisce in una delle quattro tavolozze. Il peso dice quanti
# colori le tocca contendere: senza, un'icona di 16 pixel non avrebbe voce in
# capitolo contro un foglio di disegni e finirebbe del colore sbagliato.
GROUPS = {
    # Il terreno riempie mezzo schermo e i suoi ciottoli sono sfumature molto
    # vicine: se gli restano pochi bruni diventano puntini di un altro colore e
    # la terra sembra sporca. Stesso discorso per il cielo, che è una sfumatura
    # lunga: con pochi azzurri si vede a fasce. Il logo, che di suo è oro su
    # bruno scuro, sta bene nella tavolozza del nano.
    0: [("tiles", 9), ("movplat", 2), ("crate", 1)],     # terra, erba, assi
    1: [("dwarf", 5), ("icons", 2), ("font", 1), ("logo", 2)],
    2: [("imps", 4), ("portal", 2), ("hazard", 2)],      # spiritelli e punte
    3: [("backdrop", 7), ("machine", 3)],                # cielo e macchinario
}
SAMPLES = 12000          # campioni per unità di peso, per il median cut

FONT_CHARS = ([chr(c) for c in range(32, 127)] +
              ["à", "è", "é", "ì", "ò", "ù"])


# --------------------------------------------------------------- immagini
def load(name):
    return Image.open(os.path.join(PNG, name + ".png")).convert("RGBA")


def half(img, size=None, filt=Image.LANCZOS):
    """Riduce a metà (o alla misura data) tenendo pulito il canale alfa."""
    if size is None:
        size = (img.width // 2, img.height // 2)
    out = img.resize(size, filt)
    r, g, b, a = out.split()
    a = a.point(lambda v: 255 if v >= 128 else 0)
    return Image.merge("RGBA", (r, g, b, a))


def posterize(img):
    """Porta i colori sulla griglia a 3 bit per componente del VDP."""
    lut = bytes(LEVELS[min(7, (v * 8) // 256)] for v in range(256))
    r, g, b, a = img.split()
    return Image.merge("RGBA", (r.point(lut), g.point(lut), b.point(lut), a))


# Scala di bruni per l'asse mobile: nell'originale è d'acciaio azzurrino, ma
# fra i quindici colori del mondo (verdi ed marroni) il grigio non ci sta e
# verrebbe fuori rosa. Rifatta di legno sta insieme alle assi fisse.
WOOD = [(72, 36, 0), (109, 72, 36), (145, 72, 36), (182, 109, 72),
        (218, 145, 72), (255, 182, 109), (255, 218, 145), (255, 236, 200)]


def wooden(img):
    out = img.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a < 128:
                continue
            lum = (r * 77 + g * 151 + b * 28) >> 8
            px[x, y] = WOOD[min(7, lum * 8 // 256)] + (255,)
    return out


def render_font():
    """Un carattere fisso da 8x8: una cella per lettera, come vuole il VDP.

    Le lettere sono bianche su fondo nero pieno, non trasparente: le celle di
    un piano ne contengono una sola, quindi una scritta sopra una fascia scura
    ne prenderebbe il posto e si leggerebbe il cielo attraverso le lettere."""
    face = ImageFont.truetype(
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", 9)
    img = Image.new("RGBA", (8 * len(FONT_CHARS), 8), (0, 0, 0, 255))
    for i, ch in enumerate(FONT_CHARS):
        mask = Image.new("L", (8, 8), 0)
        ImageDraw.Draw(mask).text((0, -1), ch, fill=255, font=face)
        mask = mask.point(lambda v: 255 if v > 100 else 0)
        cell = Image.new("RGBA", (8, 8), (0, 0, 0, 255))
        cell.paste(Image.new("RGBA", (8, 8), (255, 255, 255, 255)), (0, 0), mask)
        img.paste(cell, (i * 8, 0))
    return img


# ------------------------------------------------------------- tavolozze
def build_palette(weighted, reserved=()):
    """Median cut sui pixel del gruppo, poi i colori si posano sulla griglia a
    9 bit. Ogni immagine porta un numero di campioni pari al suo peso, così le
    più piccole non spariscono. I colori riservati restano in testa."""
    pixels = []
    for img, weight in weighted:
        own = [(r, g, b) for (r, g, b, a) in img.getdata() if a >= 128]
        if not own:
            continue
        want = weight * SAMPLES
        while len(own) < want:
            own = own + own
        step = max(1, len(own) // want)
        pixels.extend(own[::step][:want])
    if not pixels:
        return list(reserved)

    want = 15 - len(reserved)
    counts = Counter(pixels)
    uniq = list(counts.keys())
    if len(uniq) <= want:
        chosen = uniq
    else:
        strip = Image.new("RGB", (len(pixels), 1))
        strip.putdata(pixels)
        q = strip.quantize(colors=want, method=Image.MEDIANCUT, kmeans=0)
        pal = q.getpalette()
        chosen = [tuple(pal[i * 3:i * 3 + 3]) for i in range(want)]

    out = list(reserved)
    for c in chosen:
        snap = tuple(LEVELS[min(7, (v * 8) // 256)] for v in c)
        if snap not in out:
            out.append(snap)
    return out[:15]


def md_color(rgb):
    r, g, b = (min(7, (v * 8) // 256) for v in rgb)
    return (b << 9) | (g << 5) | (r << 1)


def index_image(img, palette):
    """Da RGBA a indici di tavolozza: 0 è il colore trasparente."""
    w, h = img.size
    px = list(img.getdata())
    out = bytearray(w * h)
    cache = {}
    for i, (r, g, b, a) in enumerate(px):
        if a < 128:
            continue
        key = (r, g, b)
        idx = cache.get(key)
        if idx is None:
            best, bestd = 1, 1 << 30
            for j, (pr, pg, pb) in enumerate(palette):
                d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2
                if d < bestd:
                    bestd, best = d, j + 1
            idx = best
            cache[key] = idx
        out[i] = idx
    return out, w, h


# ----------------------------------------------------------------- banco
class Bank:
    """Raccoglie i disegni da 8x8 nell'ordine in cui finiranno in VRAM."""

    def __init__(self):
        self.tiles = []          # ogni voce: 32 byte
        self.index = {}          # per riusare i disegni identici

    def add(self, data, dedup=False):
        if dedup:
            key = bytes(data)
            got = self.index.get(key)
            if got is not None:
                return got
            self.index[key] = len(self.tiles)
        self.tiles.append(bytes(data))
        return len(self.tiles) - 1

    def cut(self, idx, w, h, tx, ty):
        """Estrae il disegno alla cella (tx, ty) e lo impacchetta a 4 bit."""
        data = bytearray(32)
        for y in range(8):
            sy = ty * 8 + y
            for x in range(0, 8, 2):
                sx = tx * 8 + x
                hi = idx[sy * w + sx] if sx < w and sy < h else 0
                lo = idx[sy * w + sx + 1] if sx + 1 < w and sy < h else 0
                data[y * 4 + x // 2] = (hi << 4) | lo
        return data

    def block(self, idx, w, h, x0, y0, tw, th, order="row", dedup=False):
        """Un rettangolo di celle; 'col' usa l'ordine degli sprite del VDP."""
        out = []
        if order == "col":
            for cx in range(tw):
                for cy in range(th):
                    out.append(self.add(self.cut(idx, w, h, x0 + cx, y0 + cy), dedup))
        else:
            for cy in range(th):
                for cx in range(tw):
                    out.append(self.add(self.cut(idx, w, h, x0 + cx, y0 + cy), dedup))
        return out


# ------------------------------------------------------------------ main
def main():
    os.makedirs(RES, exist_ok=True)
    os.makedirs(PREVIEW, exist_ok=True)

    raw = {}
    for names in GROUPS.values():
        for n, _w in names:
            if n == "font":
                raw[n] = render_font()
            elif n == "backdrop":
                # Metà piano: l'altra metà è la stessa, ribaltata dal VDP.
                # Media d'area invece di Lanczos: quest'ultimo, sul bordo fra
                # nuvola e cielo, inventa un alone che diventa una frangia.
                raw[n] = half(load(n), (256, 256), Image.BOX)
            elif n == "logo":
                raw[n] = half(load(n), (256, 64))
            elif n == "hazard":
                raw[n] = half(load(n), (24, 24))
            elif n == "movplat":
                raw[n] = wooden(half(load(n)))
            elif n == "icons":
                # le icone stanno nel pannello: fondo nero pieno, o si vedrebbe
                # il cielo del piano di sfondo attraverso le parti trasparenti
                small = half(load(n))
                back = Image.new("RGBA", small.size, (0, 0, 0, 255))
                back.alpha_composite(small)
                raw[n] = back
            else:
                raw[n] = half(load(n))
    for n in raw:
        raw[n] = posterize(raw[n])

    palettes = {}
    for pal, names in GROUPS.items():
        reserved = [(0, 0, 0)] if pal == 1 else []      # nero per i contorni
        palettes[pal] = build_palette([(raw[n], w) for n, w in names], reserved)

    indexed = {}
    for pal, names in GROUPS.items():
        for n, _w in names:
            indexed[n] = index_image(raw[n], palettes[pal])

    bank = Bank()
    out = {}          # nome -> (base, dati)

    def nearest(pal, rgb):
        best, bestd = 1, 1 << 30
        for j, c in enumerate(palettes[pal]):
            d = sum((a - b) ** 2 for a, b in zip(c, rgb))
            if d < bestd:
                bestd, best = d, j + 1
        return best

    def disc(index, radius):
        """Un disegno con un dischetto pieno: polvere e scintille."""
        rows = []
        for y in range(8):
            row = bytearray(4)
            for x in range(8):
                dx, dy = x - 3.5, y - 3.5
                v = index if dx * dx + dy * dy <= radius * radius else 0
                if x & 1:
                    row[x // 2] |= v
                else:
                    row[x // 2] |= v << 4
            rows.append(bytes(row))
        return b"".join(rows)

    # Il disegno numero zero è vuoto: nella tavola dei nomi il valore 0 vuol
    # dire "niente", e ci si appoggiano sia il cielo sia le celle libere.
    empty = bank.add(bytes(32))
    assert empty == 0

    # ---- una cella piena (fasce dei cartelli) e le particelle
    solid = bank.add(bytes([0x11] * 32))          # colore 1 della tavolozza 1
    dust = bank.add(disc(nearest(0, (222, 182, 128)), 1.9))
    bank.add(disc(nearest(0, (222, 182, 128)), 0.9))    # polvere che si spegne
    spark = bank.add(disc(nearest(1, (255, 226, 90)), 1.6))
    bank.add(disc(nearest(1, (255, 226, 90)), 0.8))     # scintilla che si spegne

    # ---- carattere: una cella per lettera
    idx, w, h = indexed["font"]
    font_base = bank.add(bank.cut(idx, w, h, 0, 0))
    for i in range(1, len(FONT_CHARS)):
        bank.add(bank.cut(idx, w, h, i, 0))

    # ---- icone del pannello: cuore pieno, cuore vuoto, scatola, martello
    idx, w, h = indexed["icons"]
    icons = [bank.block(idx, w, h, i * 2, 0, 2, 2) for i in range(4)]

    # ---- terreno: 16 maschere x 2 varianti, ogni cella 16x16 pixel
    idx, w, h = indexed["tiles"]
    terrain = []
    for variant in range(2):
        for mask in range(16):
            tx = (mask % 8) * 2
            ty = (mask // 8 + variant * 2) * 2
            terrain.append(bank.block(idx, w, h, tx, ty, 2, 2, dedup=True))
    oneway = bank.block(idx, w, h, 0, 8, 2, 2, dedup=True)
    decor = [bank.block(idx, w, h, i * 2, 8, 2, 2, dedup=True) for i in (1, 2, 3)]
    ground = [bank.block(idx, w, h, i * 2, 8, 2, 2, dedup=True) for i in (6, 7)]

    # ---- macchinario: 64x64 pixel nel piano di gioco
    idx, w, h = indexed["machine"]
    machine = bank.block(idx, w, h, 0, 0, 8, 8, dedup=True)

    # ---- cassa: sprite 16x16
    idx, w, h = indexed["crate"]
    crate = bank.block(idx, w, h, 0, 0, 2, 2, order="col")

    # ---- assi mobili: strisce già pronte da 4 e da 5 celle
    idx, w, h = indexed["movplat"]
    def plank(cell):          # metà alta della cella: lo spessore dell'asse
        return [bank.cut(idx, w, h, cell * 2, 0), bank.cut(idx, w, h, cell * 2 + 1, 0)]
    left, mid, right = plank(0), plank(1), plank(2)
    strips = {}
    for cells in (4, 5):
        base = None
        parts = [left] + [mid] * (cells - 2) + [right]
        for p in parts:
            for t in p:
                i = bank.add(t)
                if base is None:
                    base = i
        strips[cells] = base

    # ---- nano: fotogrammi 32x32 in ordine sprite
    idx, w, h = indexed["dwarf"]
    dwarf_rows = {"idle": (0, 2), "walk": (1, 6), "hammer": (2, 4), "air": (3, 4)}
    dwarf = {}
    for name, (row, count) in dwarf_rows.items():
        base = None
        for f in range(count):
            tiles = bank.block(idx, w, h, f * 4, row * 4, 4, 4, order="col")
            if base is None:
                base = tiles[0]
        dwarf[name] = base

    # ---- spiritelli: fotogrammi 24x24, tre righe di stato
    idx, w, h = indexed["imps"]
    imp_base = None
    for row in range(3):
        for f in range(4):
            tiles = bank.block(idx, w, h, f * 3, row * 3, 3, 3, order="col")
            if imp_base is None:
                imp_base = tiles[0]

    # ---- portale: 48x64 pixel, in quattro sprite da 24x32
    idx, w, h = indexed["portal"]
    portal_base = None
    for (qx, qy) in ((0, 0), (0, 4), (3, 0), (3, 4)):
        tiles = bank.block(idx, w, h, qx, qy, 3, 4, order="col")
        if portal_base is None:
            portal_base = tiles[0]

    # ---- blocco irto: sprite 24x24
    idx, w, h = indexed["hazard"]
    hazard = bank.block(idx, w, h, 0, 0, 3, 3, order="col")

    # ---- fondale e logo: mappe di celle con i disegni ripetuti riusati
    idx, w, h = indexed["backdrop"]
    left_half = bank.block(idx, w, h, 0, 0, 32, 32, dedup=True)
    # Il piano è largo 64 celle: la metà destra riusa gli stessi disegni
    # ribaltati, così il cielo non ha giunte e non costa altra memoria.
    backdrop_map = []
    for row in range(32):
        line = left_half[row * 32:(row + 1) * 32]
        backdrop_map.extend(line)
        backdrop_map.extend(t | 0x0800 for t in reversed(line))
    idx, w, h = indexed["logo"]
    logo_map = bank.block(idx, w, h, 0, 0, 32, 8, dedup=True)

    # ------------------------------------------------------------ scrittura
    def carr(name, values, per_line=8):
        lines = [f"const u16 {name}[] = {{"]
        row = []
        for i, v in enumerate(values):
            row.append(f"0x{v:04X},")
            if len(row) == per_line:
                lines.append("    " + " ".join(row))
                row = []
        if row:
            lines.append("    " + " ".join(row))
        lines.append("};")
        return "\n".join(lines)

    with open(os.path.join(RES, "gfx.c"), "w") as f:
        f.write("/* Generato da tools/md_assets.py — non modificare a mano. */\n")
        f.write('#include "gfx.h"\n\n')
        f.write("const u16 gfx_palettes[4][16] = {\n")
        for p in range(4):
            cols = [0] + [md_color(c) for c in palettes[p]]
            cols += [0] * (16 - len(cols))
            f.write("    {" + ", ".join(f"0x{c:04X}" for c in cols) + "},\n")
        f.write("};\n\n")

        f.write(f"const u32 gfx_tiles[{len(bank.tiles) * 8}] = {{\n")
        for t in bank.tiles:
            words = [int.from_bytes(t[i:i + 4], "big") for i in range(0, 32, 4)]
            f.write("    " + " ".join(f"0x{v:08X}," for v in words) + "\n")
        f.write("};\n\n")

        flat = [v for cell in terrain for v in cell]
        f.write(carr("terrain_cells", flat) + "\n\n")
        f.write(carr("oneway_cell", oneway) + "\n\n")
        f.write(carr("decor_cells", [v for c in decor for v in c]) + "\n\n")
        f.write(carr("ground_cells", [v for c in ground for v in c]) + "\n\n")
        f.write(carr("machine_map", machine) + "\n\n")
        f.write(carr("backdrop_map", backdrop_map, 16) + "\n\n")
        f.write(carr("logo_map", logo_map, 16) + "\n\n")
        f.write(carr("icon_cells", [v for c in icons for v in c]) + "\n\n")

    with open(os.path.join(RES, "gfx.h"), "w") as f:
        f.write("/* Generato da tools/md_assets.py — non modificare a mano. */\n")
        f.write("#ifndef GFX_H\n#define GFX_H\n#include \"md.h\"\n\n")
        f.write(f"#define GFX_TILE_COUNT {len(bank.tiles)}\n")
        f.write(f"extern const u32 gfx_tiles[{len(bank.tiles) * 8}];\n")
        f.write("extern const u16 gfx_palettes[4][16];\n\n")
        f.write("extern const u16 terrain_cells[];   /* 32 celle x 4 disegni */\n")
        f.write("extern const u16 oneway_cell[];\n")
        f.write("extern const u16 decor_cells[];     /* 3 celle x 4 */\n")
        f.write("extern const u16 ground_cells[];    /* 2 celle x 4 */\n")
        f.write("extern const u16 machine_map[];     /* 8x8 celle */\n")
        f.write("extern const u16 backdrop_map[];    /* 64x32 celle */\n")
        f.write("extern const u16 logo_map[];        /* 32x8 celle */\n")
        f.write("extern const u16 icon_cells[];      /* 4 icone x 4 disegni */\n\n")
        f.write(f"#define TILE_FONT      {font_base}\n")
        f.write(f"#define FONT_CHARS     {len(FONT_CHARS)}\n")
        f.write(f"#define TILE_EMPTY     {empty}\n")
        f.write(f"#define TILE_SOLID     {solid}\n")
        f.write(f"#define TILE_DUST      {dust}\n")
        f.write(f"#define TILE_SPARK     {spark}\n")
        f.write(f"#define TILE_CRATE     {crate[0]}\n")
        f.write(f"#define TILE_PLANK4    {strips[4]}\n")
        f.write(f"#define TILE_PLANK5    {strips[5]}\n")
        f.write(f"#define TILE_DWARF_IDLE   {dwarf['idle']}\n")
        f.write(f"#define TILE_DWARF_WALK   {dwarf['walk']}\n")
        f.write(f"#define TILE_DWARF_HAMMER {dwarf['hammer']}\n")
        f.write(f"#define TILE_DWARF_AIR    {dwarf['air']}\n")
        f.write("#define DWARF_FRAME_TILES 16\n")
        f.write(f"#define TILE_IMP       {imp_base}\n")
        f.write("#define IMP_FRAME_TILES 9\n")
        f.write(f"#define TILE_PORTAL    {portal_base}\n")
        f.write("#define PORTAL_QUAD_TILES 12\n")
        f.write(f"#define TILE_HAZARD    {hazard[0]}\n")
        f.write("\n#endif\n")

    # ---- anteprime: le immagini così come le vedrà la console
    for name in raw:
        pal = next(p for p, ns in GROUPS.items() if name in [n for n, _ in ns])
        idx, w, h = indexed[name]
        prev = Image.new("RGB", (w, h), (40, 40, 48))
        px = prev.load()
        for y in range(h):
            for x in range(w):
                v = idx[y * w + x]
                if v:
                    px[x, y] = palettes[pal][v - 1]
        prev.save(os.path.join(PREVIEW, name + ".png"))

    print(f"disegni: {len(bank.tiles)} su 1472 disponibili")
    for p in range(4):
        print(f"  tavolozza {p}: {len(palettes[p])} colori  ({[n for n, _ in GROUPS[p]]})")


if __name__ == "__main__":
    sys.exit(main())
