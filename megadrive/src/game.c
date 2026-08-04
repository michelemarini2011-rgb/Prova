/* La regia: stati della partita, onda d'urto, consegna al macchinario,
   portale, telecamera, sprite e pannello. */
#include "game.h"
#include "gfx.h"

#ifndef START_ARENA
#define START_ARENA 0            /* si può partire da un'altra cava per provarla */
#endif

Game game;

static Particle particles[MAX_PARTICLES];
static u8 particle_count;


static u16 hud_seconds;         /* per ridisegnare il pannello solo se serve */
static u8  hud_dirty;
static u8  window_full;         /* il riquadro copre tutto lo schermo? */

#define GRAB_DIST PXI(34)
#define SOLID_TILE TILE_ATTR(TILE_SOLID, 1, 1, 0, 0)

static void set_state(u8 state, u16 timer);
static void draw_card(void);
static void overlay_message(const char *line1, const char *line2);

/* ---------------------------------------------------------- particelle */

void particles_burst(fix x, fix y, u8 kind, u8 n, fix speed)
{
    u8 i;
    for (i = 0; i < n && particle_count < MAX_PARTICLES; i++) {
        Particle *q = &particles[particle_count++];
        u8 a = (u8)rnd();
        fix v = (speed >> 1) + ((speed * (rnd() & 63)) >> 7);
        q->x = x;
        q->y = y;
        q->vx = (cos_t(a) * v) >> 8;
        q->vy = (sin_t(a) * v) >> 8;
        q->life = q->max_life = 33;             /* poco più di mezzo secondo */
        q->kind = kind;
    }
}

/* La polvere della martellata: un anello che si allarga sul terreno. */
void particles_ring(fix x, fix y, u8 n)
{
    u8 i;
    for (i = 0; i < n && particle_count < MAX_PARTICLES; i++) {
        u8 a = (u8)(128 + (i * 128) / n);       /* mezzo giro, verso l'alto */
        fix v = VEL(160) + ((rnd() & 31) << 11);
        Particle *q = &particles[particle_count++];
        q->x = x;
        q->y = y;
        q->vx = (cos_t(a) * v) >> 8;
        q->vy = (((sin_t(a) * v) >> 8) * 77) >> 7;
        q->life = q->max_life = 27;
        q->kind = 0;
    }
}

void particles_update(void)
{
    u8 i = 0;
    while (i < particle_count) {
        Particle *q = &particles[i];
        if (--q->life == 0) {
            particles[i] = particles[--particle_count];
            continue;
        }
        q->x += q->vx;
        q->y += q->vy;
        q->vy += ACC(320);
        q->vx -= q->vx >> 5;                    /* un filo di attrito */
        i++;
    }
}

void particles_draw(void)
{
    u8 i;
    for (i = 0; i < particle_count; i++) {
        const Particle *q = &particles[i];
        s16 sx = TOI(q->x) - game.cam_x - 4;
        s16 sy = TOI(q->y) - game.cam_y + HUD_H - 4;
        u16 tile = q->kind ? TILE_SPARK : TILE_DUST;
        if (q->life * 3 < q->max_life) tile++;    /* verso la fine, più piccola */
        sprite_add(sx, sy, 1, 1, TILE_ATTR(tile, q->kind ? 1 : 0, 0, 0, 0));
    }
}

/* -------------------------------------------------------------- eventi */

void game_on_jump(void)
{
    sfx_play(SFX_JUMP);
}

void game_on_land(void)
{
    sfx_play(SFX_LAND);
    particles_burst(dwarf.x + FIX(DW_W / 2), dwarf.y + FIX(DW_H), 0, 3, VEL(90));
}

