/* Comandi di base del VDP: registri, disegni, tavolozze, piani, sprite. */
#include "md.h"

volatile u16 vblank_count = 0;

Sprite sprites[SPRITE_MAX];
u16    sprite_count = 0;

static u8 reg1_shadow = 0x74;   /* schermo acceso, interruzione di quadro, DMA */

void vdp_reg(u8 reg, u8 value)
{
    VDP_CTRL_W = (u16)(0x8000 | ((u16)reg << 8) | value);
}

void vdp_init(void)
{
    volatile u16 dummy;

    dummy = VDP_CTRL_W;         /* lettura di cortesia: azzera il primo/secondo word */
    (void)dummy;

    vdp_reg(0x00, 0x04);        /* modo 5, niente interruzione di riga */
    vdp_reg(0x01, 0x04);        /* schermo spento per ora */
    vdp_reg(0x02, VRAM_PLANE_A >> 10);
    vdp_reg(0x03, VRAM_WINDOW  >> 10);
    vdp_reg(0x04, VRAM_PLANE_B >> 13);
    vdp_reg(0x05, VRAM_SPRITES >> 9);
    vdp_reg(0x06, 0x00);
    vdp_reg(0x07, 0x00);        /* colore di sfondo: tavolozza 0, colore 0 */
    vdp_reg(0x08, 0x00);
    vdp_reg(0x09, 0x00);
    vdp_reg(0x0A, 0xFF);
    vdp_reg(0x0B, 0x00);        /* scorrimento a schermo intero */
    vdp_reg(0x0C, 0x81);        /* 40 celle, niente interlacciamento */
    vdp_reg(0x0D, VRAM_HSCROLL >> 10);
    vdp_reg(0x0E, 0x00);
    vdp_reg(0x0F, 0x02);        /* passo di scrittura: 2 byte */
    vdp_reg(0x10, 0x01);        /* piani da 64x32 celle */
    vdp_reg(0x11, 0x00);
    vdp_reg(0x12, 0x00);        /* riquadro fisso: nessuna riga */

    /* VRAM azzerata per intero: niente disegni sporchi ai bordi. */
    VDP_CTRL_L = VDP_VRAM_W(0);
    {
        u16 i;
        for (i = 0; i < 32768; i++) VDP_DATA_W = 0;
    }
    /* CRAM e VSRAM */
    VDP_CTRL_L = VDP_CRAM_W(0);
    {
        u16 i;
        for (i = 0; i < 64; i++) VDP_DATA_W = 0;
    }
    VDP_CTRL_L = VDP_VSRAM_W(0);
    {
        u16 i;
        for (i = 0; i < 40; i++) VDP_DATA_W = 0;
    }
}

void vdp_display(u8 on)
{
    reg1_shadow = on ? 0x74 : 0x34;
    vdp_reg(0x01, reg1_shadow);
}

void vdp_backdrop(u8 color_index)
{
    vdp_reg(0x07, color_index);
}

/* Righe occupate dal riquadro fisso, contate dall'alto (0 = disattivato). */
void vdp_window_rows(u8 rows)
{
    vdp_reg(0x11, 0x00);
    vdp_reg(0x12, rows);
}

void vdp_load_tiles(u16 first, const u32 *data, u16 count)
{
    u16 i, j;
    VDP_CTRL_L = VDP_VRAM_W(VRAM_TILES + ((u32)first << 5));
    for (i = 0; i < count; i++) {
        for (j = 0; j < 8; j++) VDP_DATA_L = *data++;
    }
}

void vdp_load_palette(u8 index, const u16 *colors, u16 count)
{
    u16 i;
    VDP_CTRL_L = VDP_CRAM_W((u16)index * 2);
    for (i = 0; i < count; i++) VDP_DATA_W = colors[i];
}

void vdp_fill_plane(u16 plane, u16 value)
{
    u16 i;
    VDP_CTRL_L = VDP_VRAM_W(plane);
    for (i = 0; i < PLANE_W * PLANE_H; i++) VDP_DATA_W = value;
}

void vdp_set_tile(u16 plane, u16 col, u16 row, u16 value)
{
    u16 addr = plane + (u16)(((row & (PLANE_H - 1)) * PLANE_W + (col & (PLANE_W - 1))) * 2);
    VDP_CTRL_L = VDP_VRAM_W(addr);
    VDP_DATA_W = value;
}

/* Una riga di celle consecutive: una sola impostazione dell'indirizzo. */
void vdp_map_row(u16 plane, u16 row, const u16 *src, u16 count, u16 first_col)
{
    u16 addr = plane + (u16)(((row & (PLANE_H - 1)) * PLANE_W + (first_col & (PLANE_W - 1))) * 2);
    u16 i;
    VDP_CTRL_L = VDP_VRAM_W(addr);
    for (i = 0; i < count; i++) VDP_DATA_W = *src++;
}

void vdp_scroll(s16 ax, s16 ay, s16 bx, s16 by)
{
    VDP_CTRL_L = VDP_VRAM_W(VRAM_HSCROLL);
    VDP_DATA_W = (u16)(-ax);
    VDP_DATA_W = (u16)(-bx);
    VDP_CTRL_L = VDP_VSRAM_W(0);
    VDP_DATA_W = (u16)ay;
    VDP_DATA_W = (u16)by;
}

/* Si aspetta il ritorno di quadro guardando il bit di stato del VDP, non il
   contatore delle interruzioni: se per un motivo qualunque l'interruzione
   scatta due volte, contarla farebbe perdere un quadro intero ogni giro. */
void vdp_wait_vblank(void)
{
    while (VDP_CTRL_W & 0x0008) { }      /* esce da quello in corso */
    while (!(VDP_CTRL_W & 0x0008)) { }   /* e aspetta il prossimo */
}

void vblank_isr(void)
{
    vblank_count++;
    psg_update();
}

/* ---------------------------------------------------------------- sprite */

void sprite_reset(void)
{
    sprite_count = 0;
}

void sprite_flush(void)
{
    u16 i;
    VDP_CTRL_L = VDP_VRAM_W(VRAM_SPRITES);
    if (sprite_count == 0) {
        /* una voce sola, invisibile, che chiude la catena */
        VDP_DATA_W = 0;
        VDP_DATA_W = 0;
        VDP_DATA_W = 0;
        VDP_DATA_W = 0;
        return;
    }
    sprites[sprite_count - 1].link = 0;
    for (i = 0; i < sprite_count; i++) {
        const Sprite *s = &sprites[i];
        VDP_DATA_W = s->y;
        VDP_DATA_W = (u16)(((u16)s->size << 8) | s->link);
        VDP_DATA_W = s->attr;
        VDP_DATA_W = s->x;
    }
}
