/* Tipi e costanti del gioco.
 *
 * Il gioco originale gira in virgola mobile, con celle da 32 pixel, distanze
 * in pixel al secondo e passi di 1/120 di secondo. Qui tutto è a numeri interi
 * in virgola fissa 8.8: la cella è di 16 pixel (metà) e il passo è il quadro
 * del Mega Drive (1/60). Le macro qui sotto fanno la conversione una volta per
 * tutte, così le costanti restano quelle riconoscibili dell'originale.
 */
#ifndef GAME_H
#define GAME_H

#include "md.h"
#include "levels.h"

/* Virgola fissa 16.16: la parte intera sta nella parola alta.
   Non è un vezzo: prendere i pixel da un 8.8 vorrebbe dire leggere i sedici
   bit centrali di un numero lungo, cioè un accesso a 16 bit su indirizzo
   dispari — che il 68000 non ammette. Con il 16.16 la parte intera è la
   parola alta, allineata, e per giunta i decimali sono più fini. */
typedef s32 fix;                        /* 65536 = un pixel */

#define FIX(n)   ((fix)((s32)(n) << 16))
#define TOI(f)   ((s16)((f) >> 16))
/* (v * num) / 256 senza far traboccare i 32 bit */
#define SCALE(v, num) ((((v) >> 4) * (num)) >> 4)

/* Conversioni dalle unità del gioco originale. */
#define VEL(v)   ((fix)(((s32)(v) * 65536L) / 120L))   /* px/s   -> px/quadro */
#define ACC(a)   ((fix)(((s32)(a) * 65536L) / 7200L))  /* px/s^2 -> px/quadro^2 */
#define LEN(p)   ((fix)(((s32)(p) * 65536L) / 2L))     /* pixel dell'originale */
#define PXI(p)   ((s16)((p) / 2))                      /* pixel interi */

#define CELL      16
#define CELL_BITS 4
#define COLS      ARENA_COLS
#define WORLD_W   (COLS * CELL)

#define HUD_H     16                    /* righe fisse in cima allo schermo */
#define VIEW_H    (SCREEN_H - HUD_H)    /* finestra di gioco: 320x200 */

#define MAX_IMPS      8
#define MAX_BLOCKS    6
#define MAX_PLATS     6
#define MAX_ORBITS    6
#define MAX_PARTICLES 14
#define HEARTS        3

/* ------------------------------------------------------------------ nano */
#define DW_W        PXI(24)
#define DW_H        PXI(30)
#define DW_RUN      VEL(196)
#define DW_RUN_DRAG VEL(134)
#define DW_ACC_GND  ACC(2200)
#define DW_ACC_AIR  ACC(1400)
#define DW_FRI_GND  ACC(2600)
#define DW_FRI_AIR  ACC(700)
#define DW_GRAVITY  ACC(2000)
#define DW_MAX_FALL VEL(900)
#define DW_JUMP     VEL(620)
#define DW_CUT      VEL(190)
#define DW_COYOTE   6                   /* 0,10 s */
#define DW_BUFFER   8                   /* 0,13 s */
#define DW_SWING    25                  /* 0,42 s */
#define DW_SWING_HIT 11                 /* il colpo cade dopo 0,19 s */
#define DW_REACH    PXI(30)
#define SHOCK_RX    PXI(122)
#define SHOCK_RY    PXI(96)
#define DW_INVULN   90                  /* 1,5 s */

typedef struct {
    fix x, y, vx, vy;
    s8  facing;
    u8  on_ground, on_oneway;
    u8  coyote, buffer, jumping;
    u8  buffer_down;                    /* si teneva giù quando ha premuto? */
    u8  drop_timer;
    u16 anim;
    u8  swing, swung;
    s8  carrying;                       /* spiritello al traino, -1 se nessuno */
    u8  invuln, hit_flash;
    s8  rider;                          /* asse che lo trasporta, -1 */
} Dwarf;

/* ---------------------------------------------------------- spiritelli */
#define IMP_R        PXI(26)            /* raggio 13 nell'originale */
#define IMP_GRAVITY  ACC(1500)
#define IMP_FRICTION ACC(900)
#define IMP_HOVER_MIN PXI(26)
#define IMP_HOVER_MAX PXI(60)
#define IMP_AWARE    PXI(300)
#define IMP_HOME_R   PXI(70)
#define IMP_CEILING  PXI(44)
#define IMP_DIVE     48                 /* 0,8 s */
#define IMP_ALERT    84                 /* 1,4 s di preavviso */

enum { IMP_ROAM, IMP_STUNNED, IMP_CARRIED, IMP_BOXED };

