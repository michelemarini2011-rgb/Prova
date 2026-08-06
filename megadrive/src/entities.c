/* Il nano, gli spiritelli, i blocchi irti e le assi mobili: gli stessi
   movimenti dell'originale, rifatti a numeri interi. */
#include "game.h"

Dwarf dwarf;
Imp   imps[MAX_IMPS];
Block blocks[MAX_BLOCKS];
Plat  plats[MAX_PLATS];
Orbit orbits[MAX_ORBITS];
Bat   bats[MAX_BATS];
u8 imp_count, block_count, plat_count, orbit_count, bat_count;

void game_on_hammer(fix x, fix y);
void game_on_jump(void);
void game_on_land(void);

/* Appoggia un corpo su un'asse mobile, se in questo passo ne ha attraversato
   il piano dall'alto. Restituisce l'asse, oppure zero. */
Plat *land_on(fix x, fix y, s16 w, s16 h, fix vy, fix prev_bottom, u8 dropping)
{
    u8 i;
    if (vy < 0 || dropping) return 0;
    for (i = 0; i < plat_count; i++) {
        Plat *p = &plats[i];
        fix px = p->x;
        fix bottom = y + FIX(h);
        if (!p->on) continue;                           /* quella spenta non c'è */
        if (x + FIX(w) <= px + FIX(2) || x >= px + FIX(p->w - 2)) continue;
        if (prev_bottom > FIX(p->y + 4)) continue;      /* era già sotto */
        if (bottom < FIX(p->y) || bottom > FIX(p->y + 12)) continue;
        return p;
    }
    return 0;
}

/* ------------------------------------------------------------------ nano */

void dwarf_reset(void)
{
    dwarf.x = start_x - FIX(DW_W / 2);
    dwarf.y = start_y - FIX(DW_H);
    dwarf.vx = dwarf.vy = 0;
    dwarf.facing = 1;
    dwarf.on_ground = dwarf.on_oneway = 0;
    dwarf.coyote = dwarf.buffer = dwarf.jumping = 0;
    dwarf.drop_timer = 0;
    dwarf.anim = 0;
    dwarf.swing = dwarf.swung = 0;
    dwarf.carrying = -1;
    dwarf.invuln = dwarf.hit_flash = 0;
    dwarf.buffer_down = 0;
    dwarf.rider = -1;
}

void dwarf_hurt(fix from_x)
{
    if (dwarf.invuln) return;
    dwarf.invuln = DW_INVULN;
    dwarf.vx = (dwarf.x + FIX(DW_W / 2) < from_x) ? -VEL(260) : VEL(260);
    dwarf.vy = -VEL(240);
    dwarf.hit_flash = 18;
}

static void dwarf_move_x(fix dx)
{
    s16 x0, x1, y0, y1, tx, ty;
    if (!dx) return;
    dwarf.x += dx;
    x0 = TOI(dwarf.x) >> CELL_BITS;
    x1 = (TOI(dwarf.x) + DW_W - 1) >> CELL_BITS;
    y0 = TOI(dwarf.y) >> CELL_BITS;
    y1 = (TOI(dwarf.y) + DW_H - 1) >> CELL_BITS;
    for (ty = y0; ty <= y1; ty++) {
        for (tx = x0; tx <= x1; tx++) {
            if (!arena_solid(tx, ty)) continue;
            if (dx > 0) dwarf.x = FIX(tx * CELL - DW_W);
            else        dwarf.x = FIX((tx + 1) * CELL);
            dwarf.vx = 0;
            return;
        }
    }
}

