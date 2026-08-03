/* Generato da tools/md_levels.py — non modificare a mano. */
#ifndef LEVELS_H
#define LEVELS_H
#include "md.h"

#define ARENA_COUNT 4
#define ARENA_COLS  30

/* Codici delle celle. */
#define CELL_EMPTY    0
#define CELL_SOLID    1
#define CELL_ONEWAY   2
#define CELL_MOVER    3
#define CELL_BLOCK    4
#define CELL_SPAWN    5
#define CELL_START    6
#define CELL_PORTAL   7
#define CELL_MACHINE  8
#define CELL_DECOR_B  9
#define CELL_DECOR_R  10
#define CELL_DECOR_F  11

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
