# Delivery into three.js

Evidence: measured in the reference build (three 0.187, Vite, Chromium). This file is the three.js runtime pack for assets: from a returned file to a model in the scene. The frame itself is in [render-recipe.md](render-recipe.md).

## Contents

- Requirements
- From Blender file to GLB
- Packing
- Reducing triangles
- Loading in the page
- Material calibration
- Animated assets
- First-person view models
- Finishes and variants at run time
- Skinned characters
- Traps

## Requirements

- Node 20 or later with `three`, `three-mesh-bvh`, `n8ao`, `vite`, `playwright-core`.
- Blender 4.2 or later, run headless (`blender -b`).
- `npx` for `@gltf-transform/cli`, ffmpeg, ImageMagick 7, `uv` for the Python scripts.
- Run the scripts from the project folder as `node <skill>/scripts/capture/shot.mjs ...` and `blender -b file.blend --python <skill>/scripts/blend_info.py`.

## From Blender file to GLB

A builder model returns a Blender file with a studio set around the asset.

```
blender -b model.blend --python scripts/blend_info.py
blender -b model.blend --python scripts/blend_info.py -- --clean out/model.glb
blender -b walker.blend --python scripts/export_anim.py -- out/walker.glb
```

- The first line prints objects, hierarchy, triangles, materials, images, armatures and vertex groups. Read it before exporting.
- `--clean` strips the backdrop, lights and cameras and exports the asset alone.
- `export_anim.py` exports one glTF animation per action. `scripts/anim_info.py` lists clips and lengths, `scripts/stride_info.py` the ground speed a walk implies.

An image-to-3D model returns a GLB directly: go to packing.

## Packing

```
sh scripts/pack_glb.sh public/models 2048 out/model.glb out/walker.glb
```

- Geometry compressed with meshopt, textures as WebP at the stated size.
- A hero model went from about 15 MB to about 2 MB.
- **Join, flatten, simplify, instance and palette are all off.** Each of them can merge or rename the named parts the game drives.
- 2048 px for hero assets, 1024 px for dressing props.

## Reducing triangles

```
blender -b --python scripts/decimate.py -- raw/bin.glb out/bin.glb 12000
```

- Use Blender's collapse decimation. A meshopt simplify stops at UV seams and leaves image-to-3D meshes almost untouched.
- Targets: 5,000 to 60,000 triangles depending on the size on screen.
- **Look at every decimated model.** One decimation destroyed a model in the build (a locker lost its faces). Compare a still before and after.
- A builder build with a face budget needs no decimation: 9,000 to 25,000 triangles came back as asked.

## Loading in the page

- One loader with meshopt decoding set, one manifest per level, paths relative to the page.
- Load a level's models when the level is chosen. Report progress to the loading screen ([presentation.md](presentation.md)).
- Building the world from loaded models is the long part: slice it across frames ([loading.md](loading.md)).
- Clone repeated assets with shared geometry and materials.
- Build a bounds tree per hit mesh once (`three-mesh-bvh`) for ray tests against the drawn triangles ([game-systems.md](game-systems.md)).

## Material calibration

Generated materials need a pass in the engine before they sit in a level:

- **Metalness**: cap between 0.45 and 0.85. A full metal with a bright base colour mirrors the sky and reads as chrome.
- **Base colour**: multiply by 0.3 to 0.5 on bright generated metals; by 0.2 to 0.3 for a dark paint over a generated colour.
- **Roughness**: set per material under the level's light, starting from the returned map.
- **Environment intensity** per material where a surface must catch the sky (glass, wet paint).
- **Tiling sets**: tile about 0.42 per metre; invert a smoothness map into roughness.
- **Box-projected UVs** for finishes applied at run time: `uv = position_m * 15`.
- A surface that stays black: test the albedo before the light.

## Animated assets

- One `AnimationMixer` per instance. Clips are shared.
- Reparent a named part with `group.attach(node)` to keep its world transform.
- A look layer needs a plain group between parent and node. Rotating an animated node after `mixer.update` accumulates.
- Exported clips with still channels dropped can play together on different parts.
- Origins: measure them. Place with an offset on a mount group when the origin is not where the prompt asked.

## First-person view models

- Usual practice, not a figure of the build: draw the view model after the world with its own depth range, so it never cuts into walls. Its root never stops bullets in the ray tests.
- Judge it only in the first-person view, with the game's field of view.
- Parts scaled for the view: scope parts at 0.74 at the hip in the build.
- The scope view is a radial gradient with a blurred backdrop outside the circle.
- Check the orientation of every weapon with every finish: one came out back to front ([play-tests.md](play-tests.md)).

## Finishes and variants at run time

- A family finish by part name: classes by a pattern on the names (polymer: stock, grip, handguard, pump; bare steel: bolt, trigger, hammer; dark: rail, sight, scope, magazine; the rest parkerised).
- A site skin multiplies generated base colours down (0.2 to 0.3, 0.85 for a navy).
- A variant that changes parts as well as paint is a builder edit job, not a shader recolour ([builder-edits.md](builder-edits.md)). Additions sit on one named material so the game can find them.

## Skinned characters

Derived from three.js practice; no skinned file went through this pack in the reference build. Prove each line on your first character.

- Clone a skinned model with `clone` from `three/addons/utils/SkeletonUtils.js`. A plain `clone()` shares the skeleton and every copy moves as one.
- One `AnimationMixer` per instance; clips shared. Clips bind by bone name: one skeleton per family.
- `scripts/pack_glb.sh` was never run on a skinned file. Pack one, load it, play a clip and compare a still before relying on it.
- A held item is added to the hand bone on a small mount group that carries the grip offset and rotation. Set the offset once per item and keep it in data.
- Hits: the ray filter of [game-systems.md](game-systems.md) skips skinned meshes (the build had none), since a bounds tree built on the rest pose does not follow the bones. Give each skinned body a set of capsules parented to bones (head, chest, hips, upper and lower limbs) and test shots and melee volumes against those. Check with a debug view that the capsules cover the drawn body.
- Budget: bone count and skinned vertices per frame are costs the reference figures do not include. Measure the largest group of characters you plan.

## Traps

- An optimiser that joins meshes removes the names the game drives. Check names after every step.
- A returned file can have no textures. Count images before export.
- Generated props go soft within 2 m: place them accordingly.
- A model can face any axis. Fix it once on a mount group and record the offset.
- Textures from another origin need a CORS header ([shipping.md](shipping.md)).