static void dwarf_move_y(fix dy)
{
    fix prev_bottom = dwarf.y + FIX(DW_H);
    s16 x0, x1, y0, y1, tx, ty;
    Plat *p;

    dwarf.y += dy;
    dwarf.on_ground = 0;
    dwarf.on_oneway = 0;
    x0 = TOI(dwarf.x) >> CELL_BITS;
    x1 = (TOI(dwarf.x) + DW_W - 1) >> CELL_BITS;
    y0 = TOI(dwarf.y) >> CELL_BITS;
    y1 = (TOI(dwarf.y) + DW_H - 1) >> CELL_BITS;
    for (ty = y0; ty <= y1; ty++) {
        for (tx = x0; tx <= x1; tx++) {
            u8 solid = arena_solid(tx, ty);
            u8 oneway = arena_oneway(tx, ty);
            if (!solid && !oneway) continue;
            if (oneway) {
                if (dy <= 0 || dwarf.drop_timer) continue;
                if (prev_bottom > FIX(ty * CELL + 3)) continue;
            }
            if (dy > 0) {
                dwarf.y = FIX(ty * CELL - DW_H);
                dwarf.on_ground = 1;
                dwarf.on_oneway = oneway;
            } else if (dy < 0) {
                if (oneway) continue;
                dwarf.y = FIX((ty + 1) * CELL);
            }
            dwarf.vy = 0;
            return;
        }
    }

    /* niente terreno: resta l'asse mobile, su cui si sale dall'alto */
    p = land_on(dwarf.x, dwarf.y, DW_W, DW_H, dwarf.vy, prev_bottom, dwarf.drop_timer);
    if (p) {
        /* il peso del nano è quello che fa partire il conto alla rovescia */
        if (p->kind == PLAT_CRUMBLE && p->phase == 0) p->phase = 1;
        dwarf.y = FIX(p->y - DW_H);
        dwarf.vy = 0;
        dwarf.on_ground = 1;
        dwarf.on_oneway = 1;        /* col basso più salto ci si lascia cadere */
        dwarf.rider = (s8)(p - plats);
    }
}

void dwarf_update(void)
{
    s16 dir;
    fix max_speed, accel;
    u8 was_on_ground;

    if (dwarf.invuln) dwarf.invuln--;
    if (dwarf.hit_flash) dwarf.hit_flash--;
    if (dwarf.drop_timer) dwarf.drop_timer--;

    /* trasportato dall'asse sotto i piedi, che si è già mossa */
    if (dwarf.rider >= 0) {
        Plat *p = &plats[dwarf.rider];
        if (p->dx) dwarf_move_x(p->dx);
        /* l'ascensore lo porta su e giù: il passo passa dalla stessa
           risoluzione delle collisioni, o salendo lo infilerebbe nel soffitto */
        if (p->dy) dwarf_move_y(p->dy);
        dwarf.rider = -1;
    }

    /* il martello si usa sempre: al traino rinnova il torpore */
    if ((pad_pressed & (PAD_A | PAD_C)) && !dwarf.swing) {
        dwarf.swing = DW_SWING;
        dwarf.swung = 0;
    }
    if (dwarf.swing) {
        dwarf.swing--;
        if (!dwarf.swung && dwarf.swing <= DW_SWING - DW_SWING_HIT) {
            dwarf.swung = 1;
            game_on_hammer(dwarf.x + FIX(DW_W / 2) + (fix)dwarf.facing * FIX(DW_REACH),
                           dwarf.y + FIX(DW_H - 3));
        }
    }

    dir = 0;
    if (pad_state & PAD_LEFT) dir -= 1;
    if (pad_state & PAD_RIGHT) dir += 1;
    if (!dwarf.swing && dir) dwarf.facing = (s8)dir;

    max_speed = (dwarf.carrying >= 0) ? DW_RUN_DRAG : DW_RUN;
    accel = dwarf.on_ground ? DW_ACC_GND : DW_ACC_AIR;
    if (dwarf.swing) accel = (accel * 51) >> 8;   /* martellando ci si muove appena */

    if (dir) {
        dwarf.vx += dir * accel;
        if (dwarf.vx > max_speed) dwarf.vx = max_speed;
        if (dwarf.vx < -max_speed) dwarf.vx = -max_speed;
    } else {
        fix fr = dwarf.on_ground ? DW_FRI_GND : DW_FRI_AIR;
        if (dwarf.vx > fr) dwarf.vx -= fr;
        else if (dwarf.vx < -fr) dwarf.vx += fr;
        else dwarf.vx = 0;
    }

    /* salto, con un pizzico di memoria prima e dopo il bordo */
    if (pad_pressed & PAD_B) {
        dwarf.buffer = DW_BUFFER;
        /* Si scende dalle assi solo se il giù era già premuto quando si è
           schiacciato il salto, e senza destra o sinistra. Sulla croce
           direzionale correndo si tocca il basso in diagonale un colpo sì e
           uno no: senza questa condizione il salto si trasformava in una
           discesa proprio mentre si correva. */
        dwarf.buffer_down = (u8)((pad_state & PAD_DOWN) &&
                                 !(pad_state & (PAD_LEFT | PAD_RIGHT)));
    }
    if (dwarf.buffer) dwarf.buffer--;
    if (dwarf.coyote) dwarf.coyote--;
    if (dwarf.buffer && (dwarf.on_ground || dwarf.coyote)) {
        if (dwarf.buffer_down && (pad_state & PAD_DOWN) &&
            !(pad_state & (PAD_LEFT | PAD_RIGHT)) && dwarf.on_oneway) {
            dwarf.drop_timer = 13;          /* 0,22 s per attraversare l'asse */
            dwarf.on_ground = 0;
            dwarf.rider = -1;
        } else {
            dwarf.vy = -DW_JUMP;
            dwarf.jumping = 1;
            game_on_jump();
        }
        dwarf.buffer = 0;
        dwarf.coyote = 0;
    }
    if (dwarf.jumping && !(pad_state & PAD_B) && dwarf.vy < -DW_CUT) dwarf.vy = -DW_CUT;
    if (dwarf.vy >= 0) dwarf.jumping = 0;

    dwarf.vy += DW_GRAVITY;
    if (dwarf.vy > DW_MAX_FALL) dwarf.vy = DW_MAX_FALL;

    was_on_ground = dwarf.on_ground;
    dwarf_move_x(dwarf.vx);
    dwarf_move_y(dwarf.vy);
    if (dwarf.on_ground) {
        fix push = belt_at((s16)(TOI(dwarf.x) + DW_W / 2), (s16)(TOI(dwarf.y) + DW_H + 2));
        if (push) dwarf_move_x(push);
        dwarf.coyote = DW_COYOTE;
    }
    if (dwarf.on_ground && !was_on_ground) game_on_land();

    {
        /* il passo segue la velocità: fermo, il nano respira e basta */
        fix sp = dwarf.vx < 0 ? -dwarf.vx : dwarf.vx;
        dwarf.anim += (sp > VEL(14)) ? (u16)(((sp >> 8) * 21) >> 8) : 17;
    }
}

