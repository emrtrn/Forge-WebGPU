"""Stride and ground speed of each locomotion clip in a builder file, read from the feet.

Usage:
  blender -b walker.blend --python scripts/stride_info.py
  blender -b walker.blend --python scripts/stride_info.py -- --feet foot --clips walk,run

For every NLA track name (one clip) it plays the clip alone, follows the lowest point of each
object whose name contains the feet pattern (default "foot"), and takes the frames where that
point is in the lowest 12 percent of its height range as the stance. It prints, per clip: the
duration, the mean speed of the feet during stance (the ground speed the clip was made for),
the stride (that speed times the duration), the stance share of the cycle, and the sideways
drift and lift of the stance feet. Compare with the speed and distance per cycle asked in the
prompt before wiring the clip: a walk that answers 0.6 m per cycle for a game speed of 2.9 m/s
will skate. Clips with no travelling stance (idle, aim, fire) print a speed near zero.
The file is not modified on disk.
"""
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
pattern, only = 'foot', None
for i, a in enumerate(argv):
    if a == '--feet':
        pattern = argv[i + 1]
    if a == '--clips':
        only = argv[i + 1].split(',')

scene = bpy.context.scene
fps = scene.render.fps / scene.render.fps_base
objs = [o for o in bpy.data.objects if o.animation_data and o.animation_data.nla_tracks]
feet = [o for o in bpy.data.objects if o.type == 'MESH' and pattern in o.name.lower()]
clips = {}
for o in objs:
    for t in o.animation_data.nla_tracks:
        for s in t.strips:
            a, b = clips.get(t.name, (s.frame_start, s.frame_end))
            clips[t.name] = (min(a, s.frame_start), max(b, s.frame_end))
if not feet or not clips:
    print(f'STRIDE no feet matching "{pattern}" ({len(feet)}) or no NLA tracks ({len(clips)}): nothing to measure')
    sys.exit(0)


def low_point(o):
    """Lowest corner of the object's bounds in world space (a point fixed to the foot)."""
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return min(pts, key=lambda p: p.z)


def corner_index(o, frames):
    """The bound corner that stays lowest over the cycle."""
    best, score = 0, None
    for k in range(8):
        s = 0.0
        for f in frames:
            scene.frame_set(f)
            s += (o.matrix_world @ Vector(o.bound_box[k])).z
        if score is None or s < score:
            best, score = k, s
    return best


print(f'STRIDE {bpy.data.filepath.split("/")[-1]}: {len(feet)} feet ({", ".join(o.name for o in feet)}), {fps:g} fps')
for name in sorted(clips):
    if only and name not in only:
        continue
    for o in objs:
        o.animation_data.action = None
        for t in o.animation_data.nla_tracks:
            t.mute = t.name != name
    f0, f1 = int(round(clips[name][0])), int(round(clips[name][1]))
    frames = list(range(f0, f1 + 1))
    dur = (f1 - f0) / fps
    if len(frames) < 3:
        continue
    speeds, shares, drift, lift = [], [], 0.0, 0.0
    for o in feet:
        k = corner_index(o, frames)
        pos = []
        for f in frames:
            scene.frame_set(f)
            pos.append(o.matrix_world @ Vector(o.bound_box[k]))
        zs = [p.z for p in pos]
        z0, z1 = min(zs), max(zs)
        lim = z0 + 0.12 * (z1 - z0) + 1e-5
        st = [i for i in range(len(pos) - 1) if zs[i] <= lim and zs[i + 1] <= lim]
        if not st:
            continue
        # travel direction: the horizontal axis with the larger stance travel
        dx = sum(abs(pos[i + 1].x - pos[i].x) for i in st)
        dy = sum(abs(pos[i + 1].y - pos[i].y) for i in st)
        along, side = (dx, dy) if dx >= dy else (dy, dx)
        speeds.append(along / (len(st) / fps))
        shares.append(len(st) / (len(frames) - 1))
        drift = max(drift, side)
        lift = max(lift, max(zs[i] for i in st) - z0)
    if not speeds:
        print(f'  {name}: {dur:.2f} s, no stance found')
        continue
    v = sum(speeds) / len(speeds)
    print(f'  {name}: {dur:.2f} s, stance speed {v:.2f} m/s (feet {min(speeds):.2f} to {max(speeds):.2f}), '
          f'stride {v * dur:.2f} m per cycle, stance {100 * sum(shares) / len(shares):.0f}% of the cycle, '
          f'sideways drift {drift * 100:.1f} cm, lift in stance {lift * 100:.1f} cm')
