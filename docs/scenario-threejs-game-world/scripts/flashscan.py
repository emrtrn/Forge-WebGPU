#!/usr/bin/env python3
"""Find single white frames in a clip: a contact sheet at one frame per second cannot show them.

Usage:
  python3 scripts/flashscan.py <video> [more videos ...]

Mean luminance of every frame (ffmpeg signalstats on a 320x180 copy). Prints the frames that are
more than 1.6 times brighter than both neighbours and over 90 of 255, the number of frames over
170, and the highest frame mean with its time, which is how a glare of half a second shows up
(it is not a single frame, so it is not counted as a spike). A 40 s clip takes a few seconds.
Exit code 1 when a single-frame spike is found. Needs ffmpeg.
"""
import os
import re
import subprocess
import sys
import tempfile

if len(sys.argv) < 2 or sys.argv[1] in ('-h', '--help'):
    sys.exit(__doc__)
bad = 0
for f in sys.argv[1:]:
    with tempfile.TemporaryDirectory() as d:
        t = os.path.join(d, 'y.txt')
        subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-vf',
                        f'scale=320:180,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file={t}',
                        '-f', 'null', '-'], check=True)
        with open(t, encoding='utf-8') as fh:
            text = fh.read()
    v = [float(x) for x in re.findall(r'YAVG=([\d.]+)', text)]
    times = [float(x) for x in re.findall(r'pts_time:([\d.]+)', text)]
    sp = [(i, round(v[i], 1), round(v[i - 1], 1), round(v[i + 1], 1)) for i in range(1, len(v) - 1)
          if v[i] > 1.6 * max(v[i - 1], v[i + 1]) and v[i] > 90]
    hi = sum(1 for x in v if x > 170)
    top = max(range(len(v)), key=lambda i: v[i]) if v else 0
    at = f'{times[top]:.2f} s' if top < len(times) else f'frame {top}'
    bad += len(sp)
    print(f'{os.path.basename(f)}: {len(v)} frames, single-frame spikes {len(sp)} {sp[:12]}, '
          f'frames over 170: {hi}, highest mean {v[top] if v else 0:.0f} at {at}')
sys.exit(1 if bad else 0)