/* ------------------------------------------------------------ spiritelli */

void imp_reset(Imp *im)
{
    im->x = im->home_x;
    im->y = im->home_y;
    im->vx = (rnd() & 1) ? -(fix)arena->speed : (fix)arena->speed;
    im->vy = 0;
    im->state = IMP_ROAM;
    im->stun = 0;
    im->armor = (u8)(im->kind == IMP_K_ARMOR);
    im->hidden = 0;
    if (im->kind == IMP_K_MOLE) im->bob = 0;
    im->anim = (u8)(rnd() & 3);
    im->bob = rnd();
    im->phase = (u8)rnd();
    im->dive_in = (u16)(150 + (rnd() % 210));
    im->dive = 0;
    im->flee = 0;
    im->grounded = 0;
    im->hover = (s16)(IMP_HOVER_MIN + (rnd() % (IMP_HOVER_MAX - IMP_HOVER_MIN)));
}

/* Colpito dall'onda d'urto: vola via e resta stordito. */
void imp_shock(Imp *im, fix fx, fix fy, fix power, u16 stun)
{
    fix dx = im->x - fx;
    fix dy = im->y - fy - FIX(4);
    fix len = vec_len(dx, dy);
    if (len < FIX(1)) { dx = 0; dy = -FIX(1); len = FIX(1); }
    {   /* direzione normalizzata in 8.8, poi la spinta: così niente traboccamenti */
        fix step = len >> 8;
        fix ux = dx / step, uy = dy / step;
        im->vx = (power * ux) >> 8;
        im->vy = (power * uy) >> 8;
    }
    if (im->vy > -VEL(120)) im->vy = -VEL(120);      /* sempre un po' in su */
    /* lo svelto si riprende in tre quinti del tempo: 154/256 e via */
    im->stun = (im->kind == IMP_K_SWIFT) ? (u16)((stun * 154) >> 8) : stun;
    if (im->state != IMP_CARRIED) im->state = IMP_STUNNED;
    im->grounded = 0;
    im->flee = 0;
}

