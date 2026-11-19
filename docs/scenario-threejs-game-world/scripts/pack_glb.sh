#!/bin/sh
# Compress GLBs for three.js and keep every named part as its own node.
#
# Usage: sh scripts/pack_glb.sh <out-dir> <texture-size> <in.glb> [<in.glb> ...]
#   sh scripts/pack_glb.sh public/models 2048 clean/furnace.glb clean/walker.glb
#
# meshopt geometry, WebP textures at <texture-size>. The five "false" flags are the point:
# without them glTF Transform simplifies, joins, flattens, instances and palettes the scene, and
# the parts a game moves by name (turret, magazine, glass) are gone. Decimate fused meshes first
# with decimate.py; meshopt simplify stops at UV seams. Needs Node 18 or later (npx fetches
# @gltf-transform/cli 4 on first use). Load with GLTFLoader.setMeshoptDecoder(MeshoptDecoder).
set -eu
[ "$#" -ge 3 ] || { echo "usage: sh pack_glb.sh <out-dir> <texture-size> <in.glb> [...]" >&2; exit 2; }
out="$1"; tex="$2"; shift 2
mkdir -p "$out"
for f in "$@"; do
  n=$(basename "$f")
  [ "$(cd "$(dirname "$f")" && pwd)/$n" != "$(cd "$out" && pwd)/$n" ] || { echo "refusing to overwrite the input $f" >&2; exit 2; }
  npx --yes @gltf-transform/cli@4 optimize "$f" "$out/$n" \
    --compress meshopt --texture-compress webp --texture-size "$tex" \
    --simplify false --join false --flatten false --instance false --palette false > /dev/null
  echo "$(wc -c < "$f" | tr -d ' ') -> $(wc -c < "$out/$n" | tr -d ' ') bytes  $out/$n"
done
