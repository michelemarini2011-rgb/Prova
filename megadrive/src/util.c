/* Numeri casuali, radice quadrata e seno: quel poco di matematica che serve,
   tutto a numeri interi (il 68000 non ha la virgola mobile). */
#include "game.h"

static u32 seed = 0x1BADF00DL;

u16 rnd(void)
{
    seed = seed * 1103515245L + 12345L;
    return (u16)(seed >> 16);
}

u16 isqrt32(u32 v)
{
    u32 rest = v, root = 0, bit = 1UL << 30;
    while (bit > rest) bit >>= 2;
    while (bit) {
        if (rest >= root + bit) {
            rest -= root + bit;
            root = (root >> 1) + bit;
        } else {
            root >>= 1;
        }
        bit >>= 2;
    }
    return (u16)root;
}

/* Un quarto di sinusoide: 64 passi da 0 a 90 gradi, ampiezza 256. */
const s16 sin_quarter[65] = {
      0,   6,  13,  19,  25,  31,  38,  44,  50,  56,  62,  68,  74,  80,  86,
     92,  98, 104, 109, 115, 121, 126, 132, 137, 142, 147, 152, 157, 162, 167,
    172, 177, 181, 185, 190, 194, 198, 202, 206, 209, 213, 216, 220, 223, 226,
    229, 231, 234, 237, 239, 241, 243, 245, 247, 248, 250, 251, 252, 253, 254,
    255, 255, 256, 256, 256
};

/* Lunghezza di un vettore in virgola fissa, con un sedicesimo di pixel di
   precisione: basta e non fa traboccare i 32 bit. */
fix vec_len(fix dx, fix dy)
{
    u32 a = (u32)((dx < 0 ? -dx : dx) >> 12);
    u32 b = (u32)((dy < 0 ? -dy : dy) >> 12);
    return (fix)((u32)isqrt32(a * a + b * b) << 12);
}
