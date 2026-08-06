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
import gzip
import json
import os
import sys
from collections import Counter

from PIL import Image, ImageDraw

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

# Immagini che entrano in una tavolozza ma non partecipano a sceglierne i
# colori: il logo inglese è fatto con gli stessi due colori di quello italiano
# e il fondale senza sole è il fondale, quindi non hanno niente da chiedere e
# così le tavolozze restano identiche.
GUESTS = {1: ["logo_en"], 3: ["backdrop_nosun"], 0: ["movplat_crack"]}


def cracked(img):
    """L'asse con le crepe: la stessa tavola, spaccata in tre punti. Serve a
    dire «questa cede» prima che ceda, senza inventare un altro legno."""
    out = img.copy()
    d = ImageDraw.Draw(out)
    dark = (72, 36, 0, 255)
    for x0 in (5, 13, 21, 29, 37, 45):
        d.line([(x0, 0), (x0 + 2, 3), (x0 - 1, 7)], fill=dark)
    return out

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


# Il fondale occupa mezzo piano e il VDP ribalta quella metà per riempire
# l'altra: le nuvole non se ne accorgono, ma il sole sì, e in cielo ne
# comparivano due. Qui se ne fa una copia senza, che va nella metà ribaltata;
# il sole resta uno solo, al suo posto.
SUN = (217, 36, 32, 36)                 # centro e semiassi, nell'immagine da 256


def strip_sun(img):
    cx, cy, rx, ry = SUN
    out = img.copy()
    px = out.load()
    for y in range(cy - ry, cy + ry + 1):
        sky = px[1, y]                      # il cielo di quella riga, a sinistra
        for x in range(cx - rx, cx + rx + 1):
            dx = (x - cx) / rx
            dy = (y - cy) / ry
            if dx * dx + dy * dy > 1.0:
                continue
            r, g, b, a = px[x, y]
            # dentro l'ellisse c'è solo il sole, il suo alone e il pezzo di
            # nuvola che gli passa davanti. La nuvola è chiara in tutte e tre
            # le componenti; il giallo del sole ha poco blu e l'alone poco
            # rosso, quindi bastano due soglie per lasciare stare la nuvola.
            if r >= 210 and b >= 210:
                # la nuvola scaldata dal sole torna bianca
                if r > b:
                    px[x, y] = (r, g, r, a)
            else:
                px[x, y] = sky
    return out


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


# Il carattere è quello a punti da 8x8 dei terminali (il classico disegno VGA,
# lo stesso spirito dei giochi dell'epoca), preso dai font della console Linux.
# Schiacciare un TrueType in otto pixel dava lettere impastate: un carattere
# disegnato a punti per quella misura è tutt'altra cosa.
PSF_FONT = "/usr/share/consolefonts/Lat15-VGA8.psf.gz"


def load_psf(path):
    """Legge un font PSF1 da 8 pixel: restituisce i glifi e la mappa unicode."""
    data = gzip.open(path, "rb").read()
    if data[:2] != b"\x36\x04":
        raise ValueError("non e' un font PSF1")
    mode, height = data[2], data[3]
    count = 512 if (mode & 1) else 256
    glyphs = [data[4 + i * height:4 + (i + 1) * height] for i in range(count)]

    table = {}
    if mode & 2:                      # in coda c'e' l'elenco unicode per glifo
        pos, glyph, pending = 4 + count * height, 0, []
        while pos + 1 < len(data) and glyph < count:
            value = data[pos] | (data[pos + 1] << 8)
            pos += 2
            if value == 0xFFFF:
                for code in pending:
                    table.setdefault(code, glyph)
                pending = []
                glyph += 1
            elif value != 0xFFFE:
                pending.append(value)
    return glyphs, table, height


