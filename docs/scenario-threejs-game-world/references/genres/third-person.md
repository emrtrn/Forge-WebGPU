# Third-person action and adventure

Evidence: derived from the measured pipeline plus standard practice; not built or tested in the reference build. The asset routes for worlds, machines, props, sound and presentation are the measured ones. The player character, the orbit camera and melee are not: treat every figure below as a starting value to measure.

## Contents

- What changes against first person
- Asset list and routes
- The player character
- Camera
- Controller
- Animation set and state machine
- Combat
- Physics and collision
- Opponents and AI
- HUD
- Tests specific to the genre
- Traps
- Open points to decide in the brief

## What changes against first person

- **The player's body is on screen the whole time.** It is the hero asset: it gets the first shoot-out, the largest triangle and texture budget, and the most clips.
- **Animation carries the feel.** In first person, feel is the weapon and the camera. Here it is how the body starts, stops, turns and lands.
- **The camera sees further and from higher.** Floors and mid-distance props fill the frame; wall detail at 1 m matters less. Judge assets at the camera's real distance (3 to 6 m) and at 1 m only where the camera can be pushed against them.
- **The camera needs collision of its own.**

## Asset list and routes

| Asset                                | Route                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Target stills                        | Text to image, from the game camera's height and distance, with the character in frame            |
| Player character                     | Concept in a neutral pose, image to 3D, Scenario rigging model, clips from Scenario motion models |
| Character variants (outfits, armour) | Separate rigid pieces on bones by the builder route, or a new body through the same rig family    |
| Held items (weapon, tool, shield)    | Builder build with named parts, attached to a hand bone                                           |
| Humanoid or creature opponents       | Same route as the player, one skeleton per family so clips are shared                             |
| Machine opponents                    | Builder build, rigid named parts, clips (measured route)                                          |
| Hero structures and vehicles         | Builder build                                                                                     |
| Props                                | Concept image, image to 3D, judged at the camera distance                                         |
| Surface sets, sky, decals            | As in [asset-pipeline.md](../asset-pipeline.md)                                                   |
| Sound                                | Steps per surface, body moves (roll, land, climb), weapon or tool, opponents, voice               |
| Presentation                         | As in [presentation.md](../presentation.md); the loadout screen shows the character               |

## The player character

Follow [characters-and-animation.md](../characters-and-animation.md): Scenario rigging and motion models, never a hand-made rig. For the long route with a face rig and secondary motion, load the `rigged-character-pipeline` recipe skill.

- Shoot-out: two or three image-to-3D models on the same concept, judged from the game camera, from behind, walking. The back and the silhouette are what the player sees.
- Check the rig file before any clip work: armature, one vertex group per deforming bone, weights.
- If the rig job does not return skin weights, do not weight by script. Try another rigging model from `recommend`, or change the design to a body made of rigid parts (armour plates, a robot): that route is measured.
- Budget to start from: 30,000 to 60,000 triangles, one 2048 px texture set, 40 to 70 bones. No measured figure exists for skinned bodies in this pipeline: measure the largest fight you plan before ordering the opponents.
- No rigging or motion model is named here and none was run. Do the spike of [characters-and-animation.md](../characters-and-animation.md) in the grey-box step, with its fallback rule.
- Keep the character the same across stills, concepts and key art: use the accepted concept as reference image, and `scenario-consistency` if installed.

## Camera

- An orbit camera on a boom behind the character: distance 3 to 4.5 m, pivot at shoulder height, offset to one side by 0.3 to 0.6 m for an over-the-shoulder view.
- **Boom collision**: cast from the pivot to the wanted camera position against the collision layout and pull the camera in to the first hit, less a margin. Ease out again slowly.
- Fade the character when the camera comes within about 0.8 m, so the player never looks through the back of a head.
- Follow lag on position (0.1 to 0.2 s), none on rotation from the mouse.
- Aim mode: a tighter boom, a narrower field of view, the character turned to the camera's heading.
- Lock-on, if the game has melee: the camera frames both bodies; the player's stick input becomes relative to the target.
- Exposure and the grid test of [play-tests.md](../play-tests.md) run from the camera's positions, which include the pulled-in ones.

## Controller

- Movement relative to the camera: stick or keys give a wanted direction on the ground plane.
- The body turns toward that direction at a capped rate; heading and facing are two things.
- Acceleration and stopping distances are tuned with the start and stop clips, or the feet slide.
- Jump with a short buffer before landing and a short grace time after leaving a ledge.
- A capsule against the collision layout, steps up to a stated height, slopes up to a stated angle.
- Gamepad as well as keyboard and mouse: the genre is played on a pad. Scripted tests drive a virtual pad through the action table ([game-systems.md](../game-systems.md), input); a person tests the real one.

## Animation set and state machine

Minimum set for a body that reads well:

