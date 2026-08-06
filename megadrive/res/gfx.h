/* Generato da tools/md_assets.py — non modificare a mano. */
#ifndef GFX_H
#define GFX_H
#include "md.h"

#define GFX_TILE_COUNT 1383
extern const u32 gfx_tiles[11064];
extern const u16 gfx_palettes[4][16];
#define THEME_COUNT 4
extern const u16 theme_palettes[THEME_COUNT][2][16];

extern const u16 terrain_cells[];   /* 32 celle x 4 disegni */
extern const u16 oneway_cell[];
extern const u16 decor_cells[];     /* 3 celle x 4 */
extern const u16 ground_cells[];    /* 2 celle x 4 */
extern const u16 machine_map[];     /* 8x8 celle */
extern const u16 backdrop_map[];    /* 64x32 celle */
extern const u16 logo_map[];        /* 32x8 celle */
extern const u16 logo_map_en[];     /* lo stesso, in inglese */
extern const u16 icon_cells[];      /* 4 icone x 4 disegni */
extern const u32 belt_anim[4][32];  /* i fotogrammi del nastro */

#define TILE_FONT      61
#define FONT_CHARS     101
#define TILE_EMPTY     0
#define TILE_SOLID     1
#define TILE_DUST      2
#define TILE_SPARK     4
#define TILE_ARROW_R   6   /* 2x2, punta a destra */
#define TILE_ARROW_U   10   /* 2x2, punta in alto */
#define TILE_BAR       52   /* 9 livelli, da vuoto a pieno */
#define TILE_FIRE      44   /* 2x2, due fotogrammi */
#define TILE_HELMET    14   /* 3x1, sopra lo spiritello */
#define TILE_BELT      16   /* 2x2, si anima in DMA */
#define TILE_CRACK4    382
#define TILE_CRACK5    390
#define TILE_BAT       20   /* 2x2, due fotogrammi */
#define TILE_MOLE      28  /* 2x2, fuori e a metà */
#define TILE_CART      36   /* 4x2 */
#define TILE_CRATE     360
#define TILE_PLANK4    364
#define TILE_PLANK5    372
#define TILE_DWARF_IDLE   400
#define TILE_DWARF_WALK   432
#define TILE_DWARF_HAMMER 528
#define TILE_DWARF_AIR    592
#define DWARF_FRAME_TILES 16
#define TILE_IMP       656
#define IMP_FRAME_TILES 9
#define TILE_PORTAL    764
#define PORTAL_QUAD_TILES 12
#define TILE_HAZARD    812

#endif