def render_font():
    """Un carattere fisso da 8x8: una cella per lettera, come vuole il VDP.

    Le lettere sono bianche su fondo nero pieno, non trasparente: le celle di
    un piano ne contengono una sola, quindi una scritta sopra una fascia scura
    ne prenderebbe il posto e si leggerebbe il cielo attraverso le lettere."""
    glyphs, table, height = load_psf(PSF_FONT)
    img = Image.new("RGBA", (8 * len(FONT_CHARS), 8), (0, 0, 0, 255))
    px = img.load()
    for i, ch in enumerate(FONT_CHARS):
        glyph = glyphs[table.get(ord(ch), table.get(32, 0))]
        for y in range(min(8, height)):
            row = glyph[y]
            for x in range(8):
                if row & (0x80 >> x):
                    px[i * 8 + x, y] = (255, 255, 255, 255)
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

    # nome dell'immagine -> tavolozza in cui finisce
    belongs = {n: pal for pal, names in GROUPS.items() for n, _w in names}
    belongs.update({n: pal for pal, names in GUESTS.items() for n in names})

    raw = {}
    for n in belongs:
        if n == "font":
            raw[n] = render_font()
        elif n == "backdrop":
            # Metà piano: l'altra metà è la stessa, ribaltata dal VDP.
            # Media d'area invece di Lanczos: quest'ultimo, sul bordo fra
            # nuvola e cielo, inventa un alone che diventa una frangia.
            raw[n] = half(load(n), (256, 256), Image.BOX)
        elif n == "backdrop_nosun":
            raw[n] = strip_sun(half(load("backdrop"), (256, 256), Image.BOX))
        elif n.startswith("logo"):
            raw[n] = half(load(n), (256, 64))
        elif n == "hazard":
            raw[n] = half(load(n), (24, 24))
        elif n == "movplat":
            raw[n] = wooden(half(load(n)))
        elif n == "movplat_crack":
            raw[n] = cracked(wooden(half(load("movplat"))))
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

    indexed = {n: index_image(raw[n], palettes[pal]) for n, pal in belongs.items()}

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

    # ---- disegni fatti a mano: la freccia dei bersagli fuori vista e la
    # barra del torpore sopra la testa degli spiritelli
    def paint(matrix):
        """Una matrice di indici diventa disegni da 8x8, in ordine sprite."""
        h = len(matrix)
        w = len(matrix[0])
        flat = bytearray(w * h)
        for y in range(h):
            for x in range(w):
                flat[y * w + x] = matrix[y][x]
        return bank.block(flat, w, h, 0, 0, w // 8, h // 8, order="col")[0]

    def outlined(m, edge):
        """Contorno scuro tutto attorno: sul cielo o sul terreno si legge
        comunque."""
        out = [row[:] for row in m]
        for y in range(len(m)):
            for x in range(len(m[0])):
                if m[y][x]:
                    continue
                if any(m[y + dy][x + dx]
                       for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                       if 0 <= y + dy < len(m) and 0 <= x + dx < len(m[0])):
                    out[y][x] = edge
        return out

    def rot_ccw(m):
        n = len(m)
        return [[m[x][n - 1 - y] for x in range(n)] for y in range(n)]

    gold = nearest(1, (255, 226, 90))
    dark = nearest(1, (0, 0, 0))

    arrow = [[0] * 16 for _ in range(16)]
    for y in range(6, 10):                      # il gambo
        for x in range(1, 9):
            arrow[y][x] = gold
    for x in range(8, 15):                      # la punta
        k = 15 - x
        for y in range(8 - k, 8 + k):
            arrow[y][x] = gold
    arrow = outlined(arrow, dark)
    arrow_right = paint(arrow)                  # sinistra: la stessa, ribaltata
    arrow_up = paint(rot_ccw(arrow))            # giù: la stessa, capovolta

    # L'elmo dello spiritello corazzato: uno sprite da 24x8 che gli si posa
    # in testa. Il disegno dello spiritello resta quello di sempre.
    def from_chars(rows, mapping, pal):
        cell = [[0] * len(rows[0]) for _ in rows]
        for y, r in enumerate(rows):
            for x, ch in enumerate(r):
                if ch in mapping:
                    cell[y][x] = nearest(pal, mapping[ch])
        return cell

    STEEL = {"m": (36, 36, 72), "M": (218, 218, 218), "h": (255, 255, 255)}
    helmet = paint(from_chars([
        "....mmmmmmmm....",
        "..mmMMMMMMMMmm..",
        ".mMMhhMMMMMMMMm.",
        ".mMMMMMMMMMMMMm.",
        "mmmmmmmmmmmmmmmm",
        "mMMMMMMMMMMMMMMm",
        "mmmmmmmmmmmmmmmm",
        "................",
    ], STEEL, 2))

    # Il nastro trasportatore: quattro fotogrammi della stessa cella da 16x16.
    # In memoria video ne sta uno solo — gli altri tre arrivano in DMA sopra
    # allo stesso posto, così la tavola dei nomi non si tocca mai.
    belt_frames = []
    for frame in range(4):
        cell = [[0] * 16 for _ in range(16)]
        edge = nearest(0, (72, 36, 0))
        body = nearest(0, (182, 145, 72))
        stud = nearest(0, (255, 218, 145))
        for y in range(16):
            for x in range(16):
                if y < 2 or y > 13:
                    cell[y][x] = edge
                else:
                    cell[y][x] = body
        for y in (4, 5, 10, 11):                # le tacche che scorrono
            for k in range(4):
                x = (k * 4 + frame * 1 + (0 if y < 8 else 2)) & 15
                cell[y][x] = stud
                cell[y][(x + 1) & 15] = stud
        belt_frames.append(cell)
    belt_base = paint(belt_frames[0])

    # --- il pipistrello: ali su e ali giù (tavolozza degli spiritelli)
    BATC = {"w": (145, 109, 182), "b": (72, 72, 109),
            "e": (255, 255, 255), "m": (255, 109, 255)}
    BAT_UP = [
        "................",
        "ww............ww",
        "www..........www",
        "wwww...bbb..wwww",
        ".wwww.bbbbb.wwww",
        ".wwwwbbbbbbbwwww",
        "..wwwbebbbebwww.",
        "..wwwbbbbbbbwww.",
        "...wwbbmmmbbww..",
        "....wbbbbbbbw...",
        "......bbbbb.....",
        ".......bbb......",
        "................",
        "................",
        "................",
        "................",
    ]
    BAT_DOWN = [
        "................",
        "................",
        "................",
        "......bbb.......",
        "wwww.bbbbb.wwww.",
        "wwwwwbbbbbbbwwww",
        ".wwwwbebbbebwww.",
        "..wwwbbbbbbbwww.",
        "...wwbbmmmbbww..",
        "....wbbbbbbbw...",
        ".....wbbbbbw....",
        "......bbb.......",
        "................",
        "................",
        "................",
        "................",
    ]
    bat_base = paint(from_chars(BAT_UP, BATC, 2))
    paint(from_chars(BAT_DOWN, BATC, 2))

    # --- la talpa che spunta dal terreno. Va nella tavolozza del nano, non in
    # quella del terreno: lì dentro non c'è un colore scuro e gli occhi e il
    # contorno sparivano nel bruno chiaro.
    MOLEC = {"c": (145, 72, 36), "l": (218, 145, 36), "n": (255, 182, 182),
             "g": (255, 255, 255), "e": (0, 0, 0)}
    MOLE_BODY = [
        "......cccc......",
        "....cclllllcc...",
        "...cclllllllcc..",
        "...ceclllllcec..",
        "...cclllllllcc..",
        "..ccclllnnlllcc.",
        "..ccccclnnlcccc.",
        "...cccclllcccc..",
        "..gcccccccccg...",
        ".ggcccccccccgg..",
        ".gg..cccccc..gg.",
    ]
    mole_base = None
    for out in (0, 6):
        rows = ["................"] * 16
        for i, r in enumerate(MOLE_BODY):
            y = 4 + out + i
            if y < 16:
                rows[y] = r
        t = paint(from_chars(rows, MOLEC, 1))
        if mole_base is None:
            mole_base = t

    # --- il carrello da miniera, anche lui nella tavolozza col nero
    CARTC = {"d": (0, 0, 0), "c": (145, 72, 36), "l": (255, 182, 109),
             "s": (109, 72, 36), "w": (0, 0, 0), "g": (218, 145, 36)}
    cart = paint(from_chars([
        "dd............................dd",
        "dlddddddddddddddddddddddddddddld",
        "dlcccccccccccccccccccccccccccccd",
        "dlcsssssssssssssssssssssssssscld",
        "dlcccccccccccccccccccccccccccccd",
        "dlcsssssssssssssssssssssssssscld",
        "dlcccccccccccccccccccccccccccccd",
        "ddcccccccccccccccccccccccccccccd",
        ".dsssssssssssssssssssssssssssdd.",
        "..ddddddddddddddddddddddddddd...",
        ".....dddd..........dddd.........",
        "....ddgggd........ddgggd........",
        "....dggggd........dggggd........",
        ".....dddd..........dddd.........",
        "................................",
        "................................",
    ], CARTC, 1))

    # La palla di fuoco che gira attorno al perno: due fotogrammi che pulsano,
    # a fasce concentriche. Un pallino da otto pixel non bastava — è un
    # ostacolo che costa un cuore e si deve vedere da lontano.
    fire_base = None
    for frame in range(2):
        cell = [[0] * 16 for _ in range(16)]
        outer = 7.5 - frame * 0.8
        for y in range(16):
            for x in range(16):
                dx, dy = x - 7.5, y - 7.5
                d = (dx * dx + dy * dy) ** 0.5
                if d > outer:
                    continue
                if d < outer * 0.42:
                    cell[y][x] = nearest(1, (255, 255, 145))
                elif d < outer * 0.68:
                    cell[y][x] = nearest(1, (255, 218, 109))
                elif d < outer * 0.87:
                    cell[y][x] = nearest(1, (255, 182, 109))
                else:
                    cell[y][x] = nearest(1, (145, 36, 0))
        t = paint(cell)
        if fire_base is None:
            fire_base = t

    # Nove livelli di riempimento: la barra è larga due celle, quindi ogni
    # cella prende il suo pezzo di riempimento e insieme fanno sedici passi.
    bar_base = None
    for level in range(9):
        cell = [[0] * 8 for _ in range(8)]
        for y in range(2, 6):
            for x in range(8):
                cell[y][x] = dark               # il fondo dice quanto era pieno
        for y in range(3, 5):
            for x in range(level):
                cell[y][x] = gold
        t = paint(cell)
        if bar_base is None:
            bar_base = t

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

    # le stesse strisce, crepate: l'asse che sta per cedere
    idx, w, h = indexed["movplat_crack"]
    def cplank(cell):
        return [bank.cut(idx, w, h, cell * 2, 0), bank.cut(idx, w, h, cell * 2 + 1, 0)]
    cleft, cmid, cright = cplank(0), cplank(1), cplank(2)
    cracks = {}
    for cells in (4, 5):
        base = None
        for p in [cleft] + [cmid] * (cells - 2) + [cright]:
            for t in p:
                i = bank.add(t)
                if base is None:
                    base = i
        cracks[cells] = base

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
    sunny = bank.block(idx, w, h, 0, 0, 32, 32, dedup=True)
    idx, w, h = indexed["backdrop_nosun"]
    plain = bank.block(idx, w, h, 0, 0, 32, 32, dedup=True)
    # Il piano è largo 64 celle: la metà destra riusa gli stessi disegni
    # ribaltati, così il cielo non ha giunte e non costa altra memoria. Il sole
    # però comparirebbe due volte, uno per lato: sta solo nella metà ribaltata
    # (dove nella schermata del titolo spunta accanto al logo) e la metà di
    # sinistra usa la copia senza. Le uniche celle nuove sono quelle del sole,
    # tutte le altre le riconosce il dedup.
    backdrop_map = []
    for row in range(32):
        line = plain[row * 32:(row + 1) * 32]
        mirror = sunny[row * 32:(row + 1) * 32]
        backdrop_map.extend(line)
        backdrop_map.extend(t | 0x0800 for t in reversed(mirror))
    # Le due lingue portano ognuna il suo logo: sono parole diverse, ma i
    # disegni uguali (il fondo, i pieni) se li spartiscono.
    idx, w, h = indexed["logo"]
    logo_map = bank.block(idx, w, h, 0, 0, 32, 8, dedup=True)
    idx, w, h = indexed["logo_en"]
    logo_map_en = bank.block(idx, w, h, 0, 0, 32, 8, dedup=True)

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
        f.write(carr("logo_map_en", logo_map_en, 16) + "\n\n")
        f.write(carr("icon_cells", [v for c in icons for v in c]) + "\n\n")

        # i quattro fotogrammi del nastro, come dati grezzi da mandare in DMA
        f.write("const u32 belt_anim[4][32] = {\n")
        for cell in belt_frames:
            words = []
            for tx in range(2):            # ordine sprite, come paint()
                for ty in range(2):
                    for y in range(8):
                        v = 0
                        for x in range(8):
                            v = (v << 4) | cell[ty * 8 + y][tx * 8 + x]
                        words.append(v)
            f.write("    {" + ", ".join(f"0x{v:08X}" for v in words) + "},\n")
        f.write("};\n\n")

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
        f.write("extern const u16 logo_map_en[];     /* lo stesso, in inglese */\n")
        f.write("extern const u16 icon_cells[];      /* 4 icone x 4 disegni */\n")
        f.write("extern const u32 belt_anim[4][32];  /* i fotogrammi del nastro */\n\n")
        f.write(f"#define TILE_FONT      {font_base}\n")
        f.write(f"#define FONT_CHARS     {len(FONT_CHARS)}\n")
        f.write(f"#define TILE_EMPTY     {empty}\n")
        f.write(f"#define TILE_SOLID     {solid}\n")
        f.write(f"#define TILE_DUST      {dust}\n")
        f.write(f"#define TILE_SPARK     {spark}\n")
        f.write(f"#define TILE_ARROW_R   {arrow_right}   /* 2x2, punta a destra */\n")
        f.write(f"#define TILE_ARROW_U   {arrow_up}   /* 2x2, punta in alto */\n")
        f.write(f"#define TILE_BAR       {bar_base}   /* 9 livelli, da vuoto a pieno */\n")
        f.write(f"#define TILE_FIRE      {fire_base}   /* 2x2, due fotogrammi */\n")
        f.write(f"#define TILE_HELMET    {helmet}   /* 3x1, sopra lo spiritello */\n")
        f.write(f"#define TILE_BELT      {belt_base}   /* 2x2, si anima in DMA */\n")
        f.write(f"#define TILE_CRACK4    {cracks[4]}\n")
        f.write(f"#define TILE_CRACK5    {cracks[5]}\n")
        f.write(f"#define TILE_BAT       {bat_base}   /* 2x2, due fotogrammi */\n")
        f.write(f"#define TILE_MOLE      {mole_base}  /* 2x2, fuori e a met\u00e0 */\n")
        f.write(f"#define TILE_CART      {cart}   /* 4x2 */\n")
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
        pal = belongs[name]
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
