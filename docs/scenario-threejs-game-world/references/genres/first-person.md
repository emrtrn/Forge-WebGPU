# First-person action

Evidence: measured in the reference build, a first-person shooter with five levels, six weapons and eight kinds of machine opponents, in three.js. Figures are from that build.

## Contents

- Asset list and routes
- Camera and controller
- Weapons
- Animation
- Physics and hits
- Opponents
- Level loop
- HUD
- Sound
- Tests specific to the genre
- Traps

## Asset list and routes

| Asset                                  | Count in the build                            | Route                                                        |
| -------------------------------------- | --------------------------------------------- | ------------------------------------------------------------ |
| Target stills                          | 2 or 3 per level                              | Text to image                                                |
| Weapons as view models                 | 6                                             | Builder build with named parts, one first, then the rest     |
| Weapon finishes and editions           | Several per weapon                            | Run-time finish by part name; builder edit when parts change |
| Opponents                              | 8 machine kinds                               | Builder build, rigid named parts, clips                      |
| Hero structures                        | A few per level                               | Builder build (furnace, crane, metro car)                    |
| Props                                  | Many per level                                | Concept image, image to 3D, judged at 1 m                    |
| Surface sets                           | Per level                                     | PBR sets, calibrated in engine                               |
| Sky                                    | Per outdoor level                             | Equirectangular sky as light                                 |
| Pickups (ammunition crates, lockers)   | 2 kinds                                       | Builder or image to 3D                                       |
| Sound                                  | Steps on 6 surfaces, weapons, machines, death | Sound model, several events per clip                         |
| Music                                  | One cue per level                             | Instrumental cue                                             |
| Voice                                  | 56 operator lines                             | Speech model, transcript check                               |
| Key art, title, menus, loading screens | Per level                                     | [presentation.md](../presentation.md)                        |

The camera is at eye height and comes within a metre of walls and props. Everything is judged at 1 m.

## Camera and controller

- Pointer lock on a click. Mouse look with a sensitivity option, invert Y, a field of view option.
- Walk, run, crouch, jump against the collision boxes of the level kit.
- Step sounds by distance walked, with the surface from the level data.
- Exposure settles at once at a respawn. Suggestion, not in the build's records: keep head bob and weapon sway small, with a switch.
- An aim key held, plus a toggle key for players who prefer it. The hint for aiming fades after three aims.
- Sprint and weapon switch cancel a reload.

## Weapons

- Six in the build: the player takes two from the armory plus a sidearm. Ammunition crates and lockers in the levels.
- Build prompt: view model, metres, muzzle toward -Z, top toward +Y, origin at the centre of the receiver, named parts for everything the reload moves ([builder-prompts.md](../builder-prompts.md)).
- Order one weapon, judge it in the first-person view, then order the rest. The first one corrected the brief: textures missing, a scope too large for the hip view.
- An image-to-3D weapon has true volume but is fused, and its own optic covers the game's sight. It can serve as a world prop, not as the view model.
- The reload is one timeline driven by named parts ([game-systems.md](../game-systems.md)): tilt, release, the magazine drops as a physical object, a fresh magazine, seat, and a bolt stage only when the chamber was empty. Shotgun and launcher load round by round. A chambered round is counted: 30 becomes 31.
- The HUD shows a progress bar and the stage word during a reload.
- A shot asked during a shell reload leaves 0.22 s later.
- Scope: a radial gradient with a blurred backdrop outside the circle; scope parts scaled 0.74 at the hip.

## Animation

- View model: the reload is driven by code on named parts, not by clips.
- Opponents: clips `idle`, `walk`, `aim`, `fire`, `hit` on rigid parts, phase by distance, one mixer each ([characters-and-animation.md](../characters-and-animation.md)).
- The `aim` clip length is the warning the player gets.

## Physics and hits