/* Le razze di spiritello. Lo svelto ha lo stesso disegno: corre una volta e
   mezzo, si sveglia prima e si porta dietro una scia di scintille, che è il
   modo di distinguerlo senza spendere un disegno. */
enum { IMP_K_PLAIN, IMP_K_SWIFT, IMP_K_ARMOR };

typedef struct {
    fix x, y, vx, vy;                   /* centro dello spiritello */
    fix home_x, home_y;
    u16 stun;
    u8  state;
    u8  kind;
    u8  armor;                          /* l'elmo: il martello ci rimbalza */
    u16 anim;
    u16 bob;                            /* fase, 8.8 di giro */
    u8  phase;
    u16 dive_in;
    u8  dive, flee;
    u8  grounded;
    s16 hover;
} Imp;

/* -------------------------------------------------------- blocchi irti */
#define BLK_SIZE     PXI(30)
#define BLK_GRAVITY  ACC(1800)
#define BLK_FRICTION ACC(620)
#define BLK_MAX_V    VEL(320)

typedef struct {
    fix x, y, vx, vy;
    fix home_x, home_y;
    u8  on_ground;
    s8  rider;
} Block;

/* --------------------------------------------------------- assi mobili */
#define PLAT_H 8

/* Tre tipi, stesso disegno: quella che va avanti e indietro, quella che sale
   e scende, e quella che c'è e non c'è. */
enum { PLAT_SLIDE, PLAT_LIFT, PLAT_BLINK, PLAT_CRUMBLE };

/* L'asse che si sbriciola: quanto regge da quando ci sali, e quanto ci mette a
   tornare. Mezzo secondo scarso è il tempo di accorgersene e saltare via. */
#define CRUMBLE_HOLD 34
#define CRUMBLE_BACK 150

/* L'ascensore fa una corsa sua, tre celle sopra e tre sotto il punto dove sta
   nella mappa: legarlo al soffitto voleva dire costruirgli un pozzo attorno,
   e disegnare le cave diventava un rompicapo. Il terreno lo ferma lo stesso. */
#define LIFT_RANGE PXI(96)

/* L'intermittenza: quanto resta, quanto sparisce, e da quando lampeggia per
   avvisare. Il preavviso non è un vezzo: senza, sparirebbe sotto i piedi. */
#define BLINK_ON   150
#define BLINK_OFF   66
#define BLINK_WARN  40

typedef struct {
    fix x, dx;
    fix fy, dy;                         /* la quota, con i decimali, e il passo */
    s16 y, y0, w;                       /* y0: la quota di partenza */
    fix vx, vy;
    u8  cells;
    u8  kind;
    u16 phase;                          /* per l'intermittenza */
    u8  on;
} Plat;

/* ------------------------------------------------------- nastro che scorre */
/* Una cella solida che spinge di lato chi ci sta sopra: il nano, i blocchi e
   soprattutto gli spiritelli storditi, che così arrivano al macchinario da
   soli. */
#define BELT_PUSH VEL(95)

/* ------------------------------------------------------ scintille in giro */
/* Una scintilla che gira attorno a un perno: nessun disegno nuovo (è quella
   delle particelle) e nessun ragionamento, solo un angolo che avanza. */
#define ORBIT_R     PXI(80)
#define ORBIT_HURT  PXI(20)             /* quanto è larga la parte che scotta */

typedef struct {
    s16 cx, cy;                         /* il perno, in pixel */
    s16 r;
    u8  phase;
    s8  dir;
} Orbit;

/* ---------------------------------------------------------- particelle */
typedef struct {
    fix x, y, vx, vy;
    u8  life, max_life;
    u8  kind;                           /* 0 polvere, 1 scintilla */
} Particle;

/* ------------------------------------------------------------- partita */
enum { ST_TITLE, ST_INTRO, ST_PLAY, ST_DEAD, ST_CLEAR, ST_FINALE };

typedef struct {
    u8  state;
    u16 timer;
    u8  index;
    u8  hearts;
    u16 hammers;
    u16 elapsed;        /* quadri */
    u16 best;           /* secondi */
    u8  total, boxed;
    u8  portal_open;
    u8  paused;
    u16 time;           /* quadri dall'avvio, per le animazioni */
    s16 cam_x, cam_y;   /* posizione in pixel interi, per il VDP */
    fix cam_fx, cam_fy; /* la stessa, con i decimali: l'inseguimento è morbido */
    const char *death_msg;
} Game;

extern Game game;
extern Dwarf dwarf;
extern Imp imps[MAX_IMPS];
extern Block blocks[MAX_BLOCKS];
extern Plat plats[MAX_PLATS];
extern Orbit orbits[MAX_ORBITS];
extern u8 imp_count, block_count, plat_count, orbit_count;