/* Il martello tocca terra: l'onda d'urto sbalza e stordisce. */
void game_on_hammer(fix px, fix py)
{
    u8 i, hit = 0;
    s16 ix = TOI(px), iy = TOI(py);

    game.hammers++;
    sfx_play(SFX_HAMMER);
    particles_ring(px, py, 6);

    /* chi è al traino non vola via, ma il colpo gli rinnova il torpore */
    if (dwarf.carrying >= 0) {
        Imp *c = &imps[dwarf.carrying];
        c->stun = arena->stun;
        particles_burst(c->x, c->y, 1, 3, VEL(110));
    }

    /* i blocchi irti si spostano solo così: a martellate */
    for (i = 0; i < block_count; i++) {
        Block *b = &blocks[i];
        s16 dx = TOI(b->x) + BLK_SIZE / 2 - ix;
        s16 dy = TOI(b->y) + BLK_SIZE / 2 - iy;
        /* distanza sull'ellisse dell'onda, in 1/256 di raggio */
        s32 kx = ((s32)dx << 8) / SHOCK_RX;
        s32 ky = ((s32)dy << 8) / SHOCK_RY;
        u32 k2 = (u32)(kx * kx + ky * ky);
        u16 k;
        if (k2 > 65536UL) continue;
        k = isqrt32(k2 << 8) >> 4;              /* 0..256 */
        b->vx += ((b->x + FIX(BLK_SIZE / 2) < px) ? -1 : 1) *
                 (VEL(250) * (256 - k) / 256 + VEL(120));
        if (b->vx > BLK_MAX_V) b->vx = BLK_MAX_V;
        if (b->vx < -BLK_MAX_V) b->vx = -BLK_MAX_V;
        particles_burst(b->x + FIX(BLK_SIZE / 2), b->y + FIX(BLK_SIZE), 0, 2, VEL(90));
    }

    for (i = 0; i < imp_count; i++) {
        Imp *im = &imps[i];
        s16 dx, dy;
        s32 kx, ky;
        u32 k2;
        u16 k;
        if (im->state == IMP_BOXED || im->state == IMP_CARRIED) continue;
        dx = TOI(im->x) - ix;
        dy = TOI(im->y) - iy;
        kx = ((s32)dx << 8) / SHOCK_RX;
        ky = ((s32)dy << 8) / SHOCK_RY;
        k2 = (u32)(kx * kx + ky * ky);
        if (k2 > 65536UL) continue;
        k = isqrt32(k2 << 8) >> 4;
        imp_shock(im, px, py, VEL(300) * (256 - k) / 256 + VEL(170), arena->stun);
        particles_burst(im->x, im->y, 1, 3, VEL(150));
        hit++;
    }
    if (hit) sfx_play(SFX_STUN);
}

/* ------------------------------------------------------------- partita */

static void game_lose(const char *reason)
{
    sfx_play(SFX_LOSE);
    game.death_msg = reason ? reason : "Gli spiritelli hanno avuto la meglio";
    set_state(ST_DEAD, 96);
}

static void check_carry(void)
{
    u8 i;
    if (dwarf.carrying >= 0) {
        Imp *c = &imps[dwarf.carrying];
        if (c->stun == 0) {                     /* si è svegliato per strada */
            imp_break_free(c);
            dwarf.carrying = -1;
            dwarf_hurt(c->x);                   /* spintone, nessun cuore perso */
            sfx_play(SFX_FREE);
        }
        return;
    }
    for (i = 0; i < imp_count; i++) {
        Imp *im = &imps[i];
        s16 dx, dy;
        if (im->state != IMP_STUNNED) continue;
        dx = TOI(im->x) - (TOI(dwarf.x) + DW_W / 2);
        dy = TOI(im->y) - (TOI(dwarf.y) + DW_H - 6);
        if (dx < 0) dx = -dx;
        if (dy < 0) dy = -dy;
        if (dx > GRAB_DIST || dy > 17) continue;
        im->state = IMP_CARRIED;
        dwarf.carrying = (s8)i;
        sfx_play(SFX_GRAB);
        break;
    }
}

static void check_contact(void)
{
    u8 i;
    for (i = 0; i < imp_count; i++) {
        Imp *im = &imps[i];
        s16 nx, ny, dx, dy;
        if (im->state != IMP_ROAM) continue;
        nx = TOI(im->x);
        ny = TOI(im->y);
        if (nx < TOI(dwarf.x)) nx = TOI(dwarf.x);
        if (nx > TOI(dwarf.x) + DW_W) nx = TOI(dwarf.x) + DW_W;
        if (ny < TOI(dwarf.y)) ny = TOI(dwarf.y);
        if (ny > TOI(dwarf.y) + DW_H) ny = TOI(dwarf.y) + DW_H;
        dx = TOI(im->x) - nx;
        dy = TOI(im->y) - ny;
        if (dx * dx + dy * dy > IMP_R * IMP_R) continue;
        if (dwarf.invuln) continue;
        dwarf_hurt(im->x);
        game.hearts--;
        hud_dirty = 1;
        sfx_play(SFX_HURT);
        particles_burst(dwarf.x + FIX(DW_W / 2), dwarf.y + FIX(DW_H / 2), 1, 5, VEL(160));
        im->vx = (im->x < dwarf.x + FIX(DW_W / 2)) ? -(fix)arena->speed * 2
                                                   : (fix)arena->speed * 2;
        im->vy = -VEL(160);
        if (game.hearts == 0) game_lose(0);
        return;
    }
}

