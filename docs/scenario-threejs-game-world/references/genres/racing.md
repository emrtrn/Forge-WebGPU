# Racing and driving

Evidence: derived from the measured pipeline plus standard practice; not built or tested in the reference build. The routes for assets with named parts, props, skies, sound and presentation are measured, on machines and halls: no car and no kilometre of road was built. Vehicle physics, rival drivers, the road mesh, wet roads at speed, speed effects and track streaming are not measured: treat every figure below as a starting value.

## Contents

- What changes against a level on foot
- Asset list and routes
- The car as a builder asset
- Track
- Camera
- Vehicle physics
- Rival drivers
- Race rules and modes
- Speed, light and effects
- Wet weather
- HUD
- Sound
- Tests specific to the genre
- Traps
- Open points to decide in the brief

## What changes against a level on foot

- **The world passes at 30 to 90 m/s.** Assets are read for a fraction of a second, from 5 to 300 m. Silhouette, rhythm and light matter; surface detail at 1 m matters only on the car and in the garage.
- **The car is the hero asset**, seen from behind the whole race and from every side in the menu.
- **The road is the largest surface on screen.** Its material, markings, wetness and reflections get the first look loops.
- **Length.** A lap is kilometres, not a hall. Dressing is modular and repeated; loading and draw distance are track problems.
- **Feel is physics.** It needs a fixed time step and a person on the controls early.

## Asset list and routes

| Asset                 | Route                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| Target stills         | Text to image from the chase camera at race height, one per track section and one in the garage        |
| Player cars           | Builder build with named parts at a face budget, judged from the chase camera and in the garage        |
| Liveries and editions | Builder retexture with a guide image, or a run-time paint by material name; body kits as builder edits |
| Rival cars            | Variants of the same builds by edit jobs, so parts and pivots stay the same                            |
| Track surface         | PBR sets (asphalt, kerb, concrete, gravel, grass), calibrated in engine; markings as decals            |
| Trackside modular kit | Builder builds: barrier, fence section, gantry, grandstand section, pit building, light mast, bridge   |
| Trackside props       | Concept image, image to 3D: tyre stacks, cones, signs, vehicles, tents                                 |
| Scenery               | Far buildings, hills, trees as low-detail assets or cards; world models suit far backdrops             |
| Sky                   | Equirectangular sky as light, per track and time of day                                                |
| Decals                | Skid marks, oil, patches, painted logos you own                                                        |
| Sound                 | Engine loops by load and speed, tyres, wind, gear, impacts, crowd, per surface rolling                 |
| Music and voice       | Menu and race cues; a race engineer or announcer voice, with transcript check                          |
| Presentation          | Key art per track from the game's own frame; car select as a 3D studio                                 |

No real car makes, liveries, sponsors or circuits unless you hold the rights. Describe cars by class, era and shape.

## The car as a builder asset

Structure sentence to adapt in the build prompt ([builder-prompts.md](../builder-prompts.md) has the full example):

```
Structure: rigid parts only. No armature, no skinned mesh, no shape keys. Separate mesh objects with exactly these names, parented in this hierarchy, each origin at its joint pivot: root (empty at origin, on the ground under the centre of the wheelbase) > body. body > wheel_FL, wheel_FR, wheel_RL, wheel_RR (origin at the wheel centre, axle along X), steering_wheel (origin on the column axis), door_L, door_R (origin on the hinge line), hood, trunk, bumper_F, bumper_R, wing, glass, lights_F, lights_R, interior. Scale 1 everywhere.
```

- State wheelbase, track width, wheel radius, length, width and height in metres, forward axis, and ask for them on the root as custom properties. The physics reads them.
- Brake discs and calipers as parts if they must stay still while the wheel turns.
- A part budget: about 20 parts and 20,000 to 60,000 triangles for the player car, less for rivals (builds in the reference build came back at 9,000 to 25,000 with a face budget). Each part is a draw call, again in a mirror: a grid of 8 cars of 20 parts is 160 calls before the track, 320 with a mirror. Measure the start first.
- Six cars: an edit keeps names, pivots and proportions, so it gives liveries, kits and rival versions of one car. A different class of car is a new build. Two or three base builds with edits is a usual split; decide it in the brief.
- Lights as their own materials so brake and head lights can switch through a colour.
- Glass as its own part and material.
- A low interior is enough for a chase camera. A cockpit camera needs a second, detailed build of the interior.
- Damage: bumpers, hood, wing as parts that detach is the break-up route measured on machines; it was not run on a car. Bent metal is not available by this route.
- Check the returned file: wheel origins at the centres, axle axis, scale 1, dimensions as asked.

## Track

