#!/bin/sh
# The pair: our in-engine frame on the left, the target still on the right, each at full size.
#
# Usage: sh scripts/pair.sh <ours.jpg> <target.jpg> <out.jpg> [width=1920] [height=1080]
#
# Both are brought to the same size and set side by side with no further scaling, so the result
# is twice the width. Open it at full size, name the single largest gap, fix that, capture again.
# A grade or a material judged on a sheet of small cells passes when it should fail: small cells
# hide saturation and merge hues. Needs ImageMagick 7 (magick).
set -eu
[ "$#" -ge 3 ] || { echo "usage: sh pair.sh <ours.jpg> <target.jpg> <out.jpg> [width] [height]" >&2; exit 2; }
w="${4:-1920}"; h="${5:-1080}"
mkdir -p "$(dirname "$3")"
magick "$1" -resize "${w}x${h}!" \( "$2" -resize "${w}x${h}!" \) +append -quality 92 "$3"
echo "wrote $3"
