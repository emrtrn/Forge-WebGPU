"""List the hierarchy, pivots, actions and NLA tracks of a delivered animated scene file.

Usage:
  blender -b --disable-autoexec <file.blend> --python scripts/anim_info.py

Prints the scene rate, every object with its world pivot, scale, bounds, triangles, custom
properties, active action and NLA tracks, then every action with its frame range, slot count,
curve count and key interpolation, then images and materials. Check before export: the names and
parents asked for, a pivot at each joint, one action per clip, the same track name on every
object, and loop clips whose first and last key agree (loopd close to 0).
"""
import bpy
from mathutils import Vector

sc = bpy.context.scene
print('SCENE fps', sc.render.fps, 'frames', sc.frame_start, sc.frame_end, 'unit', sc.unit_settings.scale_length)


def walk(o, d=0):
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box] if o.type == 'MESH' else []
    lo = [round(min(v[i] for v in bb), 3) for i in range(3)] if bb else None
    hi = [round(max(v[i] for v in bb), 3) for i in range(3)] if bb else None
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons) if o.type == 'MESH' else 0
    ad = o.animation_data
    print('OBJ', '  ' * d + o.name, o.type, 'pivot', [round(v, 3) for v in o.matrix_world.translation],
          'scale', [round(v, 2) for v in o.scale], 'bb', lo, hi, 'tris', tris,
          'props', {k: o[k] for k in o.keys() if not k.startswith('_') and isinstance(o[k], (int, float, str))},
          'action', ad.action.name if ad and ad.action else None,
          'nla', [(t.name, [s.action.name if s.action else None for s in t.strips]) for t in ad.nla_tracks] if ad else None)
    for c in sorted(o.children, key=lambda c: c.name):
        walk(c, d + 1)


for o in sorted([o for o in bpy.data.objects if o.parent is None], key=lambda o: o.name):
    walk(o)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
print('TOTAL meshes', len(meshes), 'tris', sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes))
for a in bpy.data.actions:
    slots = [s.name_display for s in a.slots] if hasattr(a, 'slots') else []
    fcs = []
    try:
        for layer in a.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for fc in bag.fcurves:
                        fcs.append((bag.slot.name_display if bag.slot else '?', fc))
    except Exception:
        fcs = [('?', fc) for fc in getattr(a, 'fcurves', [])]
    interp = {}
    worst = 0.0
    for _, fc in fcs:
        for k in fc.keyframe_points:
            interp[k.interpolation] = interp.get(k.interpolation, 0) + 1
        if len(fc.keyframe_points) > 1:
            worst = max(worst, abs(fc.keyframe_points[-1].co[1] - fc.keyframe_points[0].co[1]))
    print('ACTION', a.name, 'range', tuple(round(v, 1) for v in a.frame_range), 'slots', len(slots),
          'curves', len(fcs), 'interp', interp, 'loopd', round(worst, 4))
print('IMAGES', [(i.name, tuple(i.size)) for i in bpy.data.images])
print('MATS', [m.name for m in bpy.data.materials])
