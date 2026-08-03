/* Generato da tools/md_assets.py — non modificare a mano. */
#ifndef GFX_H
#define GFX_H
#include "md.h"

#define GFX_TILE_COUNT 1166
extern const u32 gfx_tiles[9328];
extern const u16 gfx_palettes[4][16];

extern const u16 terrain_cells[];   /* 32 celle x 4 disegni */
extern const u16 oneway_cell[];
extern const u16 decor_cells[];     /* 3 celle x 4 */
extern const u16 ground_cells[];    /* 2 celle x 4 */
extern const u16 machine_map[];     /* 8x8 celle */
extern const u16 backdrop_map[];    /* 64x32 celle */
extern const u16 logo_map[];        /* 32x8 celle */
extern const u16 icon_cells[];      /* 4 icone x 4 disegni */

#define TILE_FONT      4
#define FONT_CHARS     101
#define TILE_EMPTY     0
#define TILE_SOLID     1
#define TILE_DUST      2
#define TILE_SPARK     3
#define TILE_CRATE     303
#define TILE_PLANK4    307
#define TILE_PLANK5    315
#define TILE_DWARF_IDLE   325
#define TILE_DWARF_WALK   357
#define TILE_DWARF_HAMMER 453
#define TILE_DWARF_AIR    517
#define DWARF_FRAME_TILES 16
#define TILE_IMP       581
#define IMP_FRAME_TILES 9
#define TILE_PORTAL    689
#define PORTAL_QUAD_TILES 12
#define TILE_HAZARD    737

#endif
