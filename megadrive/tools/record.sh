#!/bin/bash
# Registra qualche secondo di gioco quadro per quadro, per guardare da vicino
# quello che a occhio si vede solo come uno sfarfallio.
#
#   tools/record.sh martello.bin cartella [secondi] [comandi...]
#
# I comandi sono quelli di shot.sh (Return:6, wait:200, Right:60...) e vengono
# mandati prima di far partire la registrazione.
set -u

ROM=${1:?rom}
OUT=${2:?cartella}
SECS=${3:-3}
shift 3 || true

FFMPEG=ffmpeg
export DISPLAY=:99
export SDL_AUDIODRIVER=dummy

pkill -f "Xvfb :99" >/dev/null 2>&1
sleep 0.5
Xvfb :99 -screen 0 1024x768x24 >/dev/null 2>&1 &
XVFB=$!
sleep 1

/usr/games/blastem "$ROM" >/tmp/blastem.log 2>&1 &
EMU=$!
sleep 4

WIN=$(xdotool search --name "BlastEm" 2>/dev/null | head -1)
[ -n "$WIN" ] && xdotool windowactivate --sync "$WIN" 2>/dev/null

for k in "$@"; do
    key=${k%%:*}
    hold=${k#*:}
    [ "$hold" = "$key" ] && hold=6
    dur=$(echo "$hold" | awk '{printf "%.2f", $1/60}')
    if [ "$key" = "wait" ]; then sleep "$dur"; continue; fi
    IFS='+' read -ra KEYS <<< "$key"
    [ -n "$WIN" ] && xdotool windowactivate --sync "$WIN" 2>/dev/null
    for kk in "${KEYS[@]}"; do xdotool keydown "$kk"; done
    sleep "$dur"
    for kk in "${KEYS[@]}"; do xdotool keyup "$kk"; done
    sleep 0.1
done

rm -rf "$OUT"; mkdir -p "$OUT"
$FFMPEG -loglevel error -f x11grab -framerate 60 -video_size 1024x768 -i :99.0 \
        -t "$SECS" -pix_fmt rgb24 "$OUT/f%04d.png"

kill $EMU 2>/dev/null
kill $XVFB 2>/dev/null
ls "$OUT" | wc -l
