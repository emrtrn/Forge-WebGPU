# Builder prompts

Prompts for the agentic 3D builder that the build kept, in full, with what came back. Find the model with `search` (an editable 3D model that accepts a prompt, images and a scene file) and read its schema with `model_schema_get` before the first job: parameter names and limits change. The prompt limit met in the build was 2,000 characters; every prompt below fits.

## Contents

- Checklist before launch
- Checks on the returned file
- Builds: weapon, hero prop, walking machine
- Edits: add a clip, retexture, split, variant
- Other asset families (vehicle, aircraft, creature, character, building, modular kit, variants)
- Skinned rig: not obtained in this build

## Checklist before launch

1. One sentence on what it is and how it is used (view model, hero prop, animated game asset).
2. Units, up axis, facing, origin, and the main dimensions in metres.
3. The structure sentence: rigid parts only, the exact names, the hierarchy, each origin at its joint pivot, scale 1.
4. A part count the frame can afford: one draw call per part, twice with a mirror.
5. Look, with the distance it must hold at.
6. Clips: transforms only, frame rate, exact names, duration of each, loop or hold, first and last frame identical on loops.
7. For each gait: ground speed, stance time, distance per stance (speed times stance time), distance per cycle (speed times cycle time), and the request to check stance feet. A patrol at 0.6 m/s on a 2 s cycle with half the cycle in stance: one stance covers 0.6 m, the cycle 1.2 m.
8. What the code drives, so the clips leave it still.
9. A face budget in the parameters (`faceBudget`, with `buildEffort` standard, high or maximum, as the schema read on 2026-11-13). The build's weapons came back at 9k to 25k triangles, hero props at about 19k to 45k, within the budgets asked.
10. For an edit: the keep sentence first, then one change.

Launch builds early. High effort builds took 23 to 31 minutes, standard machine builds 12 to 16, clip edits 4 to 5. Write the job in the ledger at launch.

## Checks on the returned file

The return is one Blender file, whatever output format was asked.

```bash
blender -b model.blend --python scripts/blend_info.py
blender -b model.blend --python scripts/anim_info.py
blender -b model.blend --python scripts/stride_info.py
```

| Look for                                                                      | Why                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every asked name, with the asked parent                                       | A missing or renamed part breaks the code that drives it                                                                                                                                                                                                                                                 |
| Origins at pivots (`anim_info.py` prints them)                                | A turret with its origin at the model centre swings instead of turning                                                                                                                                                                                                                                   |
| `uv` count and image count above zero on every mesh                           | Flat materials and missing UVs show here first                                                                                                                                                                                                                                                           |
| `vgroups` and `ARMATURE` modifiers                                            | `vgroups=1` with an armature means the mesh is not skinned                                                                                                                                                                                                                                               |
| Lights, cameras, backdrop objects                                             | The studio set: `--clean` and `export_anim.py` drop it                                                                                                                                                                                                                                                   |
| Bounds and facing                                                             | Orientation can differ between files of one batch; check an origin asked at rail level against the floor                                                                                                                                                                                                 |
| Actions: names, ranges, `loopd` near 0 on loops                               | A loop that does not close pops once per cycle                                                                                                                                                                                                                                                           |
| Stride and stance speed per clip (`stride_info.py`) against the numbers asked | Custom properties did not always come back. On the kept walker file the script reads 2.76 m/s and 1.66 m for the run asked at 2.9 m/s and 1.74 m (the stance window includes the first frames of the lift, so it reads a few percent low), and 0.54 m per cycle for the first walk clip: the skating one |

## Builds

### Weapon as a first-person view model

Build, one concept image. Parameters: buildEffort=high, faceBudget=60000, outputFormat=glb, topology=triangles.

```text
Compact 9 mm submachine gun as in the side view photo, built as a first-person shooter view model. Units metres, Y up. Overall length 0.52 m. Muzzle points toward -Z, top toward +Y, origin at the centre of the receiver. Separate named objects: receiver, barrel, handguard, magazine (straight removable box magazine that drops out of a magazine well ahead of the grip), bolt, charging_handle (left side, slides back along Z), stock (short collapsed skeleton stock), grip, trigger, rear_sight, front_sight, top_rail. The top rail is flat with crisp Picatinny teeth and carries no optic. Crisp hard-surface edges with small bevels, visible pins, screws, ejection port on the right side, selector lever. Finish: matte black phosphate and dark grey polymer, worn bright at edges, PBR materials with varied roughness. The rear and top of the weapon must read cleanly, as the camera sits just behind and above it.
```