void imp_break_free(Imp *im)
{
    im->state = IMP_ROAM;
    im->flee = 96;                                    /* 1,6 s di fuga */
    im->grounded = 0;
    im->vx = (im->x < dwarf.x + FIX(DW_W / 2)) ? -(fix)arena->speed * 2
                                               : (fix)arena->speed * 2;
    im->vy = -VEL(220);
}

/* Collisione a cerchio contro le celle solide; le assi fermano solo dall'alto. */
static void imp_move(Imp *im)
{
    s16 r = IMP_R, tx0, tx1, ty0, ty1, tx, ty;
    fix prev_bottom;
    u8 hit = 0;

    im->x += im->vx;
    tx0 = (TOI(im->x) - r) >> CELL_BITS;
    tx1 = (TOI(im->x) + r) >> CELL_BITS;
    ty0 = (TOI(im->y) - r) >> CELL_BITS;
    ty1 = (TOI(im->y) + r) >> CELL_BITS;
    for (ty = ty0; ty <= ty1 && !hit; ty++) {
        for (tx = tx0; tx <= tx1; tx++) {
            if (!arena_solid(tx, ty)) continue;
            if (im->vx > 0) im->x = FIX(tx * CELL - r);
            else if (im->vx < 0) im->x = FIX((tx + 1) * CELL + r);
            im->vx = -(im->vx >> 1);
            hit = 1;
            break;
        }
    }

    prev_bottom = im->y + FIX(r);
    im->y += im->vy;
    im->grounded = 0;
    tx0 = (TOI(im->x) - r) >> CELL_BITS;
    tx1 = (TOI(im->x) + r) >> CELL_BITS;
    ty0 = (TOI(im->y) - r) >> CELL_BITS;
    ty1 = (TOI(im->y) + r) >> CELL_BITS;
    for (ty = ty0; ty <= ty1; ty++) {
        for (tx = tx0; tx <= tx1; tx++) {
            u8 solid = arena_solid(tx, ty);
            u8 oneway = arena_oneway(tx, ty);
            u8 stunned = (im->state == IMP_STUNNED || im->state == IMP_CARRIED);
            if (!solid && !oneway) continue;
            /* da stordito attraversa le assi: finisce a terra, raggiungibile */
            if (oneway && (stunned || im->vy <= 0 || prev_bottom > FIX(ty * CELL + 3)))
                continue;
            /* il tetto del macchinario non è un appoggio: si scivola giù */
            if (arena_under_machine(tx, ty) && im->vy > 0) {
                im->vx -= ACC(260);
                continue;
            }
            if (im->vy > 0) {
                im->y = FIX(ty * CELL - r);
                im->grounded = 1;
                im->vy = stunned ? 0 : -((im->vy * 51) >> 7);  /* rimbalzo smorzato */
            } else if (im->vy < 0 && solid) {
                im->y = FIX((ty + 1) * CELL + r);
                im->vy = 0;
            }
            return;
        }
    }
}

/* 'think' dice se in questo quadro tocca a lui ragionare: la regia alterna
   metà spiritelli per volta e raddoppia i passi, così la media non cambia ma
   il conto per quadro si dimezza. Il movimento invece è sempre fluido. */
