# Characters and animation

Evidence: the machine sections (rigid named parts, clips, state machine, foot slide) are measured in the reference build. The skinned character sections are derived from the Scenario skills named below and standard practice; no skinned character was built or tested in the reference build.

## Contents

- Two kinds of moving body
- Skinned characters: use Scenario rigging and motion models
- What the rig job returned in this build
- Machines: authored animation of rigid named parts
- Clips: what to ask for
- State machine
- Blending
- Locomotion without foot slide
- Retargeting
- Checks

## Two kinds of moving body

| Body                                          | Route                                                   | Status in the reference build |
| --------------------------------------------- | ------------------------------------------------------- | ----------------------------- |
| Human, creature, anything that bends          | Skinned mesh on a skeleton from Scenario rigging models | Not built                     |
| Machine, robot, vehicle, turret, door, weapon | Rigid named parts, pivots at joints, keyframed clips    | Built: eight machine kinds    |

Decide per body before ordering it. The two routes ask for different meshes: a skinned character needs one clean deformable mesh in a rest pose, a machine needs separate objects with origins at the joints.

## Skinned characters: use Scenario rigging and motion models

Do not hand-make a rig or weight a mesh by script. Scenario has models for each step, and existing skills carry the method:

- **`scenario-3d`** covers auto-rigging a biped or quadruped, skin weights, and retargeting an animation onto a rig.
- **`rigged-character-pipeline`**, the recipe skill of the Scenario exploration on a fully rigged character, covers the long route: parts generated as separate 3D assets, a low-poly rebuild with baked textures and a body rig, a face rig with the 52 ARKit blendshapes, body motion pulled from short generated video clips and retargeted onto the rig, secondary motion on hair, then verified renders.

Load the one that fits and follow it. `scenario-3d` installs with the public Scenario skills (`npx skills add scenario-labs/skills`); `rigged-character-pipeline` is the Agent Skill offered for download on the Scenario exploration about a fully rigged character.

**What this skill cannot tell you.** No skinned character was produced in the reference build, so this file names no rigging or motion model, no call sequence, no job time and no skeleton. Those come from `recommend`, the model schemas and the two skills above. Plan accordingly:

- **Spike first.** Before the design depends on a skinned body, take one character through concept, image to 3D, rigging, one walk clip and into the engine. Do it in the grey-box step.
- **Fallback rule.** If two rigging models picked by `recommend` both return a mesh without usable skin weights, change the design: a body made of rigid plates on a skeleton of named parts (armour, a robot, an insect) goes through the builder route, which is measured.
- **Say it in the hand-over**: which rigging and motion models were used, and what came back.

What this skill adds for a game:

1. **Order the body for rigging.** Concept in a neutral pose (arms away from the body, legs apart), plain background, no props in hand, hair and loose cloth kept simple. Image to 3D, judged in engine at the camera distance of the genre.
2. **Pick the rigging model with `recommend`**, read its schema, and check what skeleton it returns (bone names, bone count, rest pose). The game's state machine and any retargeting depend on those names.
3. **Check the returned file before anything else**: an armature, a mesh with one vertex group per deforming bone, weights that sum to 1. Count vertex groups; do not trust the job status.
4. **Get clips from motion models** or from a clip library through retargeting, as `scenario-3d` describes. Ask for loops with matching first and last pose and for in-place locomotion with a stated speed, or measure the root motion. Check each returned loop: pose difference between first and last frame, and the ground speed the feet imply. Trim or cross-fade the loop point in Blender when the poses differ.
5. **Hold a face budget.** A hero character seen from a third-person camera holds at 30 to 60 thousand triangles in a browser; crowds need far less. These are starting figures, not measured in the reference build.
6. **Props in hand** (weapon, tool) are separate rigid assets attached to a hand bone, built by the builder route.

## What the rig job returned in this build

Stated as it happened: a rig edit on a fused machine mesh returned an armature with 13 named bones and a mesh with a single vertex group. A skinned rig was not obtained in this build. The machines were then built as rigid named parts with authored clips, which is the next section. The prompt and the check are in [builder-prompts.md](builder-prompts.md).

## Machines: authored animation of rigid named parts

The route used for every opponent, weapon and moving structure in the build.

- **Structure in the build prompt**: separate mesh objects with exact names, parented in a stated hierarchy, each origin at its joint pivot, scale 1. Example: `root > hull > head > gun_L, gun_R`, four legs as `upper > lower > foot`, 13,500 triangles.
- **Clips in the same prompt or by an edit**: keyframed object transforms only, 30 fps, one action per clip, exported as separate glTF animations.
- **No armature, no skinning, no shape keys.** Say it in the prompt.
- **In the engine**: clone per machine with shared geometry and materials, one mixer per machine.
- **Break-up for free**: a named part is detached with `group.attach(node)` and handed to physics when the machine is destroyed ([game-systems.md](game-systems.md)).

