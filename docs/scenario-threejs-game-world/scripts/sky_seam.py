#!/usr/bin/env python3
"""Seam check of an equirectangular sky: do the left and right edges meet?

Usage:
  uv run --with pillow python scripts/sky_seam.py <sky.jpg> [more.jpg ...]

Prints the mean absolute difference (0 to 255) between the first and the last pixel column, and
the same measure between two columns a quarter turn apart as the scale of the picture. A sky
whose seam value is a small fraction of the quarter-turn value wraps (the build's upscaled dock
sky read 1.8 against 18.4). Also prints the row of the brightest band, as a share of the height:
a horizon far from 0.5 means the engine shows mostly the upper sky and the picture needs a remap.
Exit code 1 when a seam is more than a quarter of the quarter-turn value.
"""
import sys

from PIL import Image, ImageChops, ImageStat

if len(sys.argv) < 2 or sys.argv[1] in ('-h', '--help'):
    sys.exit(__doc__)
bad = 0
for path in sys.argv[1:]:
    with Image.open(path) as src:
        im = src.convert('RGB')
    w, h = im.size

    def col(x):
        return im.crop((x % w, 0, x % w + 1, h))

    def diff(a, b):
        return sum(ImageStat.Stat(ImageChops.difference(col(a), col(b))).mean) / 3

    seam = diff(0, w - 1)
    quarter = sum(diff(x, x + w // 4) for x in (0, w // 8, w // 4, w // 2)) / 4
    small = im.convert('L').resize((1, 64))
    rows = [small.getpixel((0, y)) for y in range(64)]
    lower = max(range(16, 64), key=lambda y: rows[y])
    print(f'{path}: {w}x{h} seam {seam:.1f}, quarter turn {quarter:.1f}, brightest band at {lower / 63:.2f} of the height'
          f'{"" if abs(w - 2 * h) <= 2 else "  (not 2:1)"}')
    if seam > quarter * 0.25:
        bad += 1
sys.exit(1 if bad else 0)