/* Le punte non perdonano: un solo contatto e la cava ricomincia. */
static void check_spikes(void)
{
    u8 i;
    for (i = 0; i < block_count; i++) {
        Block *b = &blocks[i];
        if (dwarf.x + FIX(DW_W) <= b->x + FIX(2) ||
            dwarf.x >= b->x + FIX(BLK_SIZE - 2) ||
            dwarf.y + FIX(DW_H) <= b->y + FIX(2) ||
            dwarf.y >= b->y + FIX(BLK_SIZE - 2)) continue;
        game.hearts = 0;
        hud_dirty = 1;
        particles_burst(dwarf.x + FIX(DW_W / 2), dwarf.y + FIX(DW_H / 2), 1, 8, VEL(200));
        sfx_play(SFX_HURT);
        game_lose("Le punte del blocco non perdonano");
        return;
    }
}

static void check_machine(void)
{
    Imp *im;
    s16 dx, dy;
    if (dwarf.carrying < 0 || !has_machine) return;
    im = &imps[dwarf.carrying];
    dx = TOI(dwarf.x) + DW_W / 2 - intake_x;
    dy = TOI(dwarf.y) + DW_H / 2 - intake_y;
    if (dx * dx + dy * dy > 21 * 21) return;
    im->state = IMP_BOXED;
    dwarf.carrying = -1;
    game.boxed++;
    if (machine_crates < 9) machine_crates++;
    hud_dirty = 1;
    sfx_play(SFX_BOX);
    particles_burst(FIX(intake_x), FIX(intake_y), 1, 6, VEL(170));
}

static void update_camera(u8 snap)
{
    s16 max_x = WORLD_W - SCREEN_W;
    s16 max_y = (s16)arena_h - VIEW_H;
    s16 tx = TOI(dwarf.x) + DW_W / 2 - SCREEN_W / 2;
    s16 ty = TOI(dwarf.y) + DW_H / 2 - (VIEW_H * 55 / 100);

    if (max_x < 0) max_x = 0;
    if (max_y < 0) max_y = 0;
    if (tx < 0) tx = 0;
    if (tx > max_x) tx = max_x;
    if (ty < 0) ty = 0;
    if (ty > max_y) ty = max_y;

    if (snap) {
        game.cam_fx = FIX(tx);
        game.cam_fy = FIX(ty);
    } else {
        /* l'inseguimento tiene i decimali: arrotondando a ogni quadro la
           vista avanzerebbe a scatti di un pixel invece che di frazioni */
        game.cam_fx += SCALE(FIX(tx) - game.cam_fx, 23);
        game.cam_fy += SCALE(FIX(ty) - game.cam_fy, 23);
    }
    game.cam_x = TOI(game.cam_fx);
    game.cam_y = TOI(game.cam_fy);
}

static void update_play(void)
{
    u8 i;

    for (i = 0; i < plat_count; i++) plat_update(&plats[i]);
    dwarf_update();
    for (i = 0; i < block_count; i++) block_update(&blocks[i]);
    for (i = 0; i < imp_count; i++)
        if (imps[i].state != IMP_BOXED)
            imp_update(&imps[i], (u8)(((i + game.time) & 1) == 0));

    check_carry();
    check_spikes();
    if (game.state != ST_PLAY) return;
    check_contact();
    if (game.state != ST_PLAY) return;
    check_machine();
    update_camera(0);

    if (game.boxed >= game.total && !game.portal_open) {
        game.portal_open = 1;
        sfx_play(SFX_PORTAL);
    }
    if (game.portal_open) {
        s16 dx = TOI(dwarf.x) + DW_W / 2 - TOI(portal_x);
        s16 dy = TOI(dwarf.y) + DW_H - TOI(portal_y);
        if (dx < 0) dx = -dx;
        if (dy < 0) dy = -dy;
        if (dx < 15 && dy < 30) {
            sfx_play(SFX_CLEAR);
            set_state(ST_CLEAR, 60);
        }
    }
}

/* ------------------------------------------------------------- schermate */