Result: the named parts came back as separate objects; the reload moves `magazine`, `bolt` and `charging_handle` by code. In first person only the top and rear left show, hence the last sentence.

### Hero prop from a prompt alone

Build, prompt only. Parameters: buildEffort=high, faceBudget=70000, outputFormat=glb, topology=triangles.

```text
Cupola melting furnace for a derelict iron foundry, game level hero prop. Units metres, Y up, origin at the centre of the base on the floor. Round firebrick plinth of radius 2.9 from y = 0 to 1.4. Above it a riveted steel shell of radius 2.7 from y = 1.4 to 7.6, made of plate courses with visible lap seams and rivet rows, with heavy band rings at y = 2.2 and y = 5.6. A wind belt (bustle pipe, tube radius 0.35) circles the shell at y = 3.2 and feeds eight tuyere elbows with small sight glasses. The shell narrows in a cone from y = 7.6 to 9.2 into a stack of radius 0.7 that rises to y = 12 with a spark arrester cap. The tap mouth faces +X: a steel housing 1.0 m deep and 2.2 m wide from the floor to y = 3.1, with a rectangular opening 1.3 m wide between y = 1.2 and 2.3 framed by thick bars, a tap spout lip at y = 0.55 projecting to x = 3.9, and inside the opening a recessed surface as a separate object named melt. A charging platform of grating with handrail wraps the back half of the shell at y = 5.9, reached by a caged ladder on the -Z side. Add blast pipes with flanges and hand wheel valves, a hanging chain hoist bracket, cooling water lines, bolted inspection hatches, cable conduits and junction boxes. Separate named objects: plinth, shell, bands, wind_belt, tuyeres, mouth_housing, spout, melt, platform, ladder, stack, pipes. Finish: heat scorched ochre and dark iron oxide paint, heavy soot above the mouth, rust streaks under the bands, slag spatter on the plinth, PBR materials with varied roughness.
```

Result: 17 mesh objects with the asked names (some split further, for example `shell_cone`), 44,928 triangles. `melt` is a separate object, so the game can give it its own glowing material.

### Walking machine with clips

Build, one concept image. Parameters: buildEffort=standard, faceBudget=30000.

```text
Build the four-legged security walker robot of the image as an animated game asset. The image shows hull and turret head: add four two-segment mechanical legs at the four round hip sockets so the hull centre stands 0.9 m above the ground. Hull 1.7 m long, metres, Z up, front faces -Y, feet on Z=0, origin on the ground under the hull centre.

Structure: rigid parts only. No armature, no skinned mesh, no shape keys. Separate mesh objects with exactly these names, parented in this hierarchy, each origin at its joint pivot: root (empty at origin) > hull. hull > head (turret, origin on its yaw axis, carries the lamp lens). head > gun_L, gun_R. hull > plate_FL, plate_FR, plate_RL, plate_RR (yellow cover plates above the hips). hull > leg_FL_upper > leg_FL_lower > foot_FL, same for FR, RL, RR (origins at hip, knee, ankle). Scale 1 everywhere.

Look: dark worn gunmetal armour, yellow hazard plates, hoses, bolts, leg pistons, hard-surface detail readable at 3 m, PBR textures.

Animation: keyframed object transforms only, 30 fps, five actions that export as five separate glTF animations (one action per clip with a slot per object, or NLA tracks with the same name on every object). Names exactly: idle (loop 2 s, slight hull sway, head scans), walk (loop 1 s, in place, trot with diagonal pairs, feet flat during stance and sliding back at constant speed, stride length in metres per cycle stored as custom property 'stride' on root), aim (0.5 s, hull lowers 8 cm, legs brace, holds end pose), fire (0.3 s, gun recoil and hull kick from the aim pose and back), hit (0.35 s, stagger and recover to idle pose). First and last frame of each loop identical.

Deliver the Blender file with all actions, ready for GLB export with every action as its own clip.
```

