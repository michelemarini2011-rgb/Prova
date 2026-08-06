/* La regia: stati della partita, onda d'urto, consegna al macchinario,
   portale, telecamera, sprite e pannello. */
#include "game.h"
#include "gfx.h"
#include "strings.h"

#ifndef START_ARENA
#define START_ARENA 0            /* si può partire da un'altra cava per provarla */
#endif

Game game;

static Particle particles[MAX_PARTICLES];
static u8 particle_count;


static u16 hud_seconds;         /* per ridisegnare il pannello solo se serve */
static u8  hud_dirty;
static u8  window_full;         /* il riquadro copre tutto lo schermo? */
static s16 enter_x, enter_y;    /* dov'era il nano quando ha toccato il portale */

#define GRAB_DIST PXI(34)
#define SOLID_TILE TILE_ATTR(TILE_SOLID, 1, 1, 0, 0)

/* Il portale: quanto dura la scena fra una cava e l'altra. */
#define CLEAR_FRAMES  126               /* 2,1 s in tutto */
#define SPIRAL_FRAMES 66                /* il nano che viene risucchiato */
#define SPIRAL_FRONT  50                /* fin qui gira davanti al portale */
#define SPIRAL_R      46                /* quanto si allarga il vortice */
#define FADE_FRAMES   18                /* la coda: lo schermo si spegne */

static void set_state(u8 state, u16 timer);
static void draw_card(void);
static void overlay_message(const char *line1, const char *line2);

/* ------------------------------------------------------------- sfumatura */

/* Le tavolozze si rimandano al VDP scurite: v * livello / 8, precalcolato,
   perché ottantasei divisioni per quadro non ci starebbero nel ritorno di
   quadro (e le componenti sono tre bit, quindi la tabella è minuscola). */
static const u8 dim[9][8] = {
    {0, 0, 0, 0, 0, 0, 0, 0}, {0, 0, 0, 0, 0, 0, 0, 0},
    {0, 0, 0, 0, 1, 1, 1, 1}, {0, 0, 0, 1, 1, 1, 2, 2},
    {0, 0, 1, 1, 2, 2, 3, 3}, {0, 0, 1, 1, 2, 3, 3, 4},
    {0, 0, 1, 2, 3, 3, 4, 5}, {0, 0, 1, 2, 3, 4, 5, 6},
    {0, 1, 2, 3, 4, 5, 6, 7},
};

static u8 fade_now = 8, fade_want = 8;

/* Un passo ogni due quadri: otto livelli fanno poco più di un quarto di
   secondo, il tempo giusto perché il buio si veda ma non annoi. */
static void fade_step(void)
{
    u16 pal[16];
    u8 p, i;
    if (fade_now == fade_want || (game.time & 1)) return;
    fade_now = (u8)(fade_now < fade_want ? fade_now + 1 : fade_now - 1);
    for (p = 0; p < 4; p++) {
        const u8 *d = dim[fade_now];
        for (i = 0; i < 16; i++) {
            u16 c = gfx_palettes[p][i];
            pal[i] = (u16)((d[(c >> 9) & 7] << 9) |
                           (d[(c >> 5) & 7] << 5) |
                           (d[(c >> 1) & 7] << 1));
        }
        vdp_load_palette((u8)(p * 16), pal, 16);
    }
}

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
        if (im->armor) {                        /* l'onda d'urto ci rimbalza */
            s16 adx = TOI(im->x) - ix, ady = TOI(im->y) - iy;
            if (adx * adx + ady * ady < (s16)(SHOCK_RX * SHOCK_RX)) {
                particles_burst(im->x, im->y, 1, 2, VEL(120));
                sfx_play(SFX_FREE);
            }
            continue;
        }
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
    game.death_msg = reason ? reason : TXT_LOST;
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

/* L'elmo non si toglie a martellate: bisogna saltarci sopra. È l'unico
   spiritello che si può toccare senza rimetterci un cuore, e solo dall'alto. */
