#!/bin/bash
# Avvia la ROM in BlastEm su uno schermo X finto, manda una sequenza di comandi
# e salva una o più schermate. Serve a provare il gioco senza un monitor.
#
#   tools/shot.sh martello.bin out.png [attesa] [comandi...]
#
# Un comando è "tasto:quadri" (Return, a, s, d, Left, Right...), oppure
# "wait:quadri" per non fare nulla, oppure "shot" per salvare una schermata.
# Con più "shot" i file diventano out-1.png, out-2.png e così via.
set -u

ROM=${1:?rom}
OUT=${2:?png}
WAIT=${3:-3}
shift 3 || true

export DISPLAY=:99
pkill -f "Xvfb :99" >/dev/null 2>&1
sleep 0.5
Xvfb :99 -screen 0 1024x768x24 >/dev/null 2>&1 &
XVFB=$!
sleep 1

export SDL_AUDIODRIVER=dummy        # nessuna scheda audio qui dentro
/usr/games/blastem "$ROM" >/tmp/blastem.log 2>&1 &
EMU=$!
sleep "$WAIT"

WIN=$(xdotool search --name "BlastEm" 2>/dev/null | head -1)
if [ -n "$WIN" ]; then
    xdotool windowactivate "$WIN" 2>/dev/null
    xdotool windowfocus "$WIN" 2>/dev/null
fi

SHOTS=0
grab() {
    local dest=$1
    xwd -root -silent | xwdtopnm 2>/dev/null > /tmp/shot.pnm
    /usr/bin/python3.12 - "$dest" <<'EOF'
import sys
from PIL import Image
im = Image.open("/tmp/shot.pnm").convert("RGB")
bbox = im.getbbox()          # la finestra sta in alto a sinistra sullo sfondo nero
if bbox:
    im = im.crop(bbox)
im.save(sys.argv[1])
print("schermata", im.size, "->", sys.argv[1])
EOF
}

for k in "$@"; do
    key=${k%%:*}
    hold=${k#*:}
    [ "$hold" = "$key" ] && hold=6
    dur=$(echo "$hold" | awk '{printf "%.2f", $1/60}')
    case "$key" in
    wait)
        sleep "$dur"
        ;;
    shot)
        SHOTS=$((SHOTS + 1))
        grab "${OUT%.png}-$SHOTS.png"
        ;;
    *)
        # più tasti insieme si scrivono "Right+s:60"
        IFS='+' read -ra KEYS <<< "$key"
        for kk in "${KEYS[@]}"; do xdotool keydown "$kk"; done
        sleep "$dur"
        for kk in "${KEYS[@]}"; do xdotool keyup "$kk"; done
        sleep 0.1
        ;;
    esac
done

sleep 0.3
[ "$SHOTS" -eq 0 ] && grab "$OUT"

kill $EMU 2>/dev/null
kill $XVFB 2>/dev/null
grep -v "^X connection" /tmp/blastem.log | tail -3