Result: root > hull > head > gun_L, gun_R, four legs upper > lower > foot, four plates: 20 meshes, 13,500 triangles, five clips exported as separate animations. Trap: the walk clip gave a stride of 0.6 m for a game speed of 2.9 m/s, so the machine skated. The stride property did come back on this file, but not on every one. The fix was the edit below, which states speed, stance and distance.

## Edits

Upload the Blender file (see `scenario` for the upload calls), pass it as the scene file, and start with the keep sentence.

### Add a clip to an animated machine

Edit, scene file. Parameters: buildEffort=standard.

```text
Edit this scene. Keep every object, name, parent, origin, mesh, material and all existing actions with their NLA tracks exactly as they are. Add one more action named exactly run, made like the others (keyframed object transforms, 30 fps, a slot per object, an NLA track named run on every object). run: loop 0.6 s, in place, fast trot with diagonal pairs (FL with RR against FR with RL). Each foot is flat on Z=0 for its stance (half the cycle) and slides back at a constant 2.9 m/s, so one stance covers 0.87 m and the cycle covers 1.74 m. Feet lift 12 cm in the swing. The hull bobs 4 cm twice per cycle and pitches 2 degrees, the head stays level, guns steady. First and last frame identical. Check from the foot positions that no stance foot leaves Z=0 or drifts sideways. Store custom properties on root: run_stride = 1.74, run_speed = 2.9. Deliver the Blender file ready for GLB export with every action as its own clip.
```

Result: the five earlier clips intact, a sixth named `run`, root properties `run_stride 1.74` and `run_speed 2.9`. In engine the foot slide at 2.9 m/s measured 0.05 (0.65 at 1.5 m/s with the first walk clip).

### Retexture with a guide image

Edit, scene file plus one image (a PBR base colour as the material sample). Parameters: buildEffort=high, outputFormat=glb.

```text
Retexture this deck winch so that it stays sharp when seen from one metre. Keep the shape and scale. Use the reference image as the material sample for the painted steel: red oxide and black ship paint with rust bleeding through, chipped at the edges. Sharpen the surface detail: crisp bolt heads on the flanges, a weld seam around the base plate, clean edges on the drum cheeks, greasy dark steel cable on the drum, a worn bare metal brake band, a yellowed data plate. Higher texture resolution, PBR materials with varied roughness.
```

Result: shape and scale kept, sharper surface at 1 m. The guide image carries the paint; the prompt lists the details to sharpen.

### Split a fused mesh into named parts

Edit, scene file. Parameters: buildEffort=high, outputFormat=glb.

```text
Split this sentry turret robot into separate named objects for a game: base (the fixed mount or legs), turret (the rotating head, with its origin on the vertical rotation axis), barrel (the gun or emitter, with its origin at its hinge) and cover_plates (two or three armour panels that can break off). Close the holes that the split leaves so each part is a closed shape. Keep the look, UVs and textures unchanged otherwise.
```

Result: `base`, `turret`, `barrel`, `cover_plates` as separate closed objects with origins on their axes: the game can turn the turret, aim the barrel and drop the plates.

### Variant of a weapon (a site edition)

Edit, scene file plus one image (a PBR base colour). Parameters: buildEffort=standard.

```text
Make a shipyard variant of this submachine gun, the Dock 2 edition. Keep every object name exactly as it is (receiver, barrel, bolt, charging_handle, foregrip, front_sight, grip, handguard, magazine, rear_sight, stock, top_rail, trigger). Keep the origin, scale, orientation and position of every part unchanged, and keep the sight line over front_sight and rear_sight clear. Do not merge, split, rename or delete objects. Join any new geometry into the existing object it sits on, do not add new objects. Paint: repaint receiver, handguard and stock in ship hull red oxide primer like the reference image, flaked and chipped to bare steel on the edges, with a band of black and yellow hazard chevrons around the handguard and white chalk tally marks and a chalk cross on the left side of the receiver. Magazine in worn black steel with a stripe of yellow tape. Barrel, bolt, charging_handle, top_rail, sights and trigger stay dark parkerised steel. Physical changes: wrap the grip and the foregrip in tarred canvas tape with visible overlapping turns; weld a small steel shield plate with a visible weld bead on the right side of the handguard; add a welded lanyard ring at the rear of the receiver below the stock hinge. PBR textures (base colour, normal, ORM) at the same resolution or higher, crisp at 30 cm in first person. Keep the triangle count under 20000.
```

