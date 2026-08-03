# Compilazione della ROM per Sega Mega Drive.
#
#   make            costruisce martello.bin
#   make assets     rigenera grafica e livelli da tools/
#   make run        avvia la ROM in BlastEm (serve un server X)

CROSS   ?= m68k-linux-gnu-
CC      := $(CROSS)gcc
OBJCOPY := $(CROSS)objcopy
PYTHON  ?= python3
CFLAGS_EXTRA ?=

TARGET  := martello.bin
ELF     := build/martello.elf

# -fno-store-merging: senza, il compilatore accorpa due scritture di un byte
# in una sola da 16 bit anche a indirizzo dispari. Il 68020 lo tollera, il
# 68000 del Mega Drive risponde con un errore di indirizzo.
CFLAGS  := -m68000 -Os -std=gnu99 -Wall -Wextra -Wno-unused-parameter \
           -ffreestanding -fno-builtin -fomit-frame-pointer -fno-pic \
           -fno-common -fno-strict-aliasing -fno-store-merging -Isrc -Ires \
           -MMD -MP $(CFLAGS_EXTRA)
ASFLAGS := -m68000 -Isrc
LDFLAGS := -m68000 -nostdlib -Wl,-T,link.ld -Wl,-Map,build/martello.map

CSRC    := $(wildcard src/*.c) $(wildcard res/*.c)
ASRC    := src/boot.s src/mathi.s
OBJ     := $(patsubst %.c,build/%.o,$(CSRC)) $(patsubst %.s,build/%.o,$(ASRC))

.PHONY: all clean run assets

all: $(TARGET)

$(TARGET): $(ELF)
	$(PYTHON) tools/checkalign.py $(ELF)
	$(OBJCOPY) -O binary $< build/raw.bin
	$(PYTHON) tools/fixrom.py build/raw.bin $@

$(ELF): $(OBJ) link.ld
	@mkdir -p build
	$(CC) $(LDFLAGS) -o $@ $(OBJ)

build/%.o: %.c
	@mkdir -p $(dir $@)
	$(CC) $(CFLAGS) -c -o $@ $<

-include $(OBJ:.o=.d)

build/%.o: %.s
	@mkdir -p $(dir $@)
	$(CC) $(ASFLAGS) -c -o $@ $<

assets:
	$(PYTHON) tools/md_assets.py

run: $(TARGET)
	blastem $(TARGET)

clean:
	rm -rf build $(TARGET)
