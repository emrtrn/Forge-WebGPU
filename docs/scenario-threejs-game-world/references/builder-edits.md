# Edits with the agentic 3D builder

Seven edit jobs on four machines, run on 14 November 2026: one texture edit, four motion edits, two geometry edits. The model is named in [models-2026-11-15.md](models-2026-11-15.md). Each job passed the Blender file of the kept machine as the scene file, plus a prompt.

## The frame of every prompt

Open with the keep sentence, naming the existing actions:

`Edit this scene. Keep every object, name, parent, origin, mesh, material and all existing actions (aim, fire, hit, idle, run, walk) with their NLA tracks exactly as they are.`

Then the one change. Then:

`Deliver the Blender file ready for GLB export with every action as its own clip.`

Measured on seven of seven jobs: same names, parents, origins and material slots, and the existing clips identical key for key (882 channels on the walker, 510 on the loader, 360 on the drone, 168 on the sentry).

When the change touches something the keep sentence covers, state it as an exception: "with one exception: the object named blade".

## Texture edit

A clean-room livery on the walker. Standard effort, 5.5 minutes.

- "Keep every material name and every slot assignment. Change only the look of the materials."
- One clause per material, with a hex value for the accent colour.
- The list of materials that stay as they are.
- The wear logic in words ("no rust and no soot").

Came back: same meshes, UVs and clips. The GLB held 13 images against 10, so check the download size after a retexture.

## Motion edits

All at maximum effort, 22 to 36 minutes each.

`Add one more action named exactly X, made like the others (keyframed object transforms, 30 fps, a slot per object, an NLA track named X on every object).`

Then:

- the length in seconds and in frames;
- one sentence per beat, with its start and end time;
- the parts that must not move;
- the first and last pose by reference to an existing clip: "Frame 0 is the pose of hover frame 0", "The last frame is identical to frame 0 of idle on every object".

| Job                           | Result, measured in the file                                     |
| ----------------------------- | ---------------------------------------------------------------- |
| Walker, new clip `death`      | 1.5 s, frames 0 to 45, at rest from frame 39                     |
| Walker, edited walk as a limp | 1.0 s loop, the damaged foot on the ground on 31 of 31 frames    |
| Sentry, new clip `deploy`     | 1.2 s, hands over to `idle` with a difference of 0.0000 m        |
| Drone, new clip `evade`       | 0.8 s roll, overshoot at frame 19, 16 keys from 0 to 360 degrees |

- A full turn needs this sentence: "Key the roll on every frame so that the full turn is not lost in interpolation."
- Ask for figures the game needs as custom properties on the root (`death_length`, `evade_offset_x`, `walk_damaged_stride`). In this batch they came back as asked. Measure them anyway.
- "As in hover" is taken literally: the referenced pose is copied, including what you did not mean.

## Geometry edits

Both at maximum effort.

**Part swap** (a two-finger grapple in place of the loader's blade, 26.6 minutes):

- "Keep the object blade itself (same name, same parent, same origin, same animation channels) and replace its mesh with ..."
- New parts get an exact name, parent, origin ("origin at its hinge pin") and axis.
- "Give finger_L and finger_R a slot and an NLA track in every existing action like the other objects", with one phrase per clip saying what the new parts do in it.

**Damage** (battle damage on the walker, 27.5 minutes):

- Number the places: "changing geometry in three places only".
- Name the materials for new faces.
- List the parts that must not change.
- Cap the growth: "The triangle count may rise by up to 20 percent". Result: plus 14 percent.

Sizes given as "about" are followed loosely (0.61 m for "about 0.5 m"). A length and an angle given as exact figures came back exact.

## What came back unasked

- The delivered GLB keys every node in every clip (63 channels per clip on the walker, for 15 to 21 in the parent file).
- The loader's clips came back one frame shorter.
- Dents were added as geometry over the hull.
- A retexture adds images to the file.

## Checks without a render

Every verdict above was reached headless, with Blender scripts that compare the edited file with its parent:

| Check                                                                                | Catches                                           |
| ------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Names, parents, origins, bounds, triangles, materials, actions, parent against child | anything outside the asked change                 |
| Existing clips key for key                                                           | a clip that was "kept" but resampled              |
| Range of motion, lowest point per frame, stillness at the end                        | a death that keeps moving, a foot under the floor |
| Where vertices were added or removed                                                 | geometry changed outside the numbered places      |
| Clips of the exported GLB                                                            | a clip lost at export                             |

A rotation measured as an angle folds at 180 degrees: for a turn, read the keyed values.

These checks do not tell the look. A thumbnail of 480 by 320 settles only the coarse look. Every verdict of this batch stands until a render in engine.

## Time and waiting

Standard retexture: 5.5 minutes. Maximum effort motion or geometry: 22.0 to 35.6 minutes, about 29 on average over six jobs. The progress figure rose by about 2 percent a minute and read 38 to 49 percent just before the result arrived: wait with `jobs_wait`, three minutes a call, and do not read the percentage as a forecast.

## Not tested

Three jobs were prepared and not launched:

- a guide image passed in `images` on an edit of a machine with named parts and clips (a guide image was kept earlier on a single-mesh prop: see [builder-prompts.md](builder-prompts.md));
- a second texture edit on the walker;
- a face budget given in the prompt (the walker at 4,000 triangles at most).
