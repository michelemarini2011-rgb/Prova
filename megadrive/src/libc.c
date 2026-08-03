/* Le due funzioni di libreria che il compilatore si aspetta di trovare:
   qui non c'è nessuna libreria standard, quindi se le scrive il gioco. */
#include "md.h"

void *memcpy(void *dst, const void *src, u32 n)
{
    u8 *d = (u8 *)dst;
    const u8 *s = (const u8 *)src;
    while (n--) *d++ = *s++;
    return dst;
}

void *memset(void *dst, int value, u32 n)
{
    u8 *d = (u8 *)dst;
    while (n--) *d++ = (u8)value;
    return dst;
}
