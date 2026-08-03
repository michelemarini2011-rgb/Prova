/* Joypad a tre tasti sulla porta 1. */
#include "md.h"

u16 pad_state = 0;
u16 pad_pressed = 0;

#define PAD_CTRL (*(volatile u8 *)0xA10009)
#define PAD_DATA (*(volatile u8 *)0xA10003)

void pad_init(void)
{
    PAD_CTRL = 0x40;
    PAD_DATA = 0x40;
    pad_state = 0;
    pad_pressed = 0;
}

void pad_read(void)
{
    u8 hi, lo;
    u16 v = 0, prev = pad_state;

    PAD_DATA = 0x40;
    __asm__ volatile ("nop\n\tnop\n\tnop\n\tnop");
    hi = PAD_DATA;                 /* TH alto: C B destra sinistra giù su */
    PAD_DATA = 0x00;
    __asm__ volatile ("nop\n\tnop\n\tnop\n\tnop");
    lo = PAD_DATA;                 /* TH basso: start A giù su */
    PAD_DATA = 0x40;

    if (!(hi & 0x01)) v |= PAD_UP;
    if (!(hi & 0x02)) v |= PAD_DOWN;
    if (!(hi & 0x04)) v |= PAD_LEFT;
    if (!(hi & 0x08)) v |= PAD_RIGHT;
    if (!(hi & 0x10)) v |= PAD_B;
    if (!(hi & 0x20)) v |= PAD_C;
    if (!(lo & 0x10)) v |= PAD_A;
    if (!(lo & 0x20)) v |= PAD_START;

    pad_state = v;
    pad_pressed = (u16)(v & ~prev);
}