static void window_rows(u8 full)
{
    window_full = full;
    vdp_window_rows(full ? 28 : (HUD_H / 8));
}

/* Il pannello si compone in memoria e poi va al VDP in due colpi di DMA.
   Scriverlo cella per cella dentro il ritorno di quadro non ci stava: la coda
   delle scritture finiva mentre il raster disegnava già la barra, e per un
   quadro se ne vedeva metà. */
static u16 hud_buf[2][40];

static void hud_icon(u16 col, const u16 *cell)
{
    hud_buf[0][col]     = TILE_ATTR(cell[0], 1, 1, 0, 0);
    hud_buf[0][col + 1] = TILE_ATTR(cell[1], 1, 1, 0, 0);
    hud_buf[1][col]     = TILE_ATTR(cell[2], 1, 1, 0, 0);
    hud_buf[1][col + 1] = TILE_ATTR(cell[3], 1, 1, 0, 0);
}

static void draw_hud(void)
{
    const char *name = arena ? arena->name : "";
    u16 i, n;

    for (i = 0; i < 40; i++) {
        hud_buf[0][i] = SOLID_TILE;
        hud_buf[1][i] = SOLID_TILE;
    }

    /* cuori e scatole: le icone sono alte due celle e coprono tutta la barra */
    for (i = 0; i < HEARTS; i++)
        hud_icon((u16)(1 + i * 2), &icon_cells[(i < game.hearts ? 0 : 1) * 4]);
    hud_icon(9, &icon_cells[2 * 4]);

    text_num_blit(hud_buf[0], 12, 40, game.boxed, 1, 1);
    text_blit(hud_buf[0], 13, 40, "/", 1);
    text_num_blit(hud_buf[0], 14, 40, game.total, 1, 1);
    text_num_blit(hud_buf[1], 12, 40, hud_seconds, 3, 1);
    text_blit(hud_buf[1], 16, 40, "s", 1);

    text_blit(hud_buf[0], 33, 40, "cava", 1);
    text_num_blit(hud_buf[0], 38, 40, (u16)(game.index + 1), 1, 1);
    n = text_len(name);
    if (n > 20) n = 20;
    text_blit(hud_buf[1], (u16)(39 - n), 40, name, 1);

    vdp_dma(hud_buf[0], VRAM_WINDOW, 40);
    vdp_dma(hud_buf[1], (u16)(VRAM_WINDOW + PLANE_W * 2), 40);
}

/* Una fascia piena dietro al testo, per staccarlo dal cielo. */
static void panel(u16 first_row, u16 rows)
{
    u16 row[40];
    u16 i;
    for (i = 0; i < 40; i++) row[i] = SOLID_TILE;
    for (i = 0; i < rows; i++) vdp_map_row(VRAM_WINDOW, first_row + i, row, 40, 0);
}

static void draw_title(void)
{
    u16 r, c;
    text_clear(VRAM_WINDOW, 0);
    /* il logo occupa 32 celle in larghezza: centrato, due righe più sotto */
    for (r = 0; r < 8; r++) {
        u16 line[32];
        for (c = 0; c < 32; c++) line[c] = TILE_ATTR(logo_map[r * 32 + c], 1, 1, 0, 0);
        vdp_map_row(VRAM_WINDOW, (u16)(3 + r), line, 32, 4);
    }
    panel(11, 11);
    text_center(VRAM_WINDOW, 12, "PREMI START PER COMINCIARE", 1);
    text_center(VRAM_WINDOW, 15, "croce direzionale: corri", 1);
    text_center(VRAM_WINDOW, 17, "B salta   A o C martella", 1);
    text_center(VRAM_WINDOW, 19, "gi\006 + B per scendere dalle assi", 1);
    text_center(VRAM_WINDOW, 21, "START mette in pausa", 1);

    /* striscia di terreno in fondo: il nano ci sta sopra a martellare */
    for (r = 0; r < 2; r++) {
        u16 line[40];
        for (c = 0; c < 20; c++) {
            /* maschera 14: terra chiusa a destra, sotto e a sinistra,
               aperta in cima — cioè un prato con la terra sotto */
            const u16 *cell = &terrain_cells[((c & 1) * 16 + 14) * 4];
            line[c * 2]     = TILE_ATTR(cell[r * 2], 0, 1, 0, 0);
            line[c * 2 + 1] = TILE_ATTR(cell[r * 2 + 1], 0, 1, 0, 0);
        }
        vdp_map_row(VRAM_WINDOW, (u16)(26 + r), line, 40, 0);
    }
}