void imp_update(Imp *im, u8 think)
{
    fix dcx = dwarf.x + FIX(DW_W / 2);
    fix dcy = dwarf.y + FIX(DW_H / 2);
    fix tx, ty, sp, max;
    u8 near, diving, flee;
    s16 k;

    im->anim += (u16)((im->kind == IMP_K_SWIFT) ? 2 : 1);
    if (im->flee) im->flee--;

    if (im->state == IMP_CARRIED) {
        fix bx = dcx - (fix)dwarf.facing * FIX(15);
        fix by = dwarf.y + FIX(DW_H) - FIX(IMP_R + 1);
        if (im->stun) im->stun--;
        im->x += SCALE(bx - im->x, 47);
        im->y += SCALE(by - im->y, 47);
        return;
    }

    if (im->state == IMP_STUNNED) {
        if (im->stun) im->stun--;
        im->vy += IMP_GRAVITY;
        if (im->vy > VEL(700)) im->vy = VEL(700);
        imp_move(im);
        if (im->grounded) {
            fix push;
            if (im->vx > IMP_FRICTION) im->vx -= IMP_FRICTION;
            else if (im->vx < -IMP_FRICTION) im->vx += IMP_FRICTION;
            else im->vx = 0;
            /* addormentato su un nastro se ne va da solo verso il macchinario */
            push = belt_at(TOI(im->x), (s16)(TOI(im->y) + IMP_R + 2));
            if (push) im->vx = push;
        }
        if (im->stun == 0) {
            im->state = IMP_ROAM;
            im->vy = -VEL(180);
            im->grounded = 0;
        }
        return;
    }

    /* La talpa: sta ferma nella buca e si affaccia a tempo. Il controllo va
       qui, dopo il torpore: una volta martellata è uno spiritello come gli
       altri e deve cadere, farsi portare e finire in scatola. */
    if (im->kind == IMP_K_MOLE) {
        s16 rise;
        im->bob++;
        if (im->bob >= MOLE_CYCLE) im->bob = 0;
        if (im->bob < 16) rise = (s16)((im->bob * 3) >> 2);
        else if (im->bob < MOLE_OUT - 16) rise = MOLE_RISE;
        else if (im->bob < MOLE_OUT) rise = (s16)(((MOLE_OUT - im->bob) * 3) >> 2);
        else rise = -1;
        if (rise > MOLE_RISE) rise = MOLE_RISE;
        im->hidden = (u8)(rise < 0);
        im->x = im->home_x;
        im->y = im->home_y - FIX(rise < 0 ? 0 : rise);
        im->vx = im->vy = 0;
        return;
    }

    if (!think) {                         /* quadro leggero: prosegue e basta */
        im->x += im->vx;
        im->y += im->vy;
        return;
    }

    /* ognuno presidia la sua zona e si occupa del nano solo se passa vicino */
    im->bob += 904;                       /* 2,6 radianti al secondo, a passi doppi */
    flee = (im->flee != 0);
    {   /* distanza al quadrato: la radice qui non serve e costa cara */
        s16 ddx = TOI(dcx - im->x), ddy = TOI(dcy - im->y);
        near = (((s32)ddx * ddx + (s32)ddy * ddy) < (s32)IMP_AWARE * IMP_AWARE);
    }
    if (im->dive) im->dive = (u8)(im->dive > 1 ? im->dive - 2 : 0);
    else if (near && !flee) {
        if (im->dive_in) im->dive_in = (u16)(im->dive_in > 1 ? im->dive_in - 2 : 0);
        if (im->dive_in == 0) {
            im->dive = IMP_DIVE;
            im->dive_in = (u16)(150 + (rnd() % 210));
        }
    }
    diving = (im->dive && near);

    if (diving) {
        tx = dcx;
        ty = dcy;
    } else if (near) {
        /* volteggia sopra la testa: sempre a tiro di martello */
        u8 a = (u8)((u16)(im->bob * 7 / 10 >> 8) + im->phase);
        tx = dcx + FIX((sin_t(a) * PXI(46)) >> 8);
        ty = dwarf.y - FIX(im->hover) + FIX((sin_t((u8)(im->bob >> 8)) * PXI(10)) >> 8);
    } else {
        u8 a = (u8)((u16)(im->bob >> 9) + im->phase);
        u8 b = (u8)((u16)(im->bob * 7 / 10 >> 8) + im->phase);
        tx = im->home_x + FIX((cos_t(a) * IMP_HOME_R) >> 8);
        ty = im->home_y + FIX((sin_t(b) * PXI(26)) >> 8);
    }

    k = flee ? -1 : 1;
    im->vx += SCALE(tx - im->x, diving ? 42 : 22) * k;
    im->vy += SCALE(ty - im->y, diving ? 52 : 30) * k;

    sp = vec_len(im->vx, im->vy);
    max = (fix)arena->speed;
    if (im->kind == IMP_K_SWIFT) max += max >> 1;       /* una volta e mezzo */
    max = flee ? ((max * 77) >> 5) : (diving ? ((max * 83) >> 5) : (max + (max >> 1)));
    if (sp > max && (sp >> 8) > 0) {
        fix ratio = max / (sp >> 8);            /* 0..256 */
        im->vx = (im->vx * ratio) >> 8;
        im->vy = (im->vy * ratio) >> 8;
    }
    imp_move(im);
    if (im->y < FIX(IMP_CEILING)) {
        im->y = FIX(IMP_CEILING);
        im->vy = (im->vy < 0 ? -im->vy : im->vy) / 2;
    }
}

