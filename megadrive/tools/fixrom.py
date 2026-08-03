#!/usr/bin/env python3
"""Chiude la ROM: riempimento fino a una taglia valida e checksum in testata.

Il Mega Drive tiene il checksum a 0x18E: somma a 16 bit di tutte le parole dal
byte 0x200 in poi. Alcuni emulatori e il BIOS di certi modelli lo controllano.
"""
import sys


def main(src: str, dst: str) -> None:
    data = bytearray(open(src, "rb").read())

    # taglia minima 512 KB, poi si raddoppia: le cartucce vere sono così
    size = 512 * 1024
    while size < len(data):
        size *= 2
    data.extend(b"\x00" * (size - len(data)))

    checksum = 0
    for i in range(0x200, len(data), 2):
        checksum = (checksum + (data[i] << 8) + data[i + 1]) & 0xFFFF
    data[0x18E] = (checksum >> 8) & 0xFF
    data[0x18F] = checksum & 0xFF

    # estremi della ROM dichiarati nell'intestazione
    end = size - 1
    data[0x1A4:0x1A8] = bytes([(end >> 24) & 0xFF, (end >> 16) & 0xFF,
                               (end >> 8) & 0xFF, end & 0xFF])

    open(dst, "wb").write(bytes(data))
    print(f"{dst}: {size // 1024} KB, checksum {checksum:04X}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