static void draw_card(void)
{
    text_clear(VRAM_WINDOW, 0);
    switch (game.state) {
    case ST_INTRO:
        panel(7, 16);
        text_put(VRAM_WINDOW, 17, 8, "cava", 1);
        text_number(VRAM_WINDOW, 22, 8, (u16)(game.index + 1), 1, 1);
        text_center(VRAM_WINDOW, 10, arena->name, 1);
        text_wrap(VRAM_WINDOW, 13, arena->hint, 1, 34);
        text_put(VRAM_WINDOW, 6, 20, "spiritelli da inscatolare:", 1);
        text_number(VRAM_WINDOW, 33, 20, game.total, 1, 1);
        break;
    case ST_FINALE:
        panel(6, 16);
        text_center(VRAM_WINDOW, 8, "TUTTI INSCATOLATI", 1);
        text_center(VRAM_WINDOW, 11, "quattro cave ripulite in", 1);
        text_number(VRAM_WINDOW, 17, 13, (u16)(game.elapsed / 60), 3, 1);
        text_put(VRAM_WINDOW, 21, 13, "secondi", 1);
        text_center(VRAM_WINDOW, 15, "martellate:", 1);
        text_number(VRAM_WINDOW, 26, 15, game.hammers, 3, 1);
        if (game.best) {
            text_put(VRAM_WINDOW, 13, 17, "record:", 1);
            text_number(VRAM_WINDOW, 21, 17, game.best, 3, 1);
        }
        text_center(VRAM_WINDOW, 20, "START per ricominciare", 1);
        break;
    default:
        break;
    }
}

static void set_state(u8 state, u16 timer)
{
    game.state = state;
    game.timer = timer;
    switch (state) {
    case ST_PLAY:
        window_rows(0);
        hud_dirty = 1;
        break;
    case ST_DEAD:
        window_rows(0);
        overlay_message(game.death_msg, "si ricomincia la cava...");
        break;
    case ST_CLEAR:
        window_rows(0);
        overlay_message("cava ripulita!", 0);
        break;
    case ST_TITLE:
        window_rows(1);
        draw_title();
        break;
    default:
        window_rows(1);
        draw_card();
        break;
    }
}

/* ------------------------------------------------------------ caricamento */

static void load_arena(u8 index)
{
    u8 i;

    arena_load(index);
    game.index = index;
    dwarf_reset();
    for (i = 0; i < imp_count; i++) imp_reset(&imps[i]);
    for (i = 0; i < block_count; i++) {
        blocks[i].x = blocks[i].home_x;
        blocks[i].y = blocks[i].home_y;
        blocks[i].vx = blocks[i].vy = 0;
        blocks[i].on_ground = 0;
        blocks[i].rider = -1;
    }
    game.total = imp_count;
    game.boxed = 0;
    game.hearts = HEARTS;
    game.portal_open = 0;
    particle_count = 0;
    hud_seconds = (u16)(game.elapsed / 60);

    update_camera(1);
    arena_paint(game.cam_y, 1);
    set_state(ST_INTRO, 168);       /* 2,8 s di cartello */
}

static void game_start(void)
{
    game.hammers = 0;
    game.elapsed = 0;
    sfx_play(SFX_START);
    load_arena(START_ARENA);
}

static void game_finish(void)
{
    u16 score = (u16)(game.elapsed / 60);
    if (game.best == 0 || score < game.best) game.best = score;
    set_state(ST_FINALE, 0);
}

/* --------------------------------------------------------------- disegno */

