/* Generato da tools/md_levels.py — non modificare a mano. */
#ifndef LEVELS_H
#define LEVELS_H
#include "md.h"

#define ARENA_COUNT 16
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
#define CELL_LIFT     12
#define CELL_BLINK_A  13
#define CELL_BLINK_B  14
#define CELL_SWIFT    15
#define CELL_ORBIT    16
#define CELL_CRUMBLE  17
#define CELL_BELT_R   18
#define CELL_BELT_L   19
#define CELL_ARMOR    20
#define CELL_BAT      21
#define CELL_MOLE     22
#define CELL_CART     23
#define CELL_BOSS     24

typedef struct {
    const char *name;
    const char *hint;
    const u8   *map;
    u16 rows;
    u16 stun;        /* durata del torpore, in quadri */
    u16 speed;       /* velocità degli spiritelli, 8.8 px/quadro */
    u16 plat_speed;  /* velocità delle assi mobili */
    u8  boss;        /* 0 nessuno, 1 golem, 2 verme, 3 regina */
} ArenaDef;

extern const ArenaDef arenas[ARENA_COUNT];

#endif