| Group     | Clips                                                                                    |
| --------- | ---------------------------------------------------------------------------------------- |
| Ground    | idle, walk, run, sprint, start, stop, turn in place left and right                       |
| Air       | jump, fall loop, land soft, land hard                                                    |
| Crouch    | idle, move                                                                               |
| Traversal | vault, climb up, ladder, if the level asks for them                                      |
| Combat    | per weapon: ready idle, attack chain or fire, reload, hit front and back, block or dodge |
| End       | death, get up                                                                            |

- A blend by speed between walk and run is acceptable on a skinned biped when both clips share foot timing; check foot slide all the same.
- Phase locomotion by distance travelled, not by time.
- Upper and lower body layers so the character can aim or reload while moving.
- Root motion for attacks, dodges and vaults, in-place clips for locomotion: decide per clip and state it when ordering.
- Foot placement on slopes and stairs by a two-bone solver per leg after the clip (derived; the build's solver is for a six-legged rigid machine and does not apply). Flat levels with ramps need none: decide in the brief.
- Every state has a clip and every clip a state: check the list.

## Combat

- **Ranged**: shots come from the weapon's muzzle and are aimed where the camera's centre ray hits. Test the gap between the two when the character stands against cover.
- **Melee**: a hit volume on the weapon part, active between two event times of the attack clip; a short stop of both bodies on contact; a telegraph on every opponent attack whose length is the opponent's wind-up clip.
- Hits on rigid machines are tested against the drawn triangles. Hits on skinned bodies are tested against capsules parented to bones ([threejs-delivery.md](../threejs-delivery.md), skinned characters): the build's ray filter skips skinned meshes. Never against the movement capsule alone.
- Timings to start from: the build's machine telegraphs were 0.9 to 1.4 s for ranged attacks. Melee wind-ups, hit stop and dodge windows have no measured value here: set them in a timing table and tune with a person on the controls.
- Dodge with a stated window, shown by the clip.

## Physics and collision

- Movement capsule, camera boom, hit volumes: three separate things.
- Parts that break off opponents and props go to simple rigid-body motion.
- Cloth and hair: secondary motion on a few bones, with a cap, or none. An unstable chain is worse than a stiff one.

## Opponents and AI

- A navigation mesh or grid from the collision layout.
- States: idle, notice, approach, attack with telegraph, recover, flee or die.
- Limit how many attack at once; the others circle.
- Readability from the higher camera is easier than in first person, but check contrast at the far range of the camera all the same.

## HUD

- Health, stamina or the resource of the game, the item in hand, the objective.
- A lock-on marker, a telegraph cue for attacks from off screen.
- Prompts for traversal and interaction, shown in the world near the object.
- A map or compass if levels are open.

## Tests specific to the genre

Each is a test to write; none was run in the reference build. The bounds are proposals with no measured source: adjust them after a first figure, and never quote them as results.

| Test                           | Method                                                                                                                                                                                       | Bound to start from                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Camera clipping                | Walk the walkable grid, orbit the camera through 8 yaws and 3 pitches at each point; count frames where the camera is inside geometry or the character covers more than a share of the frame | 0 frames inside geometry                                                          |
| Character occlusion            | Same grid: frames where the character is hidden by a wall for more than 0.5 s                                                                                                                | 0 on the main route                                                               |
| Foot slide                     | Planted foot speed over ground at walk, run, sprint, and through start, stop and turn                                                                                                        | Under 0.1 of body speed (0.05 was measured on a rigid walker, nothing on a biped) |
| Clip and state coverage        | List of states against list of clips                                                                                                                                                         | No gap                                                                            |
| Aim agreement                  | Angle between the muzzle ray and the camera centre ray at 5, 15, 30 m, in the open and at cover                                                                                              | Hit point within the reticle                                                      |
| Melee reach                    | Each attack against a target at stated distances: hit or miss as designed                                                                                                                    | As the design table says                                                          |
| Telegraph length               | Each opponent attack: time from first motion to hit                                                                                                                                          | At least the reaction time you chose                                              |
| Exposure from camera positions | The grid test with the boom pulled in and out                                                                                                                                                | Same bounds as first person                                                       |
| Pad and keyboard               | Functional round with each input                                                                                                                                                             | Same checks pass                                                                  |
| Human play                     | A person runs, turns, fights and falls for ten minutes                                                                                                                                       | Their remarks                                                                     |

Plus every shared test: load, frame rate, flash scan, text overflow ([testing.md](../testing.md)).

## Traps

- A character judged from the front in a viewer and seen from behind in the game.
- A walk and a run with different foot timing blended by weight.
- A camera that snaps out after a wall releases it.
- Shots that hit cover the camera can see over.
- A rig job reported as done whose mesh has one vertex group.
- Root motion and code both moving the body.
- Loose cloth or long hair in the concept: it rigs badly and costs the most.

## Open points to decide in the brief

- Melee, ranged or both; lock-on or free aim.
- Fixed levels or an open area (streaming and level of detail change the loading work).
- One character or several; outfits as rigid pieces or as new bodies.
- Traversal moves: each one is clips, level metrics and tests.