static void draw_dwarf(void)
{
    u16 tile, frame;
    s16 sx, sy;
    fix sp = dwarf.vx < 0 ? -dwarf.vx : dwarf.vx;

    /* lampeggia quando è appena stato colpito */
    if (dwarf.invuln > 6 && dwarf.invuln < 81 && (dwarf.invuln & 4)) return;

    if (dwarf.swing) {
        frame = (u16)(((DW_SWING - dwarf.swing) * 4) / DW_SWING);
        if (frame > 3) frame = 3;
        tile = TILE_DWARF_HAMMER + frame * DWARF_FRAME_TILES;
    } else if (!dwarf.on_ground) {
        tile = TILE_DWARF_AIR + (dwarf.vy < 0 ? 0 : 1) * DWARF_FRAME_TILES;
    } else if (dwarf.carrying >= 0) {
        frame = (sp > VEL(14)) ? (u16)((dwarf.anim >> 8) & 1) : 0;
        tile = TILE_DWARF_AIR + (2 + frame) * DWARF_FRAME_TILES;
    } else if (sp > VEL(14)) {
        tile = TILE_DWARF_WALK + ((dwarf.anim >> 8) % 6) * DWARF_FRAME_TILES;
    } else {
        tile = TILE_DWARF_IDLE + ((dwarf.anim >> 8) & 1) * DWARF_FRAME_TILES;
    }

    sx = TOI(dwarf.x) + DW_W / 2 - 16 - game.cam_x;
    sy = TOI(dwarf.y) + DW_H - 32 + 3 - game.cam_y + HUD_H;
    sprite_add(sx, sy, 4, 4, TILE_ATTR(tile, 1, 0, dwarf.facing < 0, 0));
}

static void draw_imps(void)
{
    u8 i;
    for (i = 0; i < imp_count; i++) {
        const Imp *im = &imps[i];
        u16 row, frame, tile;
        if (im->state == IMP_BOXED) continue;
        if (im->state == IMP_STUNNED || im->state == IMP_CARRIED) {
            u8 waking = (im->stun < IMP_ALERT);
            row = (waking && (game.time & 4)) ? 2 : 1;
        } else {
            row = im->dive ? 2 : 0;
        }
        frame = (u16)((im->anim >> 8) & 3);
        tile = TILE_IMP + (row * 4 + frame) * IMP_FRAME_TILES;
        sprite_add(TOI(im->x) - 12 - game.cam_x,
                   TOI(im->y) - 12 - game.cam_y + HUD_H,
                   3, 3, TILE_ATTR(tile, 2, 0, 0, 0));
    }
}

static void draw_blocks(void)
{
    u8 i;
    for (i = 0; i < block_count; i++) {
        const Block *b = &blocks[i];
        sprite_add(TOI(b->x) + BLK_SIZE / 2 - 12 - game.cam_x,
                   TOI(b->y) + BLK_SIZE / 2 - 12 - game.cam_y + HUD_H,
                   3, 3, TILE_ATTR(TILE_HAZARD, 2, 0, 0, 0));
    }
}

static void draw_plats(void)
{
    u8 i;
    for (i = 0; i < plat_count; i++) {
        const Plat *p = &plats[i];
        u16 base = (p->cells >= 5) ? TILE_PLANK5 : TILE_PLANK4;
        u8 tiles = (u8)(p->cells * 2), done = 0;
        s16 sx = TOI(p->x) - game.cam_x;
        s16 sy = p->y - game.cam_y + HUD_H;
        while (done < tiles) {
            u8 n = (u8)((tiles - done > 4) ? 4 : tiles - done);
            sprite_add((s16)(sx + done * 8), sy, n, 1,
                       TILE_ATTR(base + done, 0, 0, 0, 0));
            done = (u8)(done + n);
        }
    }
}

static void draw_portal(void)
{
    s16 sx, sy;
    if (!game.portal_open) return;
    sx = TOI(portal_x) - 24 - game.cam_x;
    sy = TOI(portal_y) - 64 - game.cam_y + HUD_H;
    sprite_add(sx, sy, 3, 4, TILE_ATTR(TILE_PORTAL, 2, 0, 0, 0));
    sprite_add(sx, (s16)(sy + 32), 3, 4,
               TILE_ATTR(TILE_PORTAL + PORTAL_QUAD_TILES, 2, 0, 0, 0));
    sprite_add((s16)(sx + 24), sy, 3, 4,
               TILE_ATTR(TILE_PORTAL + 2 * PORTAL_QUAD_TILES, 2, 0, 0, 0));
    sprite_add((s16)(sx + 24), (s16)(sy + 32), 3, 4,
               TILE_ATTR(TILE_PORTAL + 3 * PORTAL_QUAD_TILES, 2, 0, 0, 0));
}

/* Le casse che si accatastano sul macchinario a ogni consegna. */
static void draw_crates(void)
{
    u8 i;
    if (!has_machine) return;
    for (i = 0; i < machine_crates && i < 9; i++) {
        s16 col = (s16)(i % 3), row = (s16)(i / 3);
        sprite_add((s16)(machine_x + 46 - col * 12 - game.cam_x),
                   (s16)(machine_y + 51 - row * 11 - game.cam_y + HUD_H),
                   2, 2, TILE_ATTR(TILE_CRATE, 0, 0, 0, 0));
    }
}

