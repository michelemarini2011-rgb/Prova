/* Accesso all'hardware del Mega Drive: VDP, joypad, PSG. */
#ifndef MD_H
#define MD_H

typedef signed char        s8;
typedef unsigned char      u8;
typedef signed short       s16;
typedef unsigned short     u16;
typedef signed long        s32;
typedef unsigned long      u32;

/* ------------------------------------------------------------------- VDP */
#define VDP_DATA_W   (*(volatile u16 *)0xC00000)
#define VDP_DATA_L   (*(volatile u32 *)0xC00000)
#define VDP_CTRL_W   (*(volatile u16 *)0xC00004)
#define VDP_CTRL_L   (*(volatile u32 *)0xC00004)
#define VDP_HV       (*(volatile u16 *)0xC00008)

/* Disposizione della VRAM (64 KB). I disegni stanno in fondo, le mappe in cima. */
#define VRAM_TILES     0x0000      /* fino a 0xB7FF: 1472 disegni da 8x8 */
#define VRAM_HSCROLL   0xB800
#define VRAM_SPRITES   0xBC00
#define VRAM_PLANE_A   0xC000      /* piano di gioco   64x32 celle */
#define VRAM_WINDOW    0xD000      /* riquadro fisso (punteggio, cartelli) */
#define VRAM_PLANE_B   0xE000      /* fondale */

#define PLANE_W        64          /* celle di 8 pixel */
#define PLANE_H        32
#define SCREEN_W       320
#define SCREEN_H       224

/* Comandi di scrittura verso il VDP: indirizzo + tipo di memoria. */
#define VDP_VRAM_W(a)  ((((u32)(a) & 0x3FFFu) << 16) | 0x40000000u | (((u32)(a) >> 14) & 3u))
#define VDP_CRAM_W(a)  ((((u32)(a) & 0x3FFFu) << 16) | 0xC0000000u | (((u32)(a) >> 14) & 3u))
#define VDP_VSRAM_W(a) ((((u32)(a) & 0x3FFFu) << 16) | 0x40000000u | 0x10u | (((u32)(a) >> 14) & 3u))

/* Voce della tavola dei nomi: disegno, tavolozza, priorità, ribaltamenti. */
#define TILE_ATTR(tile, pal, pri, hf, vf) \
    ((u16)((tile) | ((pal) << 13) | ((pri) << 15) | ((hf) << 11) | ((vf) << 12)))

/* Colore a 9 bit: tre bit per componente, 0..7. */
#define MD_COLOR(r, g, b) ((u16)(((b) << 9) | ((g) << 5) | ((r) << 1)))

void vdp_init(void);
void vdp_reg(u8 reg, u8 value);
void vdp_load_tiles(u16 first, const u32 *data, u16 count);
void vdp_load_palette(u8 index, const u16 *colors, u16 count);
void vdp_fill_plane(u16 plane, u16 value);
void vdp_map_row(u16 plane, u16 row, const u16 *src, u16 count, u16 first_col);
void vdp_dma(const void *src, u16 vram_addr, u16 words);
void vdp_set_tile(u16 plane, u16 col, u16 row, u16 value);
void vdp_scroll(s16 plane_a_x, s16 plane_a_y, s16 plane_b_x, s16 plane_b_y);
void vdp_display(u8 on);
void vdp_window_rows(u8 rows);
void vdp_wait_vblank(void);
void vdp_backdrop(u8 color_index);
void set_sr(u16 sr);            /* 0x2000 accende le interruzioni */

extern volatile u16 vblank_count;

/* ---------------------------------------------------------------- sprite */
#define SPRITE_MAX 80

typedef struct {
    u16 y;
    u8  size;     /* (larghezza-1)<<2 | (altezza-1), in celle */
    u8  link;
    u16 attr;
    u16 x;
} Sprite;

extern Sprite sprites[SPRITE_MAX];
extern u16    sprite_count;

void sprite_reset(void);
void sprite_flush(void);

/* Aggiunge uno sprite alla lista del quadro. Sta in linea perché la regia la
   chiama una cinquantina di volte per quadro e il solo passaggio dei cinque
   argomenti sulla pila costerebbe più del lavoro che fa. */
static inline void sprite_add(s16 x, s16 y, u8 w_cells, u8 h_cells, u16 attr)
{
    Sprite *s;
    if (sprite_count >= SPRITE_MAX) return;
    /* fuori schermo: non vale la pena occupare una voce */
    if (x <= -32 || x >= SCREEN_W || y <= -32 || y >= SCREEN_H) return;
    s = &sprites[sprite_count];
    s->y = (u16)(y + 128);
    s->size = (u8)(((w_cells - 1) << 2) | (h_cells - 1));
    s->link = (u8)(sprite_count + 1);
    s->attr = attr;
    s->x = (u16)(x + 128);
    sprite_count++;
}

/* --------------------------------------------------------------- joypad */
#define PAD_UP     0x01
#define PAD_DOWN   0x02
#define PAD_LEFT   0x04
#define PAD_RIGHT  0x08
#define PAD_B      0x10
#define PAD_C      0x20
#define PAD_A      0x40
#define PAD_START  0x80

extern u16 pad_state;    /* tasti tenuti premuti */
extern u16 pad_pressed;  /* tasti premuti in questo quadro */

void pad_init(void);
void pad_read(void);

/* ------------------------------------------------------------------ suono */
void psg_init(void);
void psg_update(void);
void sfx_play(u8 id);

#define SFX_HAMMER  0
#define SFX_JUMP    1
#define SFX_LAND    2
#define SFX_STUN    3
#define SFX_GRAB    4
#define SFX_BOX     5
#define SFX_HURT    6
#define SFX_FREE    7
#define SFX_PORTAL  8
#define SFX_LOSE    9
#define SFX_START   10
#define SFX_CLEAR   11

#endif
