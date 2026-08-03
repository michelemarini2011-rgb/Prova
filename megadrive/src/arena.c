/* La cava: lettura della mappa, disegno del terreno nel piano di gioco e
   scorrimento verticale (il piano del VDP è alto 256 pixel, le cave arrivano
   a 768: le righe si ridipingono mentre la vista sale). */
#include "game.h"
#include "gfx.h"

const ArenaDef *arena;
const u8 *arena_row[MAX_ARENA_ROWS];
u16 arena_rows, arena_h;
fix start_x, start_y;
fix portal_x, portal_y;
s16 machine_x, machine_y;
s16 intake_x, intake_y;
u8  machine_crates;
u8  has_machine;

static s16 painted_lo, painted_hi;      /* righe di celle già dipinte */

/* Le celle coperte dal macchinario restano solide ma le disegna lui. */
u8 arena_under_machine(s16 cx, s16 cy)
{
    s16 x, y;
    if (!has_machine) return 0;
    x = cx * CELL + CELL / 2;
    y = cy * CELL + CELL / 2;
    return (x > machine_x && x < machine_x + 64 &&
            y > machine_y && y < machine_y + 64);
}

/* --------------------------------------------------------------- disegno */

/* Le due righe di celle da 8 pixel che compongono una riga della mappa. */
static void paint_row(s16 row)
{
    u16 top[COLS * 2], bottom[COLS * 2];
    s16 cx;

    for (cx = 0; cx < COLS; cx++) {
        const u16 *cell = 0;
        u8 pal = 0;
        u8 c = arena_cell(cx, row);

        if (arena_under_machine(cx, row)) {
            s16 lx = (cx * CELL - machine_x) >> 3;
            s16 ly = (row * CELL - machine_y) >> 3;
            top[cx * 2]     = TILE_ATTR(machine_map[ly * 8 + lx], 3, 0, 0, 0);
            top[cx * 2 + 1] = TILE_ATTR(machine_map[ly * 8 + lx + 1], 3, 0, 0, 0);
            bottom[cx * 2]     = TILE_ATTR(machine_map[(ly + 1) * 8 + lx], 3, 0, 0, 0);
            bottom[cx * 2 + 1] = TILE_ATTR(machine_map[(ly + 1) * 8 + lx + 1], 3, 0, 0, 0);
            continue;
        }

        if (c == CELL_SOLID || c == CELL_MACHINE) {
            u8 mask = (u8)((arena_solid(cx, row - 1) ? 1 : 0) |
                           (arena_solid(cx + 1, row) ? 2 : 0) |
                           (arena_solid(cx, row + 1) ? 4 : 0) |
                           (arena_solid(cx - 1, row) ? 8 : 0));
            u8 variant = (u8)((cx * 5 + row * 11) & 1);
            cell = &terrain_cells[(variant * 16 + mask) * 4];
        } else if (c == CELL_ONEWAY) {
            cell = oneway_cell;
        } else if (c >= CELL_DECOR_B && c <= CELL_DECOR_F) {
            cell = &decor_cells[(c - CELL_DECOR_B) * 4];
        }

        if (cell) {
            top[cx * 2]        = TILE_ATTR(cell[0], pal, 0, 0, 0);
            top[cx * 2 + 1]    = TILE_ATTR(cell[1], pal, 0, 0, 0);
            bottom[cx * 2]     = TILE_ATTR(cell[2], pal, 0, 0, 0);
            bottom[cx * 2 + 1] = TILE_ATTR(cell[3], pal, 0, 0, 0);
        } else {
            top[cx * 2] = top[cx * 2 + 1] = 0;
            bottom[cx * 2] = bottom[cx * 2 + 1] = 0;
        }
    }

    vdp_map_row(VRAM_PLANE_A, (u16)(row * 2), top, COLS * 2, 0);
    vdp_map_row(VRAM_PLANE_A, (u16)(row * 2 + 1), bottom, COLS * 2, 0);
}

/* Tiene dipinte le sedici righe attorno alla vista. Con 'all' ridipinge tutto
   (a inizio cava), altrimenti aggiunge solo le righe appena entrate. */
void arena_paint(s16 cam_y, u8 all)
{
    s16 first = cam_y >> CELL_BITS;
    s16 last = (cam_y + VIEW_H - 1) >> CELL_BITS;
    s16 r;

    if (all) {
        painted_lo = first;
        painted_hi = first + 15;
        for (r = painted_lo; r <= painted_hi; r++) paint_row(r);
        return;
    }

    while (first < painted_lo) {
        painted_lo--;
        paint_row(painted_lo);
        if (painted_hi - painted_lo >= 16) painted_hi--;
    }
    while (last > painted_hi) {
        painted_hi++;
        paint_row(painted_hi);
        if (painted_hi - painted_lo >= 16) painted_lo++;
    }
}

/* ------------------------------------------------------------ caricamento */

void arena_load(u8 index)
{
    s16 cx, cy;
    u8 mover_index = 0;

    arena = &arenas[index];
    arena_rows = arena->rows;
    arena_h = (u16)(arena_rows * CELL);
    for (cy = 0; cy < (s16)arena_rows && cy < MAX_ARENA_ROWS; cy++)
        arena_row[cy] = arena->map + cy * COLS;

    imp_count = 0;
    block_count = 0;
    plat_count = 0;
    has_machine = 0;
    machine_crates = 0;
    start_x = FIX(CELL * 2);
    start_y = FIX(CELL * 12);
    portal_x = FIX(WORLD_W / 2);
    portal_y = FIX(CELL * 13);

    for (cy = 0; cy < (s16)arena_rows; cy++) {
        for (cx = 0; cx < COLS; cx++) {
            u8 c = arena_cell(cx, cy);
            fix cxpix = FIX(cx * CELL + CELL / 2);

            switch (c) {
            case CELL_START:
                start_x = cxpix;
                start_y = FIX((cy + 1) * CELL);
                break;
            case CELL_PORTAL:
                portal_x = cxpix;
                portal_y = FIX((cy + 1) * CELL);
                break;
            case CELL_SPAWN:
                if (imp_count < MAX_IMPS) {
                    Imp *im = &imps[imp_count++];
                    im->home_x = cxpix;
                    im->home_y = FIX(cy * CELL + CELL / 2);
                }
                break;
            case CELL_BLOCK:
                if (block_count < MAX_BLOCKS) {
                    Block *b = &blocks[block_count++];
                    b->home_x = FIX(cx * CELL);
                    b->home_y = FIX(cy * CELL + 1);
                }
                break;
            case CELL_MOVER:
                if (arena_cell(cx - 1, cy) != CELL_MOVER && plat_count < MAX_PLATS) {
                    Plat *p = &plats[plat_count++];
                    u8 n = 1;
                    while (arena_cell(cx + n, cy) == CELL_MOVER) n++;
                    p->cells = n;
                    p->x = FIX(cx * CELL);
                    p->y = (s16)(cy * CELL);
                    p->w = (s16)(n * CELL);
                    /* una sì e una no parte verso sinistra */
                    p->vx = (mover_index & 1) ? -(fix)arena->plat_speed
                                              : (fix)arena->plat_speed;
                    p->dx = 0;
                    mover_index++;
                }
                break;
            case CELL_MACHINE:
                has_machine = 1;
                machine_x = (s16)(cx * CELL);
                machine_y = (s16)(cy * CELL);
                intake_x = (s16)(cx * CELL + 8);
                intake_y = (s16)(cy * CELL + 47);
                break;
            default:
                break;
            }
        }
    }
}