/* Frecce ai bordi per il macchinario e il portale quando sono fuori vista. */
static void draw_markers(void)
{
    s16 targets[2][2];
    u8 n = 0, i;
    if (dwarf.carrying >= 0 && has_machine) {
        targets[n][0] = intake_x;
        targets[n][1] = intake_y;
        n++;
    }
    if (game.portal_open) {
        targets[n][0] = TOI(portal_x);
        targets[n][1] = TOI(portal_y) - 30;
        n++;
    }
    for (i = 0; i < n; i++) {
        s16 sx = targets[i][0] - game.cam_x;
        s16 sy = targets[i][1] - game.cam_y;
        if (sx >= 8 && sx < SCREEN_W - 8 && sy >= 8 && sy < VIEW_H - 8) continue;
        if (sx < 8) sx = 8;
        if (sx > SCREEN_W - 16) sx = SCREEN_W - 16;
        if (sy < 8) sy = 8;
        if (sy > VIEW_H - 16) sy = VIEW_H - 16;
        if (game.time & 8)
            sprite_add(sx, (s16)(sy + HUD_H), 1, 1,
                       TILE_ATTR(TILE_SPARK, 1, 0, 0, 0));
    }
}

static void draw_world_sprites(u8 with_dwarf)
{
    sprite_reset();
    draw_portal();
    draw_crates();
    draw_plats();
    draw_blocks();
    draw_imps();
    if (with_dwarf) draw_dwarf();
    particles_draw();
    if (with_dwarf) draw_markers();
}

/* Il nano del titolo: martella, e lo spiritello schizza via a ogni colpo. */
static void draw_title_sprites(void)
{
    u16 beat = game.time % 108;                 /* 1,8 s di ciclo */
    u8 hammering = (beat < 42);
    u16 frame, tile;
    s16 k;

    sprite_reset();
    if (hammering) {
        frame = beat / 11;
        if (frame > 3) frame = 3;
        tile = TILE_DWARF_HAMMER + frame * DWARF_FRAME_TILES;
    } else {
        tile = TILE_DWARF_IDLE + ((game.time >> 4) & 1) * DWARF_FRAME_TILES;
    }
    sprite_add(56, 176, 4, 4, TILE_ATTR(tile, 1, 1, 0, 0));

    k = hammering ? 0 : (s16)((beat - 42) * 256 / 66);      /* 0..256 */
    tile = TILE_IMP + ((hammering ? 0 : 4) + ((game.time >> 3) & 3)) * IMP_FRAME_TILES;
    sprite_add((s16)(96 + (k * 80 >> 8)),
               (s16)(186 - (sin_t((u8)(k / 2)) * 44 >> 8)),
               3, 3, TILE_ATTR(tile, 2, 1, 0, 0));
}

/* Un messaggio breve sopra la cava, scritto nel piano di gioco: così la
   scena resta visibile dietro (il riquadro fisso coprirebbe tutto). */
static void overlay_message(const char *line1, const char *line2)
{
    u16 base_row = (u16)(((game.cam_y - HUD_H) >> 3) + 12);
    u16 base_col = (u16)(game.cam_x >> 3);
    u16 buf[40];
    u16 i, r;

    for (i = 0; i < 40; i++) buf[i] = SOLID_TILE;
    for (r = 0; r < 5; r++) vdp_map_row(VRAM_PLANE_A, base_row + r, buf, 40, base_col);

    for (r = 0; r < 2; r++) {
        const char *s = r ? line2 : line1;
        u16 n, col;
        if (!s) continue;
        n = text_len(s);
        if (n > 38) n = 38;
        col = (u16)(base_col + (40 - n) / 2);
        for (i = 0; i < n; i++) {
            u8 c = (u8)s[i];
            u16 tile = (c >= 32 && c < 127) ? TILE_FONT + (c - 32)
                     : (c >= 1 && c <= 6)   ? TILE_FONT + 95 + (c - 1)
                                            : TILE_FONT;
            buf[i] = TILE_ATTR(tile, 1, 1, 0, 0);
        }
        vdp_map_row(VRAM_PLANE_A, base_row + 1 + r * 2, buf, n, col);
    }
}