- **Centre line first.** A spline with width, banking and height; the road mesh, kerbs, barriers, the racing line of rivals, the minimap and the lap logic all come from it.
- Grey-box the whole lap and drive it before any dressing. Corner radii and widths are tuned with the physics.
- **Road mesh** (derived, no code in this skill): sample the centre line every 1 to 2 m, build a ribbon of quads across the width, with `u` across the road and `v` as distance divided by the tile length so the PBR set tiles along the lap. Kerbs, verges and run-off are ribbons at offsets. Draw lane lines and the start grid in the road shader from `u` and `v`, since the decal route was not exercised. Barriers are a kit piece instanced along an offset curve.
- **Wheel rays** go against the road and kerb triangles through a bounds tree (`three-mesh-bvh`, the library the build used for shots; this use was not run).
- **Modular dressing** along the spline: barriers and fences by repetition, structures at chosen places. Rhythm: something tall every 50 to 100 m, a landmark per sector.
- Density rule at speed: no stretch of more than about 2 s of driving without a new element near the road.
- The road surface: world-space wear, a dry line, patches, rubber on the racing line, and a wetness mask when the track is wet.
- A wet track needs a mirror or a captured cube ([world-building.md](../world-building.md)); apply the distance rule to what the mirror draws.
- Collision: the road and kerbs as triangles for wheel rays, barriers as simple walls.
- Load and draw by sector along the spline; far scenery at low detail. Slice the track build across frames ([loading.md](../loading.md)). The load figures of the build are for halls: sector length and unload distance have no measured value, so start from the view distance at top speed and measure the longest frame over a lap.

## Camera

- Chase camera: 5 to 7 m behind, 1.5 to 2 m up, looking ahead of the car, with a spring on position and a small look into the corner.
- Field of view widens a little with speed; a switch turns it off.
- Bonnet, bumper and cockpit views as options. Each is a different judgement of the assets.
- A rear view and a look-back key.
- Camera collision with barriers and tunnels, as a boom.
- Replays and promo footage from trackside cameras on the spline.

## Vehicle physics

- A fixed time step (120 Hz or more for the car), separate from the frame rate.
- A rigid body with four wheel rays: spring and damper per wheel, tyre grip from slip angle and slip ratio with a simple curve, engine torque by gear, brakes, steering that narrows with speed.
- Arcade or simulation is a brief decision. Arcade: more grip, steering help, a drift state. State it before tuning.
- Assists as options: steering help, brake help, automatic gears.
- Surfaces change grip: asphalt, kerb, grass, gravel, wet.
- Resets: a key puts the car back on the centre line, facing forward.
- The numbers live in one table per car. Tune from lap times and from a person's remarks.
- Textbook starting values for an arcade road car, none measured here: mass 1,200 kg, suspension natural frequency 1.5 to 2.5 Hz with a damping ratio of 0.3 to 0.5, peak tyre grip 1.0 to 1.2 dry and about 0.7 wet, peak slip angle 6 to 10 degrees, steering lock 30 degrees at rest narrowing to about 8 at top speed.
- Run whole physics substeps inside each 1/60 s step ([game-systems.md](../game-systems.md), time step), or the scripted lap is not repeatable.
- No physics library was used in the reference build and none is recommended here. Four wheel rays and one rigid body can be written by hand; contact between eight cars is where a library earns its place. Decide at the grey-box.
- Arcade is the usual default for a browser game played on a keyboard; say so in the brief if nothing else is asked.

## Rival drivers

- Follow a racing line derived from the centre line, with a target speed per point from corner radius and grip. A workable first version (derived, not run): offset the centre line toward the inside of each corner by a share of the width, smooth it, set the speed as the square root of grip times gravity times radius, then walk the lap backward to cap each point by what braking allows.
- Look ahead to brake; avoid cars by lateral offset; hold back from ramming.
- Difficulty by target speed and mistakes, with little or no catch-up. Say in the options what help the rivals get.
- A grid of 8 to 20 cars sets the draw call and physics budgets: measure the heaviest view, the start.

## Race rules and modes

- Start lights, laps, sectors, checkpoints that must be crossed in order, wrong-way detection, finish, results.
- Modes: time trial with a ghost first (it needs no rivals), then a race.
- Lap times in the browser store; a best lap ghost recorded as positions on a fixed step.

## Speed, light and effects

- Speed is read from near objects passing, road texture flow, camera shake, wind sound and a wider field of view, before any blur.
- Motion blur and shake behind switches, off under reduced motion.
- Exposure: tunnels and tree shade change it within a second. Run the exposure test along the lap at race speed ([play-tests.md](../play-tests.md)).
- Low sun in the driver's eyes on a straight: choose the sun for the main views, then check the whole lap.
- Night: head lights as shadowed keys are costly; one shadowed cone for the player car, baked cones for the rest.
- Tyre smoke, spray on a wet track, sparks: additive layers with caps, judged in the pack at the start.
- Judging at speed: take the look loop's stills from the demo lap at race speed with the game's blur as shipped, from the chase camera, and add a short clip per sector. A still of a parked car at 1 m judges the garage only.