/* ---------------------------------------------------------- blocchi irti */

static void block_move_x(Block *b, fix dx)
{
    s16 x0, x1, y0, y1, tx, ty;
    u8 i;
    if (!dx) return;
    b->x += dx;
    x0 = TOI(b->x) >> CELL_BITS;
    x1 = (TOI(b->x) + BLK_SIZE - 1) >> CELL_BITS;
    y0 = TOI(b->y) >> CELL_BITS;
    y1 = (TOI(b->y) + BLK_SIZE - 1) >> CELL_BITS;
    for (ty = y0; ty <= y1; ty++) {
        for (tx = x0; tx <= x1; tx++) {
            if (!arena_solid(tx, ty)) continue;
            b->x = (dx > 0) ? FIX(tx * CELL - BLK_SIZE) : FIX((tx + 1) * CELL);
            b->vx = 0;
            return;
        }
    }
    for (i = 0; i < block_count; i++) {
        Block *o = &blocks[i];
        if (o == b) continue;
        if (b->x + FIX(BLK_SIZE) <= o->x || b->x >= o->x + FIX(BLK_SIZE)) continue;
        if (b->y + FIX(BLK_SIZE) <= o->y || b->y >= o->y + FIX(BLK_SIZE)) continue;
        b->x = (dx > 0) ? o->x - FIX(BLK_SIZE) : o->x + FIX(BLK_SIZE);
        b->vx = 0;
        return;
    }
}

static void block_move_y(Block *b, fix dy)
{
    fix prev_bottom = b->y + FIX(BLK_SIZE);
    s16 x0, x1, y0, y1, tx, ty;
    u8 i;
    Plat *p;

    b->y += dy;
    b->on_ground = 0;
    x0 = TOI(b->x) >> CELL_BITS;
    x1 = (TOI(b->x) + BLK_SIZE - 1) >> CELL_BITS;
    y0 = TOI(b->y) >> CELL_BITS;
    y1 = (TOI(b->y) + BLK_SIZE - 1) >> CELL_BITS;
    for (ty = y0; ty <= y1; ty++) {
        for (tx = x0; tx <= x1; tx++) {
            u8 solid = arena_solid(tx, ty);
            u8 oneway = arena_oneway(tx, ty);
            if (!solid && !oneway) continue;
            if (oneway && (dy <= 0 || prev_bottom > FIX(ty * CELL + 3))) continue;
            if (dy > 0) {
                b->y = FIX(ty * CELL - BLK_SIZE);
                b->on_ground = 1;
            } else {
                b->y = FIX((ty + 1) * CELL);
            }
            b->vy = 0;
            return;
        }
    }
    for (i = 0; i < block_count; i++) {
        Block *o = &blocks[i];
        if (o == b) continue;
        if (b->x + FIX(BLK_SIZE) <= o->x || b->x >= o->x + FIX(BLK_SIZE)) continue;
        if (b->y + FIX(BLK_SIZE) <= o->y || b->y >= o->y + FIX(BLK_SIZE)) continue;
        if (dy > 0) { b->y = o->y - FIX(BLK_SIZE); b->on_ground = 1; }
        else        { b->y = o->y + FIX(BLK_SIZE); }
        b->vy = 0;
        return;
    }
    p = land_on(b->x, b->y, BLK_SIZE, BLK_SIZE, b->vy, prev_bottom, 0);
    if (p) {
        b->y = FIX(p->y - BLK_SIZE);
        b->vy = 0;
        b->on_ground = 1;
        b->rider = (s8)(p - plats);
    }
}