/* Il fondale scorre più piano della cava: la profondità a costo zero. */
static void update_backdrop_scroll(s16 *bx, s16 *by)
{
    s16 max_x = WORLD_W - SCREEN_W;
    s16 max_y = (s16)arena_h - VIEW_H;
    *bx = (max_x > 0) ? (s16)(((s32)game.cam_x * 192) / max_x) : 0;
    *by = (max_y > 0) ? (s16)(((s32)game.cam_y * 56) / max_y) : 0;
}

/* ----------------------------------------------------------------- ciclo */

void game_init(void)
{
    u16 i;

    vdp_init();
    pad_init();
    psg_init();

    for (i = 0; i < 4; i++) vdp_load_palette((u8)(i * 16), gfx_palettes[i], 16);
    vdp_load_tiles(0, gfx_tiles, GFX_TILE_COUNT);

    /* il fondale sta tutto nel piano B e non cambia più */
    for (i = 0; i < 32; i++) {
        u16 line[64];
        u16 c;
        for (c = 0; c < 64; c++) {
            u16 v = backdrop_map[i * 64 + c];
            line[c] = TILE_ATTR(v & 0x7FF, 3, 0, (v & 0x800) ? 1 : 0, 0);
        }
        vdp_map_row(VRAM_PLANE_B, i, line, 64, 0);
    }
    vdp_fill_plane(VRAM_PLANE_A, 0);
    text_clear(VRAM_WINDOW, 0);

    game.best = 0;
    game.elapsed = 0;
    game.time = 0;
    arena = &arenas[0];
    arena_rows = arena->rows;
    arena_h = (u16)(arena_rows * CELL);
    set_state(ST_TITLE, 0);

    vdp_display(1);
    set_sr(0x2000);
}

void game_frame(void)
{
    s16 bx, by, ax, ay;

    pad_read();
    game.time++;

    if (pad_pressed & PAD_START) {
        if (game.state == ST_TITLE) {
            game_start();
        } else if (game.state == ST_INTRO) {
            set_state(ST_PLAY, 0);
        } else if (game.state == ST_FINALE) {
            set_state(ST_TITLE, 0);
        } else if (game.state == ST_PLAY) {
            game.paused = !game.paused;
            if (game.paused) {
                overlay_message("pausa", "START riprende   A ricomincia");
            } else {
                arena_paint(game.cam_y, 1);   /* si ripulisce il messaggio */
                hud_dirty = 1;
            }
        }
    }

    if (game.paused) {
        if (pad_pressed & PAD_A) {
            game.paused = 0;
            load_arena(game.index);
        }
        vdp_wait_vblank();
        return;
    }

    switch (game.state) {
    case ST_TITLE:
        draw_title_sprites();
        break;
    case ST_INTRO:
        if (game.timer) game.timer--;
        if (game.timer == 0) set_state(ST_PLAY, 0);
        sprite_reset();
        break;
    case ST_PLAY:
        game.elapsed++;
        update_play();
        particles_update();
        if (game.state == ST_PLAY) draw_world_sprites(1);
        break;
    case ST_DEAD:
    case ST_CLEAR:
        if (game.timer) game.timer--;
        particles_update();
        draw_world_sprites(game.state == ST_CLEAR);
        if (game.timer == 0) {
            if (game.state == ST_DEAD) {
                load_arena(game.index);
            } else if (game.index + 1 < ARENA_COUNT) {
                load_arena((u8)(game.index + 1));
            } else {
                game_finish();
            }
        }
        break;
    case ST_FINALE:
        sprite_reset();
        break;
    default:
        break;
    }

    if (game.state == ST_PLAY) {
        u16 secs = (u16)(game.elapsed / 60);
        if (secs != hud_seconds) {
            hud_seconds = secs;
            hud_dirty = 1;
        }
    }

    update_backdrop_scroll(&bx, &by);
    ax = game.cam_x;
    ay = (s16)(game.cam_y - HUD_H);

    /* Tutto quello che tocca la memoria video sta dentro il ritorno di quadro:
       fuori, il VDP fa aspettare il processore e si vedrebbero le cuciture. */
    vdp_wait_vblank();
    if (game.state == ST_PLAY) arena_paint(game.cam_y, 0);
    vdp_scroll(ax, ay, bx, by);
    sprite_flush();
    if (hud_dirty && !window_full) {
        draw_hud();
        hud_dirty = 0;
    }
}