Result: all thirteen names and parents kept, part sizes within 1 to 12 mm, one new material for the additions on foregrip, grip, handguard and receiver. A variant ordered as a new build would have changed names and proportions, and every reload offset with them.

## Other asset families

Evidence: the structure, clip and edit sentences below are the wording that returned the asked parts in the reference build (weapons, eight machine kinds, a furnace, a bridge crane, a metro car). The car, aircraft, creature and modular kit prompts are adaptations of that wording and were not run. Check the first return of each family before ordering the rest.

### Vehicle with wheels

Not run.

Build, prompt alone or with a three-quarter concept image. Parameters: buildEffort=high, a face budget.

```text
Compact two-door sports coupe of the late 1990s, generic design with no brand marks, built as a player car for a racing game seen from a chase camera 6 m behind. Units metres, Y up, nose toward -Z. Length 4.2 m, width 1.8 m, height 1.25 m, wheelbase 2.5 m, track width 1.55 m, wheel radius 0.32 m. Structure: rigid parts only. No armature, no skinned mesh, no shape keys. Separate mesh objects with exactly these names, parented in this hierarchy, each origin at its joint pivot: root (empty at origin, on the ground under the centre of the wheelbase) > body. body > wheel_FL, wheel_FR, wheel_RL, wheel_RR (origin at the wheel centre, axle along X), steering_wheel, door_L, door_R (origin on the hinge line), hood, trunk, bumper_F, bumper_R, wing, glass, lights_F, lights_R, interior. Scale 1 everywhere. About 20 parts. Look: metallic paint with light road dirt low on the body, reads at 3 m and at 60 m. Custom properties on root: wheelbase_m, track_m, wheel_radius_m. The game turns the wheels, steers the front pair and detaches bumpers, hood and wing.
```

Checks on return: wheel origins at the centres, axle axis, dimensions, part count, glass and lights as their own materials.

### Aircraft or spacecraft

Not run.

```text
Single-seat light attack jet, generic design with no national marks, built as a player craft seen from a chase camera. Units metres, Y up, nose toward -Z, origin at the centre of mass. Length 12 m, span 9 m. Structure: rigid parts only. No armature, no skinned mesh, no shape keys. Separate mesh objects with exactly these names, each origin on its hinge line or pivot: root > hull. hull > aileron_L, aileron_R, elevator_L, elevator_R, rudder, flap_L, flap_R, canopy, nozzle, gear_nose, gear_L, gear_R, gear_door_L, gear_door_R, pylon_L, pylon_R. Scale 1 everywhere. Animation: keyframed object transforms only, 30 fps, 3 actions that export as separate glTF animations (one action per clip with a slot per object, and NLA tracks named like the clip on every object). Names exactly: gear_down (1.5 s), gear_up (1.5 s), canopy_open (2 s). Control surfaces stay still in every clip: the game drives them.
```

### Walking creature made of rigid parts

Not run. Adapted from the build's walker prompt.

For an armoured animal, an insect or a robot beast. A soft-bodied creature goes through Scenario rigging models ([characters-and-animation.md](characters-and-animation.md)).

```text
Armoured six-legged beetle the size of a large dog, chitin plates over dark joints, built as an animated opponent for a third-person game. Units metres, Y up, facing -Z, origin on the ground under the body centre. Body length 1.3 m. Structure: rigid parts only. No armature, no skinned mesh, no shape keys. Separate mesh objects with exactly these names, parented in this hierarchy, each origin at its joint pivot: root > thorax. thorax > head > mandible_L, mandible_R. thorax > abdomen, wing_case_L, wing_case_R. Six legs named leg_L1 to leg_L3 and leg_R1 to leg_R3, each as upper > lower > foot (origins at hip, knee, ankle). Scale 1 everywhere. Animation: keyframed object transforms only, 30 fps, 5 actions as separate glTF animations. Names exactly: idle (loop 2 s), walk (loop 0.8 s at 1.2 m/s, every planted foot moves back 0.48 m over its stance), aim (1.0 s rearing), strike (0.4 s), hit (0.3 s). First and last frame of each loop identical.
```

Run `scripts/stride_info.py` on the return: every leg pair must ask the same ground speed.

### Character for rigging

Not run.

Not a builder job. Concept image in a neutral pose, then image to 3D, then a Scenario rigging model. The concept prompt shape:

