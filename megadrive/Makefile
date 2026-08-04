# Compilazione della ROM per Sega Mega Drive.
#
#   make            costruisce martello.bin (italiano)
#   make LANG=en    costruisce hammer.bin   (inglese)
#   make both       costruisce tutte e due
#   make assets     rigenera grafica e livelli da tools/
#   make run        avvia la ROM in BlastEm (serve un server X)

CROSS   ?= m68k-linux-gnu-
CC      := $(CROSS)gcc
OBJCOPY := $(CROSS)objcopy
PYTHON  ?= python3
CFLAGS_EXTRA ?=

# La lingua cambia solo le scritte: le due ROM condividono tutto il resto e si
# costruiscono in cartelle separate, così non si mescolano gli oggetti.
LANG    ?= it
ifeq ($(LANG),en)
TARGET  := hammer.bin
BUILD   := build/en
LANGDEF := -DLANG_EN
LANGASM := -Wa,--defsym,LANG_EN=1
else
TARGET  := martello.bin
BUILD   := build/it
LANGDEF :=
LANGASM :=
endif

ELF     := $(BUILD)/martello.elf

# -fno-store-merging: senza, il compilatore accorpa due scritture di un byte
# in una sola da 16 bit anche a indirizzo dispari. Il 68020 lo tollera, il
# 68000 del Mega Drive risponde con un errore di indirizzo.
CFLAGS  := -m68000 -O2 -std=gnu99 -Wall -Wextra -Wno-unused-parameter \
           -ffreestanding -fno-builtin -fomit-frame-pointer -fno-pic \
           -fno-common -fno-strict-aliasing -fno-store-merging -Isrc -Ires \
           -MMD -MP $(LANGDEF) $(CFLAGS_EXTRA)
ASFLAGS := -m68000 -Isrc $(LANGASM)
LDFLAGS := -m68000 -nostdlib -Wl,-T,link.ld -Wl,-Map,$(BUILD)/martello.map

CSRC    := $(wildcard src/*.c) $(wildcard res/*.c)
ASRC    := src/boot.s src/mathi.s
OBJ     := $(patsubst %.c,$(BUILD)/%.o,$(CSRC)) $(patsubst %.s,$(BUILD)/%.o,$(ASRC))

.PHONY: all both clean run assets

all: $(TARGET)

both:
	$(MAKE) LANG=it
	$(MAKE) LANG=en

$(TARGET): $(ELF)
	$(PYTHON) tools/checkalign.py $(ELF)
	$(OBJCOPY) -O binary $< $(BUILD)/raw.bin
	$(PYTHON) tools/fixrom.py $(BUILD)/raw.bin $@

$(ELF): $(OBJ) link.ld
	@mkdir -p $(BUILD)
	$(CC) $(LDFLAGS) -o $@ $(OBJ)

$(BUILD)/%.o: %.c
	@mkdir -p $(dir $@)
	$(CC) $(CFLAGS) -c -o $@ $<

-include $(OBJ:.o=.d)

$(BUILD)/%.o: %.s
	@mkdir -p $(dir $@)
	$(CC) $(ASFLAGS) -c -o $@ $<

assets:
	$(PYTHON) tools/md_assets.py
	$(PYTHON) tools/md_levels.py

run: $(TARGET)
	blastem $(TARGET)

clean:
	rm -rf build martello.bin hammer.bin
