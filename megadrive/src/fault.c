/* Schermata di errore: se il 68000 inciampa (indirizzo dispari, istruzione
   illegale, divisione per zero...) si vede subito cosa e dove, invece di
   ritrovarsi la macchina piantata senza spiegazioni. */
#include "game.h"
#include "gfx.h"

u32 exc_frame;                  /* pila dell'eccezione, salvata dal gestore */

static const char *const kinds[] = {
    "ERRORE DI BUS", "INDIRIZZO DISPARI", "ISTRUZIONE ILLEGALE",
    "DIVISIONE PER ZERO", "ECCEZIONE"
};

static void hex(char *out, u32 value, u8 digits)
{
    s16 i;
    for (i = digits - 1; i >= 0; i--) {
        u8 d = (u8)(value & 15);
        out[i] = (char)(d < 10 ? '0' + d : 'A' + d - 10);
        value >>= 4;
    }
    out[digits] = 0;
}

void exception_report(u32 kind)
{
    const u16 *f = (const u16 *)exc_frame;
    char buf[12];
    u32 addr, pc;

    if (kind > 4) kind = 4;
    /* le eccezioni di bus e indirizzo hanno una pila lunga: indirizzo,
       istruzione, stato e poi il programma; le altre solo stato e programma */
    if (kind < 2) {
        addr = ((u32)f[1] << 16) | f[2];
        pc = ((u32)f[5] << 16) | f[6];
    } else {
        addr = 0;
        pc = ((u32)f[1] << 16) | f[2];
    }

    vdp_window_rows(28);
    text_clear(VRAM_WINDOW, TILE_ATTR(TILE_SOLID, 1, 1, 0, 0));
    text_center(VRAM_WINDOW, 10, kinds[kind], 1);
    text_put(VRAM_WINDOW, 10, 13, "programma", 1);
    hex(buf, pc, 6);
    text_put(VRAM_WINDOW, 22, 13, buf, 1);
    text_put(VRAM_WINDOW, 10, 15, "indirizzo", 1);
    hex(buf, addr, 6);
    text_put(VRAM_WINDOW, 22, 15, buf, 1);

    /* qualche parola di pila: gli indirizzi di ritorno dicono da dove si
       veniva quando il programma è uscito di strada */
    {
        const u32 *sp = (const u32 *)((exc_frame + (kind < 2 ? 14 : 6) + 3) & ~3UL);
        u8 i;
        hex(buf, f[0], 4);
        text_put(VRAM_WINDOW, 10, 16, "stato", 1);
        text_put(VRAM_WINDOW, 22, 16, buf, 1);
        hex(buf, f[3], 4);
        text_put(VRAM_WINDOW, 28, 16, buf, 1);
        text_put(VRAM_WINDOW, 10, 18, "pila", 1);
        for (i = 0; i < 8; i++) {
            hex(buf, sp[i], 6);
            text_put(VRAM_WINDOW, (u16)(16 + (i & 3) * 8), (u16)(18 + (i >> 2)), buf, 1);
        }
    }
}
