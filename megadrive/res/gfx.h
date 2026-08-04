/* Generato da tools/md_assets.py — non modificare a mano. */
#ifndef GFX_H
#define GFX_H
#include "md.h"

#define GFX_TILE_COUNT 1327
extern const u32 gfx_tiles[10616];
extern const u16 gfx_palettes[4][16];

extern const u16 terrain_cells[];   /* 32 celle x 4 disegni */
extern const u16 oneway_cell[];
extern const u16 decor_cells[];     /* 3 celle x 4 */
extern const u16 ground_cells[];    /* 2 celle x 4 */
extern const u16 machine_map[];     /* 8x8 celle */
extern const u16 backdrop_map[];    /* 64x32 celle */
extern const u16 logo_map[];        /* 32x8 celle */
extern const u16 logo_map_en[];     /* lo stesso, in inglese */
extern const u16 icon_cells[];      /* 4 icone x 4 disegni */

#define TILE_FONT      23
#define FONT_CHARS     101
#define TILE_EMPTY     0
#define TILE_SOLID     1
#define TILE_DUST      2
#define TILE_SPARK     4
#define TILE_ARROW_R   6   /* 2x2, punta a destra */
#define TILE_ARROW_U   10   /* 2x2, punta in alto */
#define TILE_BAR       14   /* 9 livelli, da vuoto a pieno */
#define TILE_CRATE     322
#define TILE_PLANK4    326
#define TILE_PLANK5    334
#define TILE_DWARF_IDLE   344
#define TILE_DWARF_WALK   376
#define TILE_DWARF_HAMMER 472
#define TILE_DWARF_AIR    536
#define DWARF_FRAME_TILES 16
#define TILE_IMP       600
#define IMP_FRAME_TILES 9
#define TILE_PORTAL    708
#define PORTAL_QUAD_TILES 12
#define TILE_HAZARD    756

#endif
