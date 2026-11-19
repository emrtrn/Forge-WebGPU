#!/bin/sh
# Contact sheet of the one-per-second frames of a clip, to find which frames to open at full size.
#
# Usage: sh scripts/sheet.sh <frames-dir> <out.jpg> [tile=8x5] [cell-width=200]
#
# Takes every .jpg of the folder in name order (capture/clip.mjs writes f00.jpg, f01.jpg, ...).
# The default is 1600 px wide. A sheet finds the frame; it does not judge it. Look at the sheet
# of each aspect ratio separately: a glare that is an arc in 16:9 fills a 9:16 frame.
# ImageMagick montage can print a font error and still write the file, so its stderr is dropped
# and the result is checked instead.
set -eu
[ "$#" -ge 2 ] || { echo "usage: sh sheet.sh <frames-dir> <out.jpg> [tile] [cell-width]" >&2; exit 2; }
d="$1"; out="$2"; tile="${3:-8x5}"; w="${4:-200}"
mkdir -p "$(dirname "$out")"
magick montage "$d"/*.jpg -tile "$tile" -geometry "${w}x+0+0" -background '#111' "$out" 2>/dev/null || true
[ -s "$out" ] || { echo "no sheet written" >&2; exit 1; }
echo "wrote $out ($(wc -c < "$out" | tr -d ' ') bytes)"