static u8 check_stomp(void)
{
    u8 i;
    if (dwarf.vy <= 0) return 0;
    for (i = 0; i < imp_count; i++) {
        Imp *im = &imps[i];
        s16 dx, top, feet;
        if (!im->armor || im->state != IMP_ROAM) continue;
        dx = TOI(dwarf.x) + DW_W / 2 - TOI(im->x);
        if (dx < 0) dx = -dx;
        if (dx > IMP_R + DW_W / 2) continue;
        top = TOI(im->y) - IMP_R;
        feet = TOI(dwarf.y) + DW_H;
        if (feet < top - 8 || feet > top + 14) continue;
        im->armor = 0;
        im->vy = VEL(120);                      /* lo schiaccia un po' giù */
        dwarf.vy = -VEL(430);                   /* e il nano rimbalza */
        dwarf.jumping = 0;
        particles_burst(im->x, FIX(top), 1, 6, VEL(190));
        sfx_play(SFX_FREE);
        return 1;
    }
    return 0;
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

/* Le scintille in giro non uccidono come le punte: costano un cuore, come uno
   spiritello addosso. Sono ostacoli di percorso, non trappole mortali. */
static void check_orbits(void)
{
    u8 i;
    if (dwarf.invuln) return;
    for (i = 0; i < orbit_count; i++) {
        s16 sx, sy, dx, dy;
        orbit_pos(&orbits[i], &sx, &sy);
        dx = TOI(dwarf.x) + DW_W / 2 - sx;
        dy = TOI(dwarf.y) + DW_H / 2 - sy;
        if (dx < 0) dx = -dx;
        if (dy < 0) dy = -dy;
        if (dx > ORBIT_HURT || dy > ORBIT_HURT) continue;
        dwarf_hurt(FIX(sx));
        game.hearts--;
        hud_dirty = 1;
        sfx_play(SFX_HURT);
        particles_burst(FIX(sx), FIX(sy), 1, 4, VEL(150));
        if (game.hearts == 0) game_lose(TXT_BURNT);
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
        game_lose(TXT_SPIKES);
        return;
    }
}

static void box_imp(Imp *im)
{
    im->state = IMP_BOXED;
    game.boxed++;
    if (machine_crates < 9) machine_crates++;
    hud_dirty = 1;
    sfx_play(SFX_BOX);
    particles_burst(FIX(intake_x), FIX(intake_y), 1, 6, VEL(170));
}

static void check_machine(void)
{
    u8 i;
    s16 dx, dy;
    if (!has_machine) return;

    if (dwarf.carrying >= 0) {
        dx = TOI(dwarf.x) + DW_W / 2 - intake_x;
        dy = TOI(dwarf.y) + DW_H / 2 - intake_y;
        if (dx * dx + dy * dy <= 21 * 21) {
            box_imp(&imps[dwarf.carrying]);
            dwarf.carrying = -1;
        }
    }

    /* Uno spiritello addormentato che arriva da solo alla bocca vale come una
       consegna: è il nastro che fa il lavoro del nano, ed è tutto il senso di
       averlo messo. La soglia è più larga perché il muro del macchinario non
       lo lascia avvicinare oltre. */
    for (i = 0; i < imp_count; i++) {
        Imp *im = &imps[i];
        if (im->state != IMP_STUNNED) continue;
        dx = TOI(im->x) - intake_x;
        dy = TOI(im->y) - intake_y;
        if (dx * dx + dy * dy > 26 * 26) continue;
        box_imp(im);
    }
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
    for (i = 0; i < orbit_count; i++) orbit_update(&orbits[i]);
    dwarf_update();
    for (i = 0; i < block_count; i++) block_update(&blocks[i]);
    for (i = 0; i < imp_count; i++)
        if (imps[i].state != IMP_BOXED)
            imp_update(&imps[i], (u8)(((i + game.time) & 1) == 0));

    check_carry();
    check_spikes();
    if (game.state != ST_PLAY) return;
    check_orbits();
    if (game.state != ST_PLAY) return;
    /* la pestata sull'elmo vale per questo quadro: niente contatto */
    if (!check_stomp()) check_contact();
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
            enter_x = TOI(dwarf.x) + DW_W / 2;
            enter_y = TOI(dwarf.y) + DW_H / 2;
            sfx_play(SFX_CLEAR);
            set_state(ST_CLEAR, CLEAR_FRAMES);
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
    text_blit(hud_buf[1], 16, 40, TXT_SECONDS_SHORT, 1);

    /* la parola cambia con la lingua: il numero resta incollato al bordo */
    text_blit(hud_buf[0], (u16)(37 - text_len(TXT_CAVE)), 40, TXT_CAVE, 1);
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
        for (c = 0; c < 32; c++) line[c] = TILE_ATTR(LOGO_MAP[r * 32 + c], 1, 1, 0, 0);
        vdp_map_row(VRAM_WINDOW, (u16)(3 + r), line, 32, 4);
    }
    panel(11, 11);
    text_center(VRAM_WINDOW, 12, TXT_START, 1);
    text_center(VRAM_WINDOW, 15, TXT_HELP_MOVE, 1);
    text_center(VRAM_WINDOW, 17, TXT_HELP_JUMP, 1);
    text_center(VRAM_WINDOW, 19, TXT_HELP_DROP, 1);
    text_center(VRAM_WINDOW, 21, TXT_HELP_PAUSE, 1);

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

/* Una parola e un numero, centrati insieme. Le colonne non si possono più
   scrivere a mano: "martellate" e "blows" non sono lunghe uguali. */
static void label_num(u16 row, const char *label, u16 value, u8 digits)
{
    u16 n = text_len(label);
    u16 col = (u16)((40 - (n + 1 + digits)) / 2);
    text_put(VRAM_WINDOW, col, row, label, 1);
    text_number(VRAM_WINDOW, (u16)(col + n + 1), row, value, digits, 1);
}

static void num_label(u16 row, u16 value, u8 digits, const char *label)
{
    u16 n = text_len(label);
    u16 col = (u16)((40 - (digits + 1 + n)) / 2);
    text_number(VRAM_WINDOW, col, row, value, digits, 1);
    text_put(VRAM_WINDOW, (u16)(col + digits + 1), row, label, 1);
}

static void draw_card(void)
{
    text_clear(VRAM_WINDOW, 0);
    switch (game.state) {
    case ST_INTRO:
        panel(7, 16);
        label_num(8, TXT_CAVE, (u16)(game.index + 1), 1);
        text_center(VRAM_WINDOW, 10, arena->name, 1);
        text_wrap(VRAM_WINDOW, 13, arena->hint, 1, 34);
        label_num(20, TXT_IMPS_TO_BOX, game.total, 1);
        break;
    case ST_FINALE:
        panel(6, 16);
        text_center(VRAM_WINDOW, 8, TXT_FINALE, 1);
        text_center(VRAM_WINDOW, 11, TXT_FOUR_CAVES, 1);
        num_label(13, (u16)(game.elapsed / 60), 3, TXT_SECONDS);
        label_num(15, TXT_HAMMERS, game.hammers, 3);
        if (game.best) label_num(17, TXT_BEST, game.best, 3);
        text_center(VRAM_WINDOW, 20, TXT_AGAIN, 1);
        break;
    default:
        break;
    }
}

static void set_state(u8 state, u16 timer)
{
    game.state = state;
    game.timer = timer;
    /* lo schermo si spegne solo fra una cava e l'altra, e ci pensa ST_CLEAR:
       ovunque altro si torna alla luce piena */
    if (state != ST_CLEAR) fade_want = 8;
    switch (state) {
    case ST_PLAY:
        window_rows(0);
        hud_dirty = 1;
        break;
    case ST_DEAD:
        window_rows(0);
        overlay_message(game.death_msg, TXT_RETRY);
        break;
    case ST_CLEAR:
        window_rows(0);
        /* niente cartello subito: prima il nano deve sparire nel portale */
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
        /* l'elmo va prima: nella lista degli sprite chi viene prima sta
           davanti, e deve stare sulla testa, non dietro */
        if (im->armor)
            sprite_add(TOI(im->x) - 8 - game.cam_x,
                       TOI(im->y) - 10 - game.cam_y + HUD_H,
                       2, 1, TILE_ATTR(TILE_HELMET, 2, 0, 0, 0));
        sprite_add(TOI(im->x) - 12 - game.cam_x,
                   TOI(im->y) - 12 - game.cam_y + HUD_H,
                   3, 3, TILE_ATTR(tile, 2, 0, 0, 0));

        /* Lo svelto non ha un disegno suo: si riconosce dalla scintilla che
           si lascia dietro, messa dove si trovava quattro quadri fa. */
        if (im->kind == IMP_K_SWIFT && im->state == IMP_ROAM)
            sprite_add(TOI(im->x - (im->vx << 2)) - 4 - game.cam_x,
                       TOI(im->y - (im->vy << 2)) - 4 - game.cam_y + HUD_H,
                       1, 1, TILE_ATTR(TILE_SPARK + 1, 1, 0, 0, 0));

        /* Quanto manca al risveglio: nell'originale è un cerchio attorno allo
           spiritello, qui una barra sopra la testa — due celle da otto passi
           l'una, che il VDP disegna con un disegno già pronto per livello. */
        if (im->stun && arena->stun) {
            u16 left = (u16)(((u32)im->stun * 16) / arena->stun);
            s16 bx = TOI(im->x) - 8 - game.cam_x;
            s16 by = TOI(im->y) - 24 - game.cam_y + HUD_H;
            u8 c;
            if (left > 16) left = 16;
            for (c = 0; c < 2; c++) {
                s16 fill = (s16)left - (s16)(c * 8);
                if (fill < 0) fill = 0;
                if (fill > 8) fill = 8;
                sprite_add((s16)(bx + c * 8), by, 1, 1,
                           TILE_ATTR(TILE_BAR + fill, 1, 0, 0, 0));
            }
        }
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
        s16 shake = 0;
        if (p->kind == PLAT_CRUMBLE) {
            /* crepata da quando ci hai messo il piede, e sul finire trema */
            if (p->phase) {
                base = (p->cells >= 5) ? TILE_CRACK5 : TILE_CRACK4;
                if (p->phase > CRUMBLE_HOLD / 2) shake = (game.time & 2) ? 1 : -1;
            }
            /* caduta: si vede finire di sotto, poi sparisce e torna */
            if (!p->on && p->phase > CRUMBLE_HOLD + 45) continue;
        } else if (!p->on) continue;
        /* negli ultimi quaranta quadri lampeggia: il preavviso è la metà del
           gioco, senza sarebbe solo un tranello */
        if (p->kind == PLAT_BLINK && p->phase > BLINK_ON - BLINK_WARN &&
            (p->phase & 4)) continue;
        u8 tiles = (u8)(p->cells * 2), done = 0;
        s16 sx = TOI(p->x) - game.cam_x + shake;
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
    /* mentre inghiotte il nano l'ovale pulsa: due pixel bastano, e senza
       toccare i disegni */
    if (game.state == ST_CLEAR)
        sy += (s16)((sin_t((u8)(game.time * 20)) * 3) >> 8);
    sprite_add(sx, sy, 3, 4, TILE_ATTR(TILE_PORTAL, 2, 0, 0, 0));
    sprite_add(sx, (s16)(sy + 32), 3, 4,
               TILE_ATTR(TILE_PORTAL + PORTAL_QUAD_TILES, 2, 0, 0, 0));
    sprite_add((s16)(sx + 24), sy, 3, 4,
               TILE_ATTR(TILE_PORTAL + 2 * PORTAL_QUAD_TILES, 2, 0, 0, 0));
    sprite_add((s16)(sx + 24), (s16)(sy + 32), 3, 4,
               TILE_ATTR(TILE_PORTAL + 3 * PORTAL_QUAD_TILES, 2, 0, 0, 0));
}

/* Le scintille che girano, col loro perno: due disegni che esistono gia'. */
static void draw_orbits(void)
{
    u8 i;
    for (i = 0; i < orbit_count; i++) {
        const Orbit *o = &orbits[i];
        s16 sx, sy;
        sprite_add((s16)(o->cx - 4 - game.cam_x),
                   (s16)(o->cy - 4 - game.cam_y + HUD_H),
                   1, 1, TILE_ATTR(TILE_DUST + 1, 0, 0, 0, 0));
        orbit_pos(o, &sx, &sy);
        sprite_add((s16)(sx - 8 - game.cam_x),
                   (s16)(sy - 8 - game.cam_y + HUD_H),
                   2, 2, TILE_ATTR(TILE_FIRE + ((game.time >> 3) & 1) * 4,
                                   1, 0, 0, 0));
    }
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

/* Frecce ai bordi per il macchinario e il portale quando sono fuori vista.
   La freccia è una sola, da 16x16, che punta a destra: il VDP la ribalta per
   le altre tre direzioni. Rispetto a un pallino dice anche da che parte
   guardare, che è tutto il punto. */
#define MARK_M 12                       /* quanto sta staccata dal bordo */

static void draw_markers(void)
{
    s16 targets[2][2];
    u8 n = 0, i;
    /* un respiro lento, così l'occhio la trova senza che lampeggi */
    s16 bob = (s16)((sin_t((u8)(game.time * 3)) * 3) >> 8);

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
        s16 tx = targets[i][0] - game.cam_x;
        s16 ty = targets[i][1] - game.cam_y;
        s16 ax = tx, ay = ty, dx, dy;
        u16 tile;
        u8 hf = 0, vf = 0;

        if (tx >= 8 && tx < SCREEN_W - 8 && ty >= 8 && ty < VIEW_H - 8) continue;
        if (ax < MARK_M) ax = MARK_M;
        if (ax > SCREEN_W - MARK_M) ax = SCREEN_W - MARK_M;
        if (ay < MARK_M) ay = MARK_M;
        if (ay > VIEW_H - MARK_M) ay = VIEW_H - MARK_M;

        /* punta verso il bersaglio: comanda lo scostamento più grande */
        dx = tx - ax;
        dy = ty - ay;
        if ((dx < 0 ? -dx : dx) >= (dy < 0 ? -dy : dy)) {
            tile = TILE_ARROW_R;
            hf = (dx < 0);
            ax += hf ? -bob : bob;
        } else {
            tile = TILE_ARROW_U;
            vf = (dy > 0);
            ay += vf ? bob : -bob;
        }
        sprite_add((s16)(ax - 8), (s16)(ay - 8 + HUD_H), 2, 2,
                   TILE_ATTR(tile, 1, 0, hf, vf));
    }
}

/* Il nano risucchiato dal portale. Parte da dov'era, viene strappato in un
   giro largo attorno al portale — largo apposta: dentro l'ovale, che è di
   48x64, non si vedrebbe niente — e il giro si chiude fino al centro. Gli
   sprite del Mega Drive non si possono rimpicciolire, ma un vortice che si
   stringe racconta la stessa cosa. */
static void portal_spin(u16 t, s16 *px, s16 *py)
{
    s16 cx = TOI(portal_x);
    s16 cy = TOI(portal_y) - 30;
    u16 k = (u16)((t * 256) / SPIRAL_FRAMES);       /* 0..256 */
    /* il centro del vortice scivola da lui al cuore del portale */
    s16 bx = (s16)(enter_x + (((cx - enter_x) * (s16)k) >> 8));
    s16 by = (s16)(enter_y + (((cy - enter_y) * (s16)k) >> 8));
    /* il raggio nasce e muore a zero: comincia dove stava e finisce al centro */
    s16 r = (s16)((SPIRAL_R * sin_t((u8)(k >> 1))) >> 8);
    u8  a = (u8)(t * 6);                            /* un giro e mezzo abbondante */
    *px = (s16)(bx + ((cos_t(a) * r) >> 8));
    *py = (s16)(by + ((sin_t(a) * r) >> 8));
}

static void draw_dwarf_portal(u16 t)
{
    s16 wx, wy;
    u16 tile;
    u8 a = (u8)(t * 6);

    if (t >= SPIRAL_FRAMES) return;                 /* è dentro: non c'è più */
    portal_spin(t, &wx, &wy);
    /* i fotogrammi in aria, e il verso che si rovescia a ogni mezzo giro:
       da lontano è un nano che rotola dentro il portale */
    tile = TILE_DWARF_AIR + ((t >> 2) & 1) * DWARF_FRAME_TILES;
    sprite_add((s16)(wx - 16 - game.cam_x),
               (s16)(wy - 16 - game.cam_y + HUD_H),
               4, 4, TILE_ATTR(tile, 1, 0, (a & 128) != 0, 0));
}

enum { DWARF_NONE, DWARF_PLAY, DWARF_PORTAL };

static void draw_world_sprites(u8 mode, u16 t)
{
    /* Nella lista degli sprite chi viene prima sta davanti. Per quasi tutto il
       vortice il nano va messo prima del portale, o l'ovale se lo mangerebbe e
       non si vedrebbe girare; solo nell'ultimo pezzo passa dietro, ed è
       esattamente il momento in cui deve sparirci dentro. */
    sprite_reset();
    if (mode == DWARF_PORTAL && t < SPIRAL_FRONT) draw_dwarf_portal(t);
    draw_portal();
    draw_crates();
    draw_plats();
    draw_blocks();
    draw_orbits();
    draw_imps();
    if (mode == DWARF_PLAY) draw_dwarf();
    else if (mode == DWARF_PORTAL && t >= SPIRAL_FRONT) draw_dwarf_portal(t);
    particles_draw();
    if (mode == DWARF_PLAY) draw_markers();
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

/* Il nastro si anima senza toccare la mappa: i quattro disegni della cella
   stanno in memoria di lavoro e a turno finiscono nello stesso posto in
   memoria video. Ridipingere le celle costerebbe cento volte tanto. */
static void belt_animate(void)
{
    static u8 frame;
    if (game.time & 7) return;
    frame = (u8)((frame + 1) & 3);
    vdp_dma(belt_anim[frame], (u16)(VRAM_TILES + TILE_BELT * 32), 64);
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
                overlay_message(TXT_PAUSED, TXT_PAUSE_HELP);
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
        if (game.state == ST_PLAY) draw_world_sprites(DWARF_PLAY, 0);
        break;
    case ST_DEAD:
    case ST_CLEAR:
        if (game.timer) game.timer--;
        if (game.state == ST_CLEAR) {
            u16 t = (u16)(CLEAR_FRAMES - game.timer);
            /* una scia di scintille sul giro che sta facendo: senza, il
               vortice si legge solo se si guarda il nano */
            if (t < SPIRAL_FRAMES && (t % 3) == 0) {
                s16 wx, wy;
                portal_spin(t, &wx, &wy);
                particles_burst(FIX(wx), FIX(wy), 1, 1, VEL(70));
            }
            if (t == SPIRAL_FRAMES) {
                particles_ring(portal_x, portal_y - FIX(30), 10);
                overlay_message(TXT_CLEARED, 0);
            }
            if (game.timer == FADE_FRAMES) fade_want = 0;
        }
        particles_update();
        draw_world_sprites(game.state == ST_CLEAR ? DWARF_PORTAL : DWARF_NONE,
                           (u16)(CLEAR_FRAMES - game.timer));
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
    if (game.state == ST_PLAY) {
        arena_paint(game.cam_y, 0);
        belt_animate();
    }
    vdp_scroll(ax, ay, bx, by);
    sprite_flush();
    fade_step();
    if (hud_dirty && !window_full) {
        draw_hud();
        hud_dirty = 0;
    }
}
