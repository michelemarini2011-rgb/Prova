#!/usr/bin/env python3
"""Cerca accessi a 16 o 32 bit su indirizzi dispari.

Il 68020 li tollera, il 68000 del Mega Drive no: risponde con un errore di
indirizzo e il gioco si pianta. Il compilatore, che di suo mira al 68020, ogni
tanto ne genera (per esempio accorpando due scritture di un byte, oppure
leggendo i sedici bit centrali di un numero lungo per fare uno spostamento).

    python3 tools/checkalign.py build/martello.elf
"""
import re
import subprocess
import sys

# istruzioni che toccano la memoria a parola o a parola lunga
OP = re.compile(r"\t(move|clr|tst|add|sub|cmp|and|or|eor|not|neg|addq|subq|"
                r"addi|subi|cmpi|andi|ori|eori|movem|lsl|lsr|asl|asr|rol|ror)"
                r"[a-z]*[wl]\b")
ABS = re.compile(r"(?:^|[ ,(])([0-9a-f]{4,8}) <")


def main(elf: str) -> int:
    out = subprocess.run(["m68k-linux-gnu-objdump", "-d", elf],
                         capture_output=True, text=True, check=True).stdout
    bad = []
    for line in out.splitlines():
        if not OP.search(line):
            continue
        # la parte a sinistra della tabulazione è l'indirizzo dell'istruzione
        operands = line.split("\t")[-1]
        for addr in ABS.findall(operands):
            value = int(addr, 16)
            if value % 2 == 1:
                bad.append(line.strip())
                break

    for line in bad:
        print("indirizzo dispari:", line)
    if bad:
        print(f"\n{len(bad)} accessi disallineati: il 68000 non li digerisce.")
        return 1
    print("allineamenti a posto")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "build/martello.elf"))