## Wet weather

Not built. The wet recipes of the reference build are for a hall: one planar mirror with a 22 m draw rule, and a cube captured once at load. Proposals for a road at speed, to prototype on one sector before the tracks are dressed:

- Weather is a state chosen at load: the same track with another sky, key light, exposure key, wetness mask and grip table.
- Cheapest wet look: lower the road's roughness through the wetness mask and let it reflect the sky environment only. Cars and lights are then missing from the reflection.
- A planar mirror on the road plane works on flat sections. Apply a distance rule to what it draws and measure the start grid: every car part is drawn twice.
- Puddles as patches of the mask on the outside of corners and in dips.
- Spray behind each car as capped additive cards that grow with speed, and rain as a near-camera layer. Judge both in the pack, where they add up.
- Wet grip from the surface table, with a dry line that gains grip if you model one.
- Run the exposure test along the lap in both states.

## HUD

- Speed, gear, revs, position, lap and lap time, split against best.
- A track map from the centre line with car markers.
- Wrong way, reset prompt, a mirror or a rear marker.
- Subtitles for the engineer voice.

## Sound

- Engine as layered loops across revs, cross-faded by revs and load, with pitch following revs. Order loops at stated revs, steady, with no gear change in them.
- Tyres: roll per surface, squeal by slip. Wind by speed. Gear change, backfire, impacts by strength.
- Rivals' engines positional, with a simple distance and pass-by effect.
- Check loop points for clicks and levels across the rev range ([audio.md](../audio.md)).
- Prompt shape for one layer, not run: "steady engine tone of a four-cylinder petrol car held at 4,000 revs under load, constant pitch, no gear change, no acceleration, close exterior, no voice, no music, 8 seconds". Whether a sound model returns a steady, loopable tone is unproven here: order one layer first and measure its pitch drift. The fallback is one good loop pitched by revs.

## Tests specific to the genre

Each is a test to write; none was run in the reference build. The bounds are proposals with no measured source: adjust them after a first figure, and never quote them as results.

| Test                   | Method                                                                                 | Bound to start from                                                               |
| ---------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Scripted lap           | A rival driver completes N laps on every track from the grid                           | No reset, no wall contact, lap time within 2 percent between runs on a fixed step |
| Determinism            | The same inputs replayed give the same lap time                                        | Equal to the step                                                                 |
| Off-track recovery     | Place the car at grid points off the road, facing any way; reset                       | Back on track, forward, every time                                                |
| Fall-through           | Drive the car along both road edges and over every kerb at high and low speed          | No wheel under the surface                                                        |
| Checkpoint order       | Cut each corner; drive backward over the line                                          | Lap not counted                                                                   |
| Frame rate at speed    | Median of three rounds on a lap flown at race speed, plus the start with the full grid | Target held on every sector                                                       |
| Streaming hitch        | Longest frame during a lap at top speed                                                | Under two frames                                                                  |
| Exposure along the lap | The exposure test sampled along the centre line at race speed, in each weather         | Same bounds as on foot                                                            |
| Pop-in                 | Stills every 50 m looking ahead: objects that appear inside the view                   | None on the road side                                                             |
| Wheel contact          | Wheel centres against road height over a lap                                           | Wheels neither float nor sink                                                     |
| Camera                 | Chase camera inside geometry over a lap, tunnels included                              | 0 frames                                                                          |
| Pad, wheel, keyboard   | Functional round with each input; analogue steering and triggers                       | Same checks pass                                                                  |
| Human play             | A person drives three laps per track, each car                                         | Their remarks on grip, steering, speed                                            |

Plus the shared tests: load, flash scan, text overflow, sound files ([testing.md](../testing.md)).

## Traps

- Dressing judged at 1 m and seen at 200 km/h: the effort went to the wrong place.
- A car judged in the garage only. Judge it from the chase camera, in motion, in the pack.
- Wheel origins off centre: the wheels wobble.
- Physics on the frame time: the car handles differently at 30 and at 120 frames per second.
- Keyboard-only tuning: full lock steering at speed feels wrong on a pad.
- A mirror road that draws the whole trackside twice.
- Rivals that are fast on the straight and block every corner.
- A lap that is long and empty: fewer kilometres with more rhythm reads better.

## Open points to decide in the brief

- Arcade or simulation; assists.
- Circuit, point to point or open roads.
- Number of cars on track, damage or none, weather and time of day per track.
- Cockpit view or not (a second build per car).
- Split screen or network play: out of scope here.
- Liveries: run-time paint by material name when only colour changes; a builder retexture with a guide image when the livery has graphics.
- Weather: fixed per race, or changing during it (out of scope here).
