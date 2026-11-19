"""Export a delivered animated scene file as one GLB with one glTF animation per clip.

Usage:
  blender -b --disable-autoexec <file.blend> --python scripts/export_anim.py -- <out.glb>

Removes lights, cameras and parentless mesh objects (the studio backdrop of an agentic 3D build;
the model itself hangs under a root empty), clears the active actions and exports with
export_animation_mode='NLA_TRACKS': one animation per NLA track name, sampled at the scene rate,
custom properties kept as extras. Channels that do not move are dropped by the size optimisation,
so a clip such as a rotor spin only holds the rotors and can play next to another clip at full
weight. No key is edited.
"""
import sys

import bpy

out = sys.argv[sys.argv.index('--') + 1]
for o in list(bpy.data.objects):
    if o.type in ('LIGHT', 'CAMERA') or (o.type == 'MESH' and o.parent is None):
        print('DROP', o.type, o.name)
        bpy.data.objects.remove(o, do_unlink=True)
for o in bpy.data.objects:
    if o.animation_data:
        o.animation_data.action = None
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=False, export_animations=True,
                          export_animation_mode='NLA_TRACKS', export_force_sampling=True,
                          export_optimize_animation_size=True, export_extras=True,
                          export_image_format='WEBP', export_yup=True)
print('EXPORTED', out)
