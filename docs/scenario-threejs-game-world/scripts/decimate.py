"""Collapse decimation of a generated mesh in headless Blender.

Usage:
  blender -b --factory-startup --python scripts/decimate.py -- <in.glb> <out.glb> <target_tris>

For fused image-to-3D meshes only (an agentic build with a face budget needs no reduction).
Vertices are merged on import so the collapse can cross UV seams, which is where a meshopt
simplify stops. Render or load every result before it ships: a thin-walled mesh can collapse
into spikes, and a prop read from 1 m can look crumpled at a count that is fine at 10 m.
"""
import sys

import bpy

src, dst, target = sys.argv[sys.argv.index('--') + 1:][:3]
target = int(target)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src, merge_vertices=True)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
total = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
ratio = min(1.0, target / max(total, 1))
for o in meshes:
    bpy.context.view_layer.objects.active = o
    m = o.modifiers.new('d', 'DECIMATE')
    m.ratio = ratio
    m.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='d')
    for p in o.data.polygons:
        p.use_smooth = True
after = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
print('DECIMATE', src, total, '->', after)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_apply=True)
