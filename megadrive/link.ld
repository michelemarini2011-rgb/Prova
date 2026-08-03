/* Mappa della ROM e della RAM del Mega Drive.
   ROM: 0x000000, RAM di lavoro: 0xFF0000 (64 KB). */

OUTPUT_ARCH(m68k)
ENTRY(_start)

MEMORY
{
    rom (rx)  : ORIGIN = 0x00000000, LENGTH = 4M
    ram (rwx) : ORIGIN = 0x00FF0000, LENGTH = 64K
}

SECTIONS
{
    .text 0x00000000 :
    {
        KEEP(*(.vectors))
        KEEP(*(.header))
        *(.text .text.*)
        *(.rodata .rodata.*)
        . = ALIGN(2);
        _rom_data = .;
    } > rom

    .data 0x00FF0000 : AT (_rom_data)
    {
        _data_start = .;
        *(.data .data.*)
        . = ALIGN(2);
        _data_end = .;
    } > ram

    .bss (NOLOAD) :
    {
        _bss_start = .;
        *(.bss .bss.*)
        *(COMMON)
        . = ALIGN(2);
        _bss_end = .;
    } > ram

    /DISCARD/ : { *(.comment) *(.note*) *(.eh_frame) }
}
