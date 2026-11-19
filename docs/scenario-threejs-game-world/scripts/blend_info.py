"""List what a delivered 3D scene file holds, optionally strip its studio set and export a GLB.

Usage:
  blender -b <file.blend> --python scripts/blend_info.py
  blender -b <file.blend> --python scripts/blend_info.py -- --clean out.glb
  blender -b <file.blend> --python scripts/blend_info.py -- --clean --drop quay_ground,rails out.glb

Prints one line per object (type, name, size in metres, triangles, vertex groups, modifiers, parent,
materials), the bones of every armature and the images. --clean removes lights, cameras, objects
whose name starts with "backdrop" and any name given with --drop, so the studio set of an agentic
3D build does not land in the level. A GLB path exports the scene without animation (use
export_anim.py for files with clips). Read the vertex group count before wiring a rig: a mesh with
one vertex group under an armature is not skinned.
"""
import sys

import bpy

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
clean = '--clean' in args
drop = set()
if '--drop' in args:
    drop = {n.strip().lower() for n in args[args.index('--drop') + 1].split(',')}
    del args[args.index('--drop'):args.index('--drop') + 2]
out = next((a for a in args if a.lower().endswith('.glb')), None)

for o in bpy.data.objects:
    extra = ''
    if o.type == 'MESH':
        tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
        extra = (f" tris~{tris} vgroups={len(o.vertex_groups)} mods={[m.type for m in o.modifiers]}"
                 f" parent={o.parent.name if o.parent else None}"
                 f" mats={[m.name for m in o.data.materials if m]} uv={len(o.data.uv_layers)}")
    if o.type == 'ARMATURE':
        extra = f" bones={[b.name for b in o.data.bones]}"
    print('OBJ', o.type, o.name, [round(v, 3) for v in o.dimensions], extra)
print('IMAGES', [(i.name, tuple(i.size)) for i in bpy.data.images])
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
print('TOTAL meshes', len(meshes), 'tris', sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes))

if clean:
    for o in list(bpy.data.objects):
        n = o.name.lower()
        if o.type in ('LIGHT', 'CAMERA') or n.startswith('backdrop') or n in drop:
            print('DROP', o.type, o.name)
            bpy.data.objects.remove(o, do_unlink=True)
if out:
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=False, export_skins=True,
                              export_animations=False, export_image_format='WEBP')
    print('EXPORTED', out)
