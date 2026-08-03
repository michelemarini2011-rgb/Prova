/* Effetti sonori sul PSG: un canale di tono e uno di rumore, come i suoni
   sintetizzati dell'originale (martellata, salto, torpore, scatola...). */
#include "md.h"

#define PSG (*(volatile u8 *)0xC00011)

/* Periodo del PSG per una frequenza in hertz: 3579545 / (32 * f). */
#define P(f) ((u16)(111860L / (f)))

typedef struct {
    u16 tone;      /* periodo iniziale, 0 = canale muto */
    s16 slide;     /* variazione del periodo a ogni quadro */
    u8  tvol;      /* 0 forte ... 15 muto */
    u8  nmode;     /* modo del rumore, 0 = niente rumore */
    u8  nvol;
    u8  frames;    /* durata; 0 chiude la sequenza */
} SfxStep;

#define NOISE_LOW  0x06
#define NOISE_MID  0x05
#define NOISE_HIGH 0x04

/* Martellata: colpo sordo, polvere e squillo metallico. */
static const SfxStep sfx_hammer[] = {
    { P(120),  40, 2, NOISE_LOW,  3, 4 },
    { P(880), 120, 6, NOISE_MID,  7, 3 },
    { P(400),  90, 9, 0,         15, 3 },
    { 0, 0, 15, 0, 15, 0 }
};
static const SfxStep sfx_jump[] = {
    { P(300), -8, 4, 0, 15, 8 },
    { 0, 0, 15, 0, 15, 0 }
};
static const SfxStep sfx_land[] = {
    { 0, 0, 15, NOISE_LOW, 6, 3 },
    { 0, 0, 15, 0, 15, 0 }
};
static const SfxStep sfx_stun[] = {
    { P(740), 0, 5, 0, 15, 3 },
    { P(620), 0, 5, 0, 15, 3 },
    { P(520), 0, 6, 0, 15, 3 },
    { P(440), 0, 7, 0, 15, 4 },
    { 0, 0, 15, 0, 15, 0 }
};
static const SfxStep sfx_grab[] = {
    { P(320), -14, 6, 0, 15, 5 },
    { 0, 0, 15, 0, 15, 0 }
};
static const SfxStep sfx_box[] = {
    { P(160),  10, 4, NOISE_HIGH, 4, 4 },
    { P(523),   0, 4, 0, 15, 4 },
    { P(659),   0, 4, 0, 15, 4 },
    { P(784),   0, 5, 0, 15, 6 },
    { 0, 0, 15, 0, 15, 0 }
};
static const SfxStep sfx_hurt[] = {
    { P(260), 26, 3, NOISE_LOW, 8, 12 },
    { 0, 0, 15, 0, 15, 0 }
};
static const SfxStep sfx_free[] = {
    { P(300), -20, 4, NOISE_HIGH, 8, 10 },
    { 0, 0, 15, 0, 15, 0 }
};
static const SfxStep sfx_portal[] = {
    { P(262), 0, 5, 0, 15, 5 },
    { P(330), 0, 5, 0, 15, 5 },
    { P(392), 0, 4, 0, 15, 5 },
    { P(523), 0, 4, 0, 15, 5 },
    { P(659), 0, 3, 0, 15, 9 },
    { 0, 0, 15, 0, 15, 0 }
};
static const SfxStep sfx_lose[] = {
    { P(392), 0, 3, 0, 15, 9 },
    { P(330), 0, 3, 0, 15, 9 },
    { P(262), 0, 4, 0, 15, 9 },
    { P(196), 0, 4, 0, 15, 16 },
    { 0, 0, 15, 0, 15, 0 }
};
static const SfxStep sfx_start[] = {
    { P(196), 0, 3, 0, 15, 7 },
    { P(262), 0, 3, 0, 15, 7 },
    { P(330), 0, 2, 0, 15, 12 },
    { 0, 0, 15, 0, 15, 0 }
};
static const SfxStep sfx_clear[] = {
    { P(523), 0, 3, 0, 15, 6 },
    { P(659), 0, 3, 0, 15, 6 },
    { P(784), 0, 2, 0, 15, 6 },
    { P(1047), 0, 2, 0, 15, 14 },
    { 0, 0, 15, 0, 15, 0 }
};

static const SfxStep *const sfx_table[] = {
    sfx_hammer, sfx_jump, sfx_land, sfx_stun, sfx_grab, sfx_box,
    sfx_hurt, sfx_free, sfx_portal, sfx_lose, sfx_start, sfx_clear
};

static const SfxStep *cur = 0;
static u8  step_left = 0;
static u16 cur_tone = 0;
static s16 cur_slide = 0;

static void psg_write(u8 v) { PSG = v; }

static void psg_tone(u16 period, u8 vol)
{
    if (period == 0 || vol >= 15) {
        psg_write(0xDF);           /* canale 2 muto */
        return;
    }
    if (period > 1023) period = 1023;
    psg_write((u8)(0xC0 | (period & 0x0F)));
    psg_write((u8)((period >> 4) & 0x3F));
    psg_write((u8)(0xD0 | (vol & 0x0F)));
}

static void psg_noise(u8 mode, u8 vol)
{
    if (mode == 0 || vol >= 15) {
        psg_write(0xFF);           /* rumore muto */
        return;
    }
    psg_write((u8)(0xE0 | (mode & 0x07)));
    psg_write((u8)(0xF0 | (vol & 0x0F)));
}

void psg_init(void)
{
    psg_write(0x9F);
    psg_write(0xBF);
    psg_write(0xDF);
    psg_write(0xFF);
    cur = 0;
}

void sfx_play(u8 id)
{
    if (id >= sizeof(sfx_table) / sizeof(sfx_table[0])) return;
    cur = sfx_table[id];
    step_left = 0;
}

/* Chiamata a ogni ritorno di quadro: fa avanzare l'effetto in corso. */
void psg_update(void)
{
    if (!cur) return;

    if (step_left == 0) {
        if (cur->frames == 0) {
            cur = 0;
            psg_tone(0, 15);
            psg_noise(0, 15);
            return;
        }
        cur_tone = cur->tone;
        cur_slide = cur->slide;
        step_left = cur->frames;
        psg_tone(cur_tone, cur->tvol);
        psg_noise(cur->nmode, cur->nvol);
    } else if (cur_slide && cur_tone) {
        s32 t = (s32)cur_tone + cur_slide;
        if (t < 1) t = 1;
        if (t > 1023) t = 1023;
        cur_tone = (u16)t;
        psg_tone(cur_tone, cur->tvol);
    }

    step_left--;
    if (step_left == 0) cur++;
}
