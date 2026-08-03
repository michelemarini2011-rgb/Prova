| ---------------------------------------------------------------------------
| Moltiplicazione e divisione a 32 bit per il 68000.
|
| Il compilatore, quando moltiplica o divide interi lunghi, chiama queste
| routine. Quelle pronte della libreria di sistema sono però compilate per il
| 68020 (usano bsr con spostamento a 32 bit, che il 68000 non conosce e
| interpreta come un salto a un indirizzo dispari): qui ci sono le versioni
| che il processore del Mega Drive sa eseguire.
| ---------------------------------------------------------------------------

    .text

| long __mulsi3(long a, long b)
| (ah*2^16 + al) * (bh*2^16 + bl) = al*bl + (ah*bl + al*bh) * 2^16
    .globl  __mulsi3
__mulsi3:
    move.w  4(%sp), %d0                 | parte alta di a
    mulu.w  10(%sp), %d0                | per la parte bassa di b
    move.w  6(%sp), %d1                 | parte bassa di a
    mulu.w  8(%sp), %d1                 | per la parte alta di b
    add.w   %d1, %d0
    swap    %d0
    clr.w   %d0
    move.w  6(%sp), %d1
    mulu.w  10(%sp), %d1                | bassa per bassa
    add.l   %d1, %d0
    rts

| Cuore della divisione senza segno: d0 numeratore, d1 denominatore.
| All'uscita d0 è il quoziente e d3 il resto. Rovina d2.
| Trentadue passi di scorrimento e sottrazione: il quoziente entra dal basso
| in d0 man mano che il numeratore ne esce dall'alto.
udiv_core:
    moveq   #0, %d3
    tst.l   %d1
    beq.s   udiv_zero
    moveq   #31, %d2
1:  add.l   %d0, %d0
    addx.l  %d3, %d3
    cmp.l   %d1, %d3
    blo.s   2f
    sub.l   %d1, %d3
    addq.l  #1, %d0
2:  dbra    %d2, 1b
    rts
udiv_zero:
    moveq   #0, %d0                     | divisione per zero: zero, e via
    rts

| unsigned long __udivsi3(unsigned long a, unsigned long b)
    .globl  __udivsi3
__udivsi3:
    movem.l %d2-%d3, -(%sp)
    move.l  12(%sp), %d0
    move.l  16(%sp), %d1
    bsr.w   udiv_core
    movem.l (%sp)+, %d2-%d3
    rts

| unsigned long __umodsi3(unsigned long a, unsigned long b)
    .globl  __umodsi3
__umodsi3:
    movem.l %d2-%d3, -(%sp)
    move.l  12(%sp), %d0
    move.l  16(%sp), %d1
    bsr.w   udiv_core
    move.l  %d3, %d0
    movem.l (%sp)+, %d2-%d3
    rts

| long __divsi3(long a, long b)
    .globl  __divsi3
__divsi3:
    movem.l %d2-%d4, -(%sp)
    moveq   #0, %d4                     | conta i segni negativi
    move.l  16(%sp), %d0
    bpl.s   1f
    neg.l   %d0
    addq.l  #1, %d4
1:  move.l  20(%sp), %d1
    bpl.s   2f
    neg.l   %d1
    addq.l  #1, %d4
2:  bsr.w   udiv_core
    btst    #0, %d4                     | segni discordi: risultato negativo
    beq.s   3f
    neg.l   %d0
3:  movem.l (%sp)+, %d2-%d4
    rts

| long __modsi3(long a, long b) — il resto prende il segno del numeratore
    .globl  __modsi3
__modsi3:
    movem.l %d2-%d4, -(%sp)
    moveq   #0, %d4
    move.l  16(%sp), %d0
    bpl.s   1f
    neg.l   %d0
    moveq   #1, %d4
1:  move.l  20(%sp), %d1
    bpl.s   2f
    neg.l   %d1
2:  bsr.w   udiv_core
    move.l  %d3, %d0
    tst.l   %d4
    beq.s   3f
    neg.l   %d0
3:  movem.l (%sp)+, %d2-%d4
    rts