- **Shots are tested against the drawn triangles**, with a bounds tree per hit mesh. Collision boxes are for the player's body only.
- The first version tested shots against boxes: marks hung in mid air and shots passed through visible steel. A person saw it in the first minute.
- Far skyline objects that are drawn without a hit mesh are named in the impact test, so a miss there is known.
- Parts that break off fly as simple bodies ([game-systems.md](../game-systems.md)).

## Opponents

- Built animated machines with named parts, from the start.
- Each kind has its own way of moving and an attack with a telegraph (1.2 s, 0.9 s, 1.4 s for a bomb in the build).
- Machines break apart into their parts when destroyed ([game-systems.md](../game-systems.md)).
- Readable at 10, 20 and 35 m: light where they stand, then a highlight option ([world-building.md](../world-building.md)).
- An alert sound when one wakes, a marker on the minimap.
- Flying machines keep to free air: goal points and movement are tested against the static colliders, and a probe counts overlaps per level ([game-systems.md](../game-systems.md), "Flying enemies and colliders").
- Three difficulties. Suggestion: change health, damage and counts, and keep the telegraph length.

## Level loop

- Arrive, a first contact, a signature space with the main fight or task, a last beat, extraction. Checkpoints at each beat.
- "Signal lost" on death, with retry from the last checkpoint.
- Results with time, a grade, the best record stored in the browser.
- The brief of the build asked for 5 to 8 minutes per mission. The scripted round completes levels with position cuts, so mission length in human play was not measured: say so.

## HUD

- Health, ammunition with the chambered round, the weapon in hand, the objective.
- Reload progress and stage.
- Minimap from the collision layout, with player arrow, objective, pickups and machine markers; a key shows the sector.
- Subtitles for the operator voice.
- Suggestion, not in the build's records: a hit marker and a direction cue for incoming damage.

## Sound

- Per weapon: shot, empty click, each reload stage, switch.
- Steps on every surface of the level for walk, run, crouch, land, jump.
- Per machine kind: alert, move, warn, fire, destruction.
- Player hit, final hit, the death sequence with the mix closing down ([audio.md](../audio.md)).

## Tests specific to the genre

| Test                              | Command or method                                                                    | Result in the build                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Impact on drawn geometry          | `node scripts/capture/impact.mjs 1,2,3`                                              | From 8,637 mid-air and 4,621 through of 33,760 rays to single figures per level of 48,384 to 62,208 rays |
| Six weapons                       | Functional round: fire, empty, reload stages, switch, cancel                         | 33 checks                                                                                                |
| Movement and input                | Functional round                                                                     | 11 checks                                                                                                |
| Real pointer lock                 | `node scripts/capture/headed.mjs 1,2`                                                | 30 of 30 on the hosted build                                                                             |
| Firing at point blank in the dark | [play-tests.md](../play-tests.md), test 3                                            | No white centre                                                                                          |
| Enemy contrast at distance        | [play-tests.md](../play-tests.md), test 4                                            | Rows failing at 10, 20, 35 m                                                                             |
| Weapon orientation per finish     | [play-tests.md](../play-tests.md), test 5                                            | Every weapon, every finish                                                                               |
| Reload times                      | [play-tests.md](../play-tests.md), test 6                                            | A table per weapon                                                                                       |
| Step surfaces                     | [play-tests.md](../play-tests.md), test 7                                            | Shares of the walkable grid                                                                              |
| Flying enemies against colliders  | The overlap probe of [game-systems.md](../game-systems.md): demo pass and stress run | From thousands of overlap frames and crossings to 0 and 0 on the three levels with drones                |

The remaining impact cases sit on silhouette edges.

## Traps

- A simulated pointer lock passes while the real one fails. One headed pass.
- A weapon judged in a viewer looks fine and fails in the view: wrong scale, sight covered, back to front with one finish.
- Muzzle flash and haze at point blank in a dark room whiten the frame.
- A loadout built at page load ignores the armory until the next mission.
- Exposure adapting from black after a respawn hides the first second of a fight.
- A reload tuned by function alone is too long: time it against the fight.