void block_update(Block *b)
{
    if (b->rider >= 0) {
        Plat *p = &plats[b->rider];
        block_move_x(b, p->dx);
        if (p->dy) block_move_y(b, p->dy);
        b->rider = -1;
    }
    b->vy += BLK_GRAVITY;
    if (b->vy > VEL(700)) b->vy = VEL(700);
    if (b->on_ground) {
        fix push;
        if (b->vx > BLK_FRICTION) b->vx -= BLK_FRICTION;
        else if (b->vx < -BLK_FRICTION) b->vx += BLK_FRICTION;
        else b->vx = 0;
        push = belt_at((s16)(TOI(b->x) + BLK_SIZE / 2), (s16)(TOI(b->y) + BLK_SIZE + 2));
        if (push) b->vx = push;
    }
    block_move_x(b, b->vx);
    block_move_y(b, b->vy);
}

/* ------------------------------------------------------------ assi mobili */

/* L'ascensore: sale e scende fra il terreno sopra e quello sotto. Il rimbalzo
   guarda la riga di celle che sta per invadere, per tutta la larghezza. */
static void plat_update_lift(Plat *p)
{
    fix before = p->fy;
    fix ny = p->fy + p->vy;
    s16 dir = (p->vy > 0) ? 1 : -1;
    s16 lead = (dir > 0) ? (TOI(ny) + PLAT_H - 1) : TOI(ny);
    s16 ty = lead >> CELL_BITS;
    s16 cx0 = TOI(p->x) >> CELL_BITS;
    s16 cx1 = (TOI(p->x) + p->w - 1) >> CELL_BITS;
    s16 cx;
    u8 blocked = 0;

    if (lead < 0 || lead >= (s16)arena_h) blocked = 1;
    if (dir > 0 && TOI(ny) > p->y0 + LIFT_RANGE) blocked = 1;
    if (dir < 0 && TOI(ny) < p->y0 - LIFT_RANGE) blocked = 1;
    for (cx = cx0; cx <= cx1 && !blocked; cx++)
        if (arena_solid(cx, ty)) blocked = 1;

    if (blocked) {
        p->vy = -p->vy;
        ny = before;
    }
    p->fy = ny;
    p->y = TOI(ny);
    p->dy = p->fy - before;
    p->dx = 0;
}

/* L'asse a intermittenza: un giro di lancetta, e negli ultimi quaranta quadri
   lampeggia per dire che sta per sparire. */
static void plat_update_blink(Plat *p)
{
    p->dx = p->dy = 0;
    p->phase++;
    if (p->phase >= BLINK_ON + BLINK_OFF) p->phase = 0;
    p->on = (u8)(p->phase < BLINK_ON);
}

/* L'asse che si sbriciola: regge un po' dopo che ci sei salito, poi molla e
   cade, e dopo un paio di secondi torna al suo posto. */
static void plat_update_crumble(Plat *p)
{
    p->dx = p->dy = 0;
    if (p->phase == 0) return;                  /* nessuno l'ha ancora toccata */
    p->phase++;
    if (p->phase == CRUMBLE_HOLD) {             /* molla */
        p->on = 0;
        p->vy = 0;
    }
    if (!p->on) {
        p->vy += BLK_GRAVITY;
        p->fy += p->vy;
        p->y = TOI(p->fy);
        if (p->phase >= CRUMBLE_HOLD + CRUMBLE_BACK) {
            p->phase = 0;
            p->on = 1;
            p->vy = 0;
            p->y = p->y0;
            p->fy = FIX(p->y0);
        }
    }
}

/* Il carrello: non ha un motore, ha l'attrito. Va dove l'ha mandato l'ultima
   martellata e si ferma contro il terreno. */