```text
Full body concept of <role>, neutral standing pose, arms 30 degrees from the body, legs slightly apart, facing the camera at a slight three-quarter angle, plain grey background, even light, no props in hand, hair short or tied, no loose cloth below the knee.
```

### Building or large structure

The furnace (17 parts), the bridge crane (14 parts) and the metro car of the build were ordered this way.

```text
<What it is>, built as a hero structure for a game level, read at 1 m and at 30 m. Units metres, Y up, origin on the floor at the centre of the footprint. Footprint <x> by <z> m, height <y> m. Structure: rigid parts only. Separate mesh objects with exactly these names: root > shell. shell > door_main (origin on the hinge line), hatch, gantry, stairs, railing, pipes, vents, lamp_housings, glass. Scale 1 everywhere. Interior visible through door and glass: floor, back wall and two large shapes, low detail. Look: <materials and wear>. The game opens door_main and places its own lamps at lamp_housings.
```

Measure the origin on return: one structure sat 1.1 m low. Ask for the walkable surfaces by name if the player stands on them, and add collision boxes in the level kit.

### Modular kit

Adapted wording, not run in the build.

```text
Modular kit for <place>, pieces that snap on a 4 m grid. Units metres, Y up. Separate mesh objects with exactly these names, each with its origin at the grid corner on the floor: wall_4m, wall_door_4m, wall_window_4m, corner_outer, corner_inner, pillar, beam_4m, floor_4m, stair_4m, railing_4m. Every wall is 4 m long, 3.2 m high, 0.3 m thick. Ends of every piece are flat and identical so that pieces join without a gap. One shared material set for the whole kit. Scale 1 everywhere.
```

Checks on return: lengths to the millimetre, ends that meet, one material set. Instance the pieces in the level.

### Variants as edit jobs

A variant is an edit of the accepted scene file, never a new build: names, pivots and proportions stay, so code and clips keep working ([builder-edits.md](builder-edits.md)). Only the edition variant was run in the build; the other lines are the same request with another subject.

- **Team or site edition**: "Keep every object name exactly as it is ... add <parts> on one new material named <edition>_Addons."
- **Damage state**: "Same file, with the hood dented, the left door scratched to bare metal and the rear bumper hanging on its right mount. Keep names and origins."
- **Upgrade tier**: added parts named in the prompt, on the faces the game camera sees.
- **Rival car or enemy rank**: paint and two or three added or swapped parts.

A variant may change parts as well as paint. A recolour in a shader is something else, and is cheaper when paint is all that changes.

## Skinned rig: not obtained in this build

### Rig a fused mesh by edit

Edit, scene file. Parameters: buildEffort=high, outputFormat=glb.

```text
Rig this small legged crawler robot for a game engine. Keep the mesh shape, UVs and textures unchanged. Add one armature with a root bone named body and, for every leg, a chain of two bones named leg_L1_upper, leg_L1_lower, leg_L2_upper, leg_L2_lower and so on for the left side (front to back) and leg_R1_upper, leg_R1_lower and so on for the right side. Place the joints at the hip and the knee of each leg. Skin the mesh to the armature with clean weights so each leg bends at its two joints and the body stays rigid. Export the skinned mesh with its skeleton in the GLB.
```

Result: an armature with 13 named bones and a mesh with one vertex group, which `blend_info.py` prints as `vgroups=1`. A skinned rig was not obtained in this build, with this one try. Machines are ordered as rigid parts with pivots and clips as above, which needs no skinning. For organic characters, use the rigging route in `scenario-3d`.

## Wording that carried across builds

- Names: "Separate mesh objects with exactly these names", then the list. Every build ordered this way returned the asked names.
- Hierarchy with `>`: `hull > leg_FL_upper > leg_FL_lower > foot_FL, same for FR, RL, RR (origins at hip, knee, ankle)`.
- Clips: "one action per clip with a slot per object, and NLA tracks named like the clip on every object". Export with `scripts/export_anim.py`, which writes NLA tracks as clips.
- Clip names and durations taken from the game's states (aim 1.2 s, a bomb release of 1.4 s), so code and clip agree without retiming.
- Additions on a view model: "on the top and on the left side", the only faces the first-person camera sees.
- Edition additions on one new material, named for the edition, so the game can tint or hide them.