Enemies should be built animated machines, with named parts and clips, from the start. Shells moved by code alone were the weakest part of the first version.

Extras worth asking for by name, each used in the build:

- On tracks or belts: `uv_scroll_per_stride`, `tile_length_m`, `scroll_axis` as custom properties.
- On the root: `clips` and `fps`.
- "Yoke still" in a clip leaves yaw to the code, so the turret can track while the clip plays.
- An `aim` clip whose length equals the warning the player gets (1.2 s, 0.9 s, 1.4 s for a bomb in the build).

## Clips: what to ask for

The clip names are those of the build; the durations are usual starting values.

| State              | Clip             | Notes                                                  |
| ------------------ | ---------------- | ------------------------------------------------------ |
| Waiting            | `idle`, loop     | 2 to 4 s, small motion, first and last frame identical |
| Moving             | `walk`, `run`    | State the stride and the ground speed in the prompt    |
| Warning            | `aim`            | Length equals the telegraph                            |
| Acting             | `fire`, `strike` | Short, returns to the aim pose                         |
| Taking a hit       | `hit`            | 0.3 to 0.5 s, additive in feel: small and fast         |
| Hovering, turning  | `hover`, `spin`  | Keep them on different parts so they can play together |
| Opening, deploying | `open`, `deploy` | One shot, clamp at the end                             |

Returned clips key every object (60 to 126 curves in the build). Export with size optimisation: it drops still channels, which lets `spin` run next to `hover`.

## State machine

- One state per clip plus transitions with a fixed cross-fade (0.15 to 0.3 s).
- The game logic owns the state. The clip never drives the game except through a stated event time (the frame a shot leaves, the frame a foot lands).
- A look layer (head tracking, recoil, lean) needs a plain group inserted between the parent and the animated node. Rotating an animated node after the mixer update accumulates frame after frame.
- Body origin offsets go on the mount group, never into the clip.
- Clips can fight a solver through the parent: set foot targets in the hull's rest frame.

## Blending

- On a legged machine made of rigid parts, never blend walk and run by weight: the feet slide at every mix.
- On a skinned biped, a blend by speed between walk and run is usual when both clips share foot timing (derived, not run here). Measure foot slide all the same. Switch clips at a phase where both have the same foot down.
- Blend by weight only between clips with the same foot timing (idle to aim, aim to fire).
- Play a clip backward for backward motion only after watching it: some read wrong reversed.
- Facing and heading are two things. Let the body turn at a capped rate (up to 7 rad/s in the build) while the heading follows the path.

## Locomotion without foot slide

The rule: a planted foot does not move over the ground. Three methods, in the order to try:

1. **Phase from distance.** Advance the clip by distance travelled, not by time: `phase += distance / cycle_length`. State the numbers in the prompt, for example a 0.6 s trot at 2.9 m/s gives a stance of 0.87 m and a cycle of 1.74 m, and ask the builder to check them.
2. **Measure what the clip asks.** `scripts/stride_info.py` prints the ground speed each leg implies. One crawler's clip asked three speeds from three leg pairs (0.46, 0.29 and 0.32 m/s): no playback rate could plant all feet.
3. **Compute the walk.** When no rate plants the feet, drive the legs by a solver with foot targets fixed on the ground ([game-systems.md](game-systems.md)).

Measured foot slide as a share of body speed in the build: walker 0.05 to 0.18, spider 0.03 to 0.13, crawler 0.36 to 0.38 with its clip and 0.01 to 0.02 with the computed walk. A foot counts as planted in the lowest 12 percent of its height range. The stance measure can read 15 percent low, and a measurement follows a point: follow the tip the solver uses.

## Retargeting

Derived; not exercised in the reference build.

- Retarget through the Scenario route in `scenario-3d` or the recipe skill above rather than by a script of your own.
- Check after retargeting: feet on the ground in the rest pose, no knee or elbow inversion, hands at the same height as the source on a reach, root motion in the expected axis and scale.
- Keep one skeleton per character family so clips are shared.

## Checks

- File checks: [asset-pipeline.md](asset-pipeline.md), last section.
- Clip list against the state list: every state has a clip, every clip a state.
- Foot slide per walking kind at walk and run speed, in the table of the hand-over.
- A person watches each body walk, turn, act and die at play distance. Scripted measures do not see a motion that reads wrong.
- A 3D asset is shown to others textured, then as mesh, then mesh plus rig, with its clips playable. Show a rig as tapered bones with a sphere at each joint over a translucent mesh.