static void plat_update_cart(Plat *p)
{
    fix before = p->x;
    s16 ty = (p->y + 2) >> CELL_BITS;
    s16 lead;

    p->dy = 0;
    if (p->vx > CART_FRI) p->vx -= CART_FRI;
    else if (p->vx < -CART_FRI) p->vx += CART_FRI;
    else p->vx = 0;
    if (p->vx > CART_MAX) p->vx = CART_MAX;
    if (p->vx < -CART_MAX) p->vx = -CART_MAX;

    p->x += p->vx;
    if (p->x < 0) { p->x = 0; p->vx = 0; }
    if (p->x + FIX(p->w) > FIX(WORLD_W)) { p->x = FIX(WORLD_W - p->w); p->vx = 0; }
    lead = (p->vx > 0) ? (TOI(p->x) + p->w - 1) : TOI(p->x);
    if (p->vx && arena_solid(lead >> CELL_BITS, ty)) {
        p->x = (p->vx > 0) ? FIX((lead >> CELL_BITS) * CELL - p->w)
                           : FIX(((lead >> CELL_BITS) + 1) * CELL);
        p->vx = 0;
    }
    p->dx = p->x - before;
}

void plat_update(Plat *p)
{
    fix before = p->x;
    s16 dir = (p->vx > 0) ? 1 : -1;

    if (p->kind == PLAT_LIFT) { plat_update_lift(p); return; }
    if (p->kind == PLAT_CART) { plat_update_cart(p); return; }
    if (p->kind == PLAT_CRUMBLE) { plat_update_crumble(p); return; }
    if (p->kind == PLAT_BLINK) { plat_update_blink(p); return; }
    fix nx = p->x + p->vx;
    fix stop = 0;
    u8 stopped = 0;
    s16 ty, tx, lead;
    u8 i;

    if (dir < 0 && nx < 0) { stop = 0; stopped = 1; }
    else if (dir > 0 && nx + FIX(p->w) > FIX(WORLD_W)) {
        stop = FIX(WORLD_W - p->w);
        stopped = 1;
    }

    ty = (p->y + 2) >> CELL_BITS;
    lead = (dir > 0) ? (TOI(nx) + p->w - 1) : TOI(nx);
    tx = lead >> CELL_BITS;
    if (arena_solid(tx, ty)) {
        fix wall = (dir > 0) ? FIX(tx * CELL - p->w) : FIX((tx + 1) * CELL);
        fix d1 = wall - before, d2 = stop - before;
        if (d1 < 0) d1 = -d1;
        if (d2 < 0) d2 = -d2;
        if (!stopped || d1 < d2) { stop = wall; stopped = 1; }
    }

    for (i = 0; i < plat_count; i++) {
        Plat *o = &plats[i];
        s16 dy;
        if (o == p) continue;
        dy = (s16)(o->y - p->y);
        if (dy < 0) dy = -dy;
        if (dy > 9) continue;                       /* non è alla stessa quota */
        if (nx + FIX(p->w) <= o->x || nx >= o->x + FIX(o->w)) continue;
        {
            fix side = (dir > 0) ? o->x - FIX(p->w) : o->x + FIX(o->w);
            fix d1 = side - before, d2 = stop - before;
            if (d1 < 0) d1 = -d1;
            if (d2 < 0) d2 = -d2;
            if (!stopped || d1 < d2) { stop = side; stopped = 1; }
        }
    }

    if (stopped) {
        nx = stop;
        p->vx = -p->vx;
    }
    p->x = nx;
    p->dx = p->x - before;
    p->dy = 0;
}

/* ---------------------------------------------------------- pipistrelli */

void bat_update(Bat *b)
{
    s16 lead;
    b->anim++;
    b->phase = (u8)(b->phase + 3);
    b->x += b->vx;
    lead = (b->vx > 0) ? (TOI(b->x) + BAT_R) : (TOI(b->x) - BAT_R);
    if (lead < 0 || lead >= WORLD_W ||
        arena_solid(lead >> CELL_BITS, TOI(b->y) >> CELL_BITS)) {
        b->vx = -b->vx;
        b->x += b->vx;
    }
    /* l'ondeggiata verticale: metà del fascino, e costa una tabella di seni */
    b->y = b->home_y + FIX((sin_t(b->phase) * BAT_BOB) >> 8);
}

/* ------------------------------------------------------ scintille in giro */

void orbit_update(Orbit *o)
{
    o->phase = (u8)(o->phase + (o->dir > 0 ? 2 : -2));
}

void orbit_pos(const Orbit *o, s16 *x, s16 *y)
{
    *x = (s16)(o->cx + ((cos_t(o->phase) * o->r) >> 8));
    *y = (s16)(o->cy + ((sin_t(o->phase) * o->r) >> 8));
}
