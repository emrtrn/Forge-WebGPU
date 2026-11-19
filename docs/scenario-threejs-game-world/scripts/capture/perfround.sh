#!/bin/sh
# Three rounds of the frame rate measure, each preceded by the same measure on a frozen reference
# build, so every round carries a reading of the load on a shared GPU.
#
# Usage: sh scripts/capture/perfround.sh <log> <levels> [reference-dist] [reference-level=1] [extra-query] [reference-poses]
#   sh scripts/capture/perfround.sh out/tests/perf.log "1 2 3" "versions/v1/dist"
#   python3 scripts/perftable.py out/tests/perf.log
#
# GAME_DIST names the build under test (default ./dist). The reference is an earlier frozen build
# of the same game (rows tagged REF); leave it out on a first build. Give reference-poses
# ("x,y,z,yaw,pitch;...") when the reference build does not expose __g.game.mod.poses. Start it from the folder
# that holds node_modules/playwright-core, with the machine otherwise idle.
set -eu
[ "$#" -ge 2 ] || { echo "usage: sh perfround.sh <log> <levels> [reference-dist] [reference-level] [extra-query] [reference-poses]" >&2; exit 2; }
log="$1"; levels="$2"; ref="${3:-}"; refl="${4:-1}"; extra="${5:-}"; refp="${6:-}"
here="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$(dirname "$log")"
for r in 1 2 3; do
  echo "ROUND $r $(date +%H:%M:%S)" >> "$log"
  if [ -n "$ref" ]; then GAME_DIST="$ref" node "$here/perf.mjs" REF "$refl" high "$refp" "$extra" | grep '^REF' >> "$log" || echo "reference measure failed" >&2; fi
  for L in $levels; do node "$here/perf.mjs" "L$L" "$L" high "" "$extra" | grep "^L$L" >> "$log" || echo "level $L measure failed" >&2; done
done
echo "END $(date +%H:%M:%S)" >> "$log"