/* --------------------------------------------------------------- arena */
extern const ArenaDef *arena;
extern u16 arena_rows, arena_h;
extern fix start_x, start_y;
extern fix portal_x, portal_y;
extern s16 machine_x, machine_y;        /* angolo in alto a sinistra, pixel */
extern s16 intake_x, intake_y;
extern u8  machine_crates;
extern u8  has_machine;

#define MAX_ARENA_ROWS 64
extern const u8 *arena_row[MAX_ARENA_ROWS];   /* una riga della mappa per voce */

void arena_load(u8 index);
u8   arena_under_machine(s16 cx, s16 cy);
void arena_paint(s16 cam_y, u8 all);

/* La mappa si legge tantissime volte per quadro (ogni corpo che si muove
   controlla le celle attorno a sé): niente chiamate di funzione e nessuna
   moltiplicazione, solo un puntatore per riga. Il trucco del cast a senza
   segno prende in un colpo solo sia i valori negativi sia quelli oltre il
   bordo. */
static inline u8 arena_cell(s16 cx, s16 cy)
{
    if ((u16)cx >= (u16)COLS) return CELL_SOLID;      /* i fianchi chiudono */
    if ((u16)cy >= arena_rows) return CELL_EMPTY;
    return arena_row[cy][cx];
}

static inline u8 arena_solid(s16 cx, s16 cy)
{
    u8 c = arena_cell(cx, cy);
    return (u8)(c == CELL_SOLID || c == CELL_MACHINE ||
                c == CELL_BELT_R || c == CELL_BELT_L);
}

/* Il nastro sotto un punto: quanto spinge, e da che parte. */
static inline fix belt_at(s16 px, s16 py)
{
    u8 c = arena_cell(px >> CELL_BITS, py >> CELL_BITS);
    if (c == CELL_BELT_R) return BELT_PUSH;
    if (c == CELL_BELT_L) return -BELT_PUSH;
    return 0;
}

static inline u8 arena_oneway(s16 cx, s16 cy)
{
    return (u8)(arena_cell(cx, cy) == CELL_ONEWAY);
}

/* -------------------------------------------------------------- entità */
void dwarf_reset(void);
void dwarf_update(void);
void dwarf_hurt(fix from_x);
void imp_reset(Imp *im);
void imp_update(Imp *im, u8 think);
void imp_shock(Imp *im, fix fx, fix fy, fix power, u16 stun);
void imp_break_free(Imp *im);
void block_update(Block *b);
void plat_update(Plat *p);
void orbit_update(Orbit *o);
void orbit_pos(const Orbit *o, s16 *x, s16 *y);
Plat *land_on(fix x, fix y, s16 w, s16 h, fix vy, fix prev_bottom, u8 dropping);

/* ------------------------------------------------------------- effetti */
void particles_burst(fix x, fix y, u8 kind, u8 n, fix speed);
void particles_ring(fix x, fix y, u8 n);
void particles_update(void);
void particles_draw(void);

/* --------------------------------------------------------------- varie */
u16  rnd(void);
u16  isqrt32(u32 v);
fix  vec_len(fix dx, fix dy);

/* Seno e coseno da tabella, ampiezza 256: stanno in linea perché li chiamano
   tutti gli spiritelli a ogni quadro e una chiamata costerebbe più del conto. */
extern const s16 sin_quarter[65];

static inline s16 sin_t(u8 angle)
{
    u8 i = (u8)(angle & 63);
    switch ((u8)(angle >> 6)) {
    case 0:  return sin_quarter[i];
    case 1:  return sin_quarter[64 - i];
    case 2:  return (s16)(-sin_quarter[i]);
    default: return (s16)(-sin_quarter[64 - i]);
    }
}

static inline s16 cos_t(u8 angle) { return sin_t((u8)(angle + 64)); }

/* --------------------------------------------------------------- testo */
void text_clear(u16 plane, u16 tile);
void text_put(u16 plane, u16 col, u16 row, const char *s, u8 pal);
void text_blit(u16 *row, u16 col, u16 width, const char *s, u8 pal);
void text_num_blit(u16 *row, u16 col, u16 width, u16 value, u8 digits, u8 pal);
void text_center(u16 plane, u16 row, const char *s, u8 pal);
void text_number(u16 plane, u16 col, u16 row, u16 value, u8 digits, u8 pal);
u16  text_len(const char *s);
u16  text_wrap(u16 plane, u16 row, const char *s, u8 pal, u16 width);

#endif
