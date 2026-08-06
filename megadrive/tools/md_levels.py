#!/usr/bin/env python3
"""Porta le quattro cave del gioco HTML nei dati della ROM.

Le mappe sono le stesse, carattere per carattere; cambiano solo le unità: una
cella passa da 32 a 16 pixel e le velocità da pixel al secondo a passi di
1/256 di pixel per quadro (il gioco gira a 60 quadri al secondo).
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

COLS = 30

# I simboli della mappa diventano codici: si confrontano molto più in fretta.
CODE = {
    ".": 0, "#": 1, "=": 2, "~": 3, "x": 4, "S": 5,
    "P": 6, "O": 7, "M": 8, "b": 9, "r": 10, "f": 11,
    # roba nuova: assi che salgono, assi a intermittenza (accesa e spenta),
    # spiritelli svelti, perni delle scintille
    "|": 12, "i": 13, "j": 14, "V": 15, "o": 16,
}

# Le lettere accentate non stanno in ASCII: nel gioco viaggiano come codici
# bassi, che il carattere sa disegnare.
ACCENTS = {"à": "\x01", "è": "\x02", "é": "\x03", "ì": "\x04", "ò": "\x05", "ù": "\x06"}


def cstr(s):
    for k, v in ACCENTS.items():
        s = s.replace(k, v)
    out = ""
    for ch in s:
        if ch == '"':
            out += '\\"'
        elif ch == "\\":
            out += "\\\\"
        elif ord(ch) < 32:
            out += "\\%03o" % ord(ch)
        elif ord(ch) < 127:
            out += ch
        else:
            out += "?"          # niente altro entra nel carattere da 8x8
    return '"' + out + '"'


def vel(px_per_second):
    """px/s su celle da 32 -> 16.16 px/quadro su celle da 16."""
    return int(round(px_per_second * 65536.0 / 120.0))


def main():
    arenas = json.load(open(os.path.join(HERE, "arenas.json"), encoding="utf8"))

    with open(os.path.join(ROOT, "res", "levels.c"), "w") as f:
        f.write("/* Generato da tools/md_levels.py — non modificare a mano. */\n")
        f.write('#include "levels.h"\n\n')
        for i, a in enumerate(arenas):
            rows = a["rows"]
            assert all(len(r) == COLS for r in rows)
            f.write(f"static const u8 map{i}[] = {{\n")
            for r in rows:
                f.write("    " + " ".join(f"{CODE[c]}," for c in r) + "\n")
            f.write("};\n\n")

        # Le due lingue stanno insieme: sceglie il compilatore, con LANG_EN.
        f.write("/* La lingua si sceglie qui: vedi src/strings.h e il Makefile. */\n")
        f.write("#ifdef LANG_EN\n#define T(it, en) en\n#else\n"
                "#define T(it, en) it\n#endif\n\n")
        f.write("const ArenaDef arenas[ARENA_COUNT] = {\n")
        for i, a in enumerate(arenas):
            f.write("    { T(%s, %s),\n      T(%s,\n        %s),\n"
                    "      map%d, %d, %d, %d, %d },\n" % (
                        cstr(a["name"]), cstr(a["name_en"]),
                        cstr(a["hint"]), cstr(a["hint_en"]),
                        i, len(a["rows"]),
                        int(round(a["stun"] * 60)),      # torpore in quadri
                        vel(a["speed"]), vel(a["platSpeed"])))
        f.write("};\n")

    with open(os.path.join(ROOT, "res", "levels.h"), "w") as f:
        f.write("/* Generato da tools/md_levels.py — non modificare a mano. */\n")
        f.write("#ifndef LEVELS_H\n#define LEVELS_H\n#include \"md.h\"\n\n")
        f.write(f"#define ARENA_COUNT {len(arenas)}\n")
        f.write(f"#define ARENA_COLS  {COLS}\n\n")
        f.write("/* Codici delle celle. */\n")
        for name, code in [("EMPTY", 0), ("SOLID", 1), ("ONEWAY", 2), ("MOVER", 3),
                           ("BLOCK", 4), ("SPAWN", 5), ("START", 6), ("PORTAL", 7),
                           ("MACHINE", 8), ("DECOR_B", 9), ("DECOR_R", 10),
                           ("DECOR_F", 11), ("LIFT", 12), ("BLINK_A", 13),
                           ("BLINK_B", 14), ("SWIFT", 15), ("ORBIT", 16)]:
            f.write(f"#define CELL_{name:<8} {code}\n")
        f.write("""
typedef struct {
    const char *name;
    const char *hint;
    const u8   *map;
    u16 rows;
    u16 stun;        /* durata del torpore, in quadri */
    u16 speed;       /* velocità degli spiritelli, 8.8 px/quadro */
    u16 plat_speed;  /* velocità delle assi mobili */
} ArenaDef;

extern const ArenaDef arenas[ARENA_COUNT];

#endif
""")

    print(f"livelli: {len(arenas)}")
    for a in arenas:
        rows = a["rows"]
        joined = "".join(rows)
        print(f"  {a['name']:24s} {len(rows)} righe, spiritelli {joined.count('S')}, "
              f"blocchi {joined.count('x')}")


if __name__ == "__main__":
    main()
