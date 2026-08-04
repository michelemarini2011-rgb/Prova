/* Scritte: il carattere è un disegno da 8x8 per lettera, quindi basta posare
   le celle giuste nella tavola dei nomi di un piano. */
#include "game.h"
#include "gfx.h"

#define MAX_LINE 40

static u16 glyph(u8 c, u8 pal)
{
    u16 tile;
    if (c >= 32 && c < 127) tile = TILE_FONT + (c - 32);
    else if (c >= 1 && c <= 6) tile = TILE_FONT + 95 + (c - 1);   /* à è é ì ò ù */
    else tile = TILE_FONT;
    return TILE_ATTR(tile, pal, 1, 0, 0);
}

u16 text_len(const char *s)
{
    u16 n = 0;
    while (s[n]) n++;
    return n;
}

void text_clear(u16 plane, u16 tile)
{
    vdp_fill_plane(plane, tile);
}

/* Scrive dentro una riga già in memoria: serve a comporre il pannello e poi
   mandarlo al VDP tutto insieme, invece di una parola per volta. */
void text_blit(u16 *row, u16 col, u16 width, const char *s, u8 pal)
{
    u16 i = 0;
    while (s[i] && col + i < width) {
        row[col + i] = glyph((u8)s[i], pal);
        i++;
    }
}

void text_num_blit(u16 *row, u16 col, u16 width, u16 value, u8 digits, u8 pal)
{
    char buf[8];
    s16 i;
    if (digits > 6) digits = 6;
    buf[digits] = 0;
    for (i = digits - 1; i >= 0; i--) {
        buf[i] = (char)('0' + (value % 10));
        value /= 10;
    }
    for (i = 0; i < digits - 1 && buf[i] == '0'; i++) buf[i] = ' ';
    text_blit(row, col, width, buf, pal);
}

void text_put(u16 plane, u16 col, u16 row, const char *s, u8 pal)
{
    u16 buf[MAX_LINE];
    u16 n = 0;
    while (s[n] && n < MAX_LINE && col + n < 40) {
        buf[n] = glyph((u8)s[n], pal);
        n++;
    }
    if (n) vdp_map_row(plane, row, buf, n, col);
}

void text_center(u16 plane, u16 row, const char *s, u8 pal)
{
    u16 n = text_len(s);
    u16 col = (n >= 40) ? 0 : (u16)((40 - n) / 2);
    text_put(plane, col, row, s, pal);
}

void text_number(u16 plane, u16 col, u16 row, u16 value, u8 digits, u8 pal)
{
    char buf[8];
    s16 i;
    if (digits > 6) digits = 6;
    buf[digits] = 0;
    for (i = digits - 1; i >= 0; i--) {
        buf[i] = (char)('0' + (value % 10));
        value /= 10;
    }
    /* niente zeri davanti: fanno molto orologio digitale */
    for (i = 0; i < digits - 1 && buf[i] == '0'; i++) buf[i] = ' ';
    text_put(plane, col, row, buf, pal);
}

/* Manda a capo alla larghezza data e centra ogni riga: i suggerimenti delle
   cave sono lunghi e lo schermo è di quaranta caratteri. */
u16 text_wrap(u16 plane, u16 row, const char *s, u8 pal, u16 width)
{
    char line[MAX_LINE + 1];
    u16 used = 0, len = 0, last_space = 0, i = 0;

    if (width > MAX_LINE) width = MAX_LINE;
    for (;;) {
        u8 c = (u8)s[i];
        if (c == 0 || len == width) {
            u16 cut = len;
            /* senza spazi utili la parola si spezza: meglio che bloccarsi */
            if (c != 0 && last_space) cut = last_space;
            line[cut] = 0;
            /* una riga sì e una no: a otto pixel di distanza le lettere si
               toccano e il testo diventa una macchia */
            text_center(plane, row + used * 2, line, pal);
            used++;
            if (c == 0) break;
            i -= (len - cut);
            while (s[i] == ' ') i++;
            len = 0;
            last_space = 0;
            continue;
        }
        if (c == ' ') last_space = len;
        line[len++] = (char)c;
        i++;
    }
    return used;
}
