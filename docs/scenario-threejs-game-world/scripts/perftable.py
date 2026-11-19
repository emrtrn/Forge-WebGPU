#!/usr/bin/env python3
"""Median and range of the frame rate per pose over several rounds, as a markdown table.

Usage:
  python3 scripts/perftable.py <log from capture/perfround.sh> [target-fps=60]

Reads the lines "<tag> <quality> <pose> {json with fps}" that capture/perf.mjs prints. On a GPU
shared with other applications one pose can read 54, 67 and 78 fps in three identical runs, so
a single number is never reported and never acted on: the table gives the median of the rounds,
their range, and how many poses hold the target in every run. The rows of the reference build
(tag REF) show the load on the machine during the rounds.
"""
import collections
import json
import statistics as st
import sys

if len(sys.argv) < 2 or sys.argv[1] in ('-h', '--help'):
    sys.exit(__doc__)
target = float(sys.argv[2]) if len(sys.argv) > 2 else 60.0
d = collections.OrderedDict()
with open(sys.argv[1], encoding='utf-8') as fh:
    lines = fh.read().splitlines()
for line in lines:
    a = line.rstrip('\n').split(' ', 3)
    if len(a) < 4 or not a[3].startswith('{'):
        continue
    d.setdefault((a[0], a[2]), []).append(json.loads(a[3])['fps'])
print('| Build | Pose | Median fps | Range | Runs |')
print('| --- | --- | --- | --- | --- |')
hold = 0
for (tag, pose), v in d.items():
    print('| %s | `%s` | %.1f | %s to %s | %d |' % (tag, pose, st.median(v), min(v), max(v), len(v)))
    if tag != 'REF' and min(v) >= target:
        hold += 1
own = sum(1 for (tag, _) in d if tag != 'REF')
print(f'\n{hold} of {own} poses hold {target:g} frames per second in every run.')
