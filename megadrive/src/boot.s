| ---------------------------------------------------------------------------
| Avvio del Mega Drive: tabella dei vettori, intestazione della cartuccia,
| sblocco TMSS, azzeramento della RAM e salto al C.
| ---------------------------------------------------------------------------

    .section .vectors, "a"

    .long   0x00FFFE00              | pila iniziale
    .long   _start                  | reset
    .long   _exc_bus                | bus error
    .long   _exc_addr               | address error
    .long   _exc_illegal            | illegal instruction
    .long   _exc_zero               | divisione per zero
    .long   _exception              | CHK
    .long   _exception              | TRAPV
    .long   _exception              | privilege violation
    .long   _int_null               | trace
    .long   _exception              | line A
    .long   _exception              | line F
    .long   _int_null, _int_null, _int_null, _int_null       | 12..15 riservati
    .long   _int_null, _int_null, _int_null, _int_null       | 16..19
    .long   _int_null, _int_null, _int_null, _int_null       | 20..23
    .long   _int_null                                        | spurious
    .long   _int_null               | livello 1
    .long   _int_null               | livello 2 (pulsante reset)
    .long   _int_null               | livello 3
    .long   _int_hblank             | livello 4: interruzione di riga
    .long   _int_null               | livello 5
    .long   _int_vblank             | livello 6: ritorno di quadro
    .long   _int_null               | livello 7
    .long   _int_null, _int_null, _int_null, _int_null       | TRAP #0..3
    .long   _int_null, _int_null, _int_null, _int_null       | TRAP #4..7
    .long   _int_null, _int_null, _int_null, _int_null       | TRAP #8..11
    .long   _int_null, _int_null, _int_null, _int_null       | TRAP #12..15
    .long   _int_null, _int_null, _int_null, _int_null       | 48..51
    .long   _int_null, _int_null, _int_null, _int_null
    .long   _int_null, _int_null, _int_null, _int_null
    .long   _int_null, _int_null, _int_null, _int_null       | ..63

| --------------------------------------------------------------- intestazione
    .section .header, "a"

    .ascii  "SEGA MEGA DRIVE "                               | 0x100
    .ascii  "(C)CLDE 2026.AUG"                               | 0x110
| Il titolo della cartuccia segue la lingua della ROM: LANG_EN arriva dal
| Makefile (--defsym), perché il .s non passa dal preprocessore del C.
.ifdef LANG_EN
    .ascii  "HAMMER AND BOXES                                " | 0x120 nazionale
    .ascii  "HAMMER AND BOXES                                " | 0x150 estero
.else
    .ascii  "MARTELLO E SCATOLE                              " | 0x120 nazionale
    .ascii  "MARTELLO E SCATOLE                              " | 0x150 estero
.endif
    .ascii  "GM 00000000-00"                                 | 0x180 seriale
    .word   0x0000                                           | 0x18E checksum
    .ascii  "J               "                               | 0x190 comandi
    .long   0x00000000                                       | 0x1A0 inizio ROM
    .long   0x0007FFFF                                       | 0x1A4 fine ROM
    .long   0x00FF0000                                       | 0x1A8 inizio RAM
    .long   0x00FFFFFF                                       | 0x1AC fine RAM
    .ascii  "            "                                   | 0x1B0 backup
    .ascii  "            "                                   | 0x1BC modem
    .ascii  "                                        "       | 0x1C8 note
    .ascii  "JUE             "                               | 0x1F0 regioni

| --------------------------------------------------------------------- avvio
    .text
    .globl  _start
_start:
    move.w  #0x2700, %sr                | interruzioni fuori durante l'avvio
    tst.l   0x00A10008                  | i due tst svegliano l'hardware
    bne.s   1f
    tst.w   0x00A1000C
1:
    | ---- TMSS: i modelli dal 1990 in poi pretendono la firma "SEGA"
    move.b  0x00A10001, %d0
    andi.b  #0x0F, %d0
    beq.s   2f
    move.l  #0x53454741, 0x00A14000     | 'SEGA'
2:
    | ---- Z80: bus al 68000, RAM azzerata e due istruzioni che lo mettono a
    | dormire. Lasciarlo correre a vuoto non è innocuo: dalla sua finestra di
    | banco arriverebbe a scrivere nella zona del VDP e la macchina si pianta.
    move.w  #0x0100, 0x00A11100         | richiesta del bus
    move.w  #0x0100, 0x00A11200         | fuori dal reset
3:  btst    #0, 0x00A11100
    bne.s   3b
    lea     0x00A00000, %a0
    move.w  #0x1FFF, %d0
4:  clr.b   (%a0)+
    dbra    %d0, 4b
    move.b  #0xF3, 0x00A00000           | DI
    move.b  #0x76, 0x00A00001           | HALT
    move.w  #0x0000, 0x00A11200         | impulso di reset
    nop
    nop
    nop
    nop
    move.w  #0x0100, 0x00A11200         | reset rilasciato
    move.w  #0x0000, 0x00A11100         | bus restituito: il Z80 si ferma

    | ---- azzeramento della RAM di lavoro
    lea     0x00FF0000, %a0
    move.w  #0x3FFF, %d0
5:  clr.l   (%a0)+
    dbra    %d0, 5b

    | ---- copia della sezione .data dalla ROM alla RAM
    lea     _rom_data, %a0
    lea     _data_start, %a1
    lea     _data_end, %a2
6:  cmpa.l  %a2, %a1
    bcc.s   7f
    move.w  (%a0)+, (%a1)+
    bra.s   6b
7:
    | ---- azzeramento della .bss
    lea     _bss_start, %a1
    lea     _bss_end, %a2
8:  cmpa.l  %a2, %a1
    bcc.s   9f
    clr.w   (%a1)+
    bra.s   8b
9:
    move.l  #0x00FFFE00, %sp
    jsr     main
_hang:
    bra.s   _hang

| ------------------------------------------------------------- interruzioni
    .globl  _int_vblank
_int_vblank:
    movem.l %d0-%d1/%a0-%a1, -(%sp)
    move.w  0x00C00004, %d0             | leggere lo stato spegne la richiesta
    jsr     vblank_isr                  | del VDP: senza, rientra subito qui
    movem.l (%sp)+, %d0-%d1/%a0-%a1
    rte

_int_hblank:
    rte

_int_null:
    rte

| Un'eccezione non si può ignorare: sul 68000 la pila dell'errore di bus è più
| lunga e un rte cieco riparte da un indirizzo a caso. Qui lo schermo si spegne
| e resta di un colore che dice quale eccezione è scattata: rosso errore di
| bus, verde indirizzo dispari, blu istruzione illegale, giallo divisione per
| zero, viola tutto il resto.
| Il gestore mette da parte la pila dell'eccezione e passa la palla al C, che
| scrive a video il tipo, l'indirizzo incriminato e il punto del programma.
    .macro  DIE kind
    move.w  #0x2700, %sr
    move.l  %sp, exc_frame
    move.l  #0x00FFFE00, %sp
    move.l  #\kind, -(%sp)
    jsr     exception_report
0:  bra.s   0b
    .endm

_exc_bus:     DIE 0
_exc_addr:    DIE 1
_exc_illegal: DIE 2
_exc_zero:    DIE 3
_exception:   DIE 4

| --------------------------------------------------------------------- utili
| void set_ints(unsigned short sr) — abilita/disabilita le interruzioni
    .globl  set_sr
set_sr:
    move.l  4(%sp), %d0                 | il C passa un intero da 32 bit:
    move.w  %d0, %sr                    | serve la parola bassa, non l'alta
    rts
