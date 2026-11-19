# Any other genre

Evidence: derived from the measured pipeline plus standard practice. This file is a method for deriving the plan of a genre that has no chapter here (sports, fighting, platformer, survival, stealth, horror, rhythm, city builder, and so on). Nothing in it was built or tested as that genre.

## Contents

- The six questions
- Deriving the asset list
- Deriving the systems
- Deriving the camera
- Deriving the tests
- Short notes per genre
- What to write in the hand-over

## The six questions

Answer them in the brief before any generation.

1. **Where is the camera, and how far from things?** It sets the judging distance of every asset and where the triangle and texture budget goes.
2. **What is on screen the whole time?** That is the hero asset: a weapon, a body, a car, a ball and a pitch, a board.
3. **What moves, and how?** Bodies that bend go through Scenario rigging and motion models. Things made of rigid parts go through builder builds with clips.
4. **What does the player do every few seconds?** That action gets the first prototype, the first sounds and the first timing table.
5. **How large is the world, and how fast does the player cross it?** It sets density rules, modular kits, loading and draw distance.
6. **What must be readable at a glance?** Opponents, the ball, hazards, the goal. That gets a contrast test.

## Deriving the asset list

Start from this table and delete what the game does not have. Add the route from [asset-pipeline.md](../asset-pipeline.md).

| Family           | Ask                                                   | Route                                               |
| ---------------- | ----------------------------------------------------- | --------------------------------------------------- |
| Target stills    | From the game camera, per level or mode               | Text to image                                       |
| Hero asset       | The thing always on screen                            | Builder build, or rigged character                  |
| Bodies that bend | Players, opponents, animals, crowds                   | Scenario rigging and motion models                  |
| Rigid movers     | Machines, vehicles, doors, mechanisms, weapons, tools | Builder build with named parts and clips            |
| Structures       | Buildings, arenas, set pieces                         | Builder builds, modular where they repeat           |
| Props            | Dressing at the judging distance                      | Concept image, image to 3D                          |
| Surfaces         | Ground, walls, special materials (grass, ice, water)  | PBR sets, calibrated in engine                      |
| Sky and backdrop | Sky as light; far scenery                             | Equirectangular sky; cards or world models far away |
| Variants         | Teams, skins, damage states, upgrades                 | Builder edits and retexture                         |
| Effects          | Hits, trails, weather                                 | Code, with generated textures where needed          |
| Interface art    | Icons, portraits, cards, maps                         | Image models with one style reference               |
| Sound            | The event list from the player's side                 | Sound models, measured                              |
| Music and voice  | Cues, commentary, barks                               | Music and speech models, transcript check           |
| Presentation     | Key art, title, menus, loading, HUD, results          | From the game's own frames                          |

For each line write the count, the judging distance and whether parts move. Order one of each family first, judge it in engine, then the rest.

## Deriving the systems

Go through [game-systems.md](../game-systems.md), section "Systems every genre shares", and write one line per system: what the game needs, or "none". The ones most often forgotten: save, difficulty, accessibility, the pause state, and what happens on focus loss.

Then list what is specific: a ball's flight, a combo table, a crafting tree, a beat clock. Each specific system gets a prototype in the grey-box and a test.

## Deriving the camera

| The player controls                      | Camera to start from                          | Chapter to borrow from                                       |
| ---------------------------------------- | --------------------------------------------- | ------------------------------------------------------------ |
| Their own eyes                           | First person                                  | [first-person.md](first-person.md)                           |
| One body                                 | Orbit on a boom                               | [third-person.md](third-person.md)                           |
| A vehicle on the ground                  | Chase with a spring                           | [racing.md](racing.md)                                       |
| A craft in the air                       | Chase with rotation lag                       | [flight-and-space.md](flight-and-space.md)                   |
| Many units, or a hero from above         | Fixed pitch from above                        | [top-down-and-isometric.md](top-down-and-isometric.md)       |
| A body on a plane (platformer, fighting) | Side camera on a rail, framing all players    | Third-person for bodies; frame by the action bounds          |
| A team on a field                        | High side or end camera that follows the ball | Top-down for readability; third-person for bodies            |
| Nothing: the world itself                | Free or guided camera                         | [exploration-and-adventure.md](exploration-and-adventure.md) |

Whatever the camera: it needs collision or bounds, it sets the exposure test's sample positions, and its real distance is where assets are judged.

## Deriving the tests

Every game gets the shared tests of [testing.md](../testing.md): functional round, load, frame rate, flash scan, non-finite pixels, text overflow, sound files, human play.

Then write one test per answer to the six questions:

| Question             | Test                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------- |
| Camera               | Frames with the camera inside geometry or the subject hidden, over the reachable space  |
| Hero asset           | Stills from the game camera in every state and variant                                  |
| What moves           | Clip and state coverage; foot slide or wheel contact; parts list after import           |
| The repeated action  | A timing table; the action tested against what is drawn, not against proxy shapes       |
| World size and speed | Longest frame while crossing the world at top speed; pop-in stills                      |
| Readable at a glance | Contrast of each thing against each background from the game camera, at three distances |

And one rule from the reference build for all of them: a test that sets state through a debug hook, waits for "ready", or looks from a fixed pose has a blind spot. Add the path through the real screen, the load itself, and a grid.

## Short notes per genre

Starting points only.

- **Platformer**: jump arc and landing are the feel; a grace time after a ledge and a buffer before landing; level metrics from the jump; a side or follow camera with look-ahead. Bodies by rigging models; moving platforms as built rigid parts.
- **Fighting**: two hero characters, the largest clip sets of any genre; hit and hurt volumes per frame of each clip; a fixed step and input buffer; a side camera framing both. Test every move's frame data against the table.
- **Sports**: a ball with its own physics, many bodies on one skeleton, a field material that fills the frame, a crowd as cards; a follow camera. Readability of ball and teams is the contrast test.
- **Stealth**: sight cones and sound radii shown to the player; light and shadow are a game system, so the exposure grid also feeds the AI; opponents with clear states.
- **Survival and crafting**: a large world in tiles, a day and night cycle that moves sky, key and exposure together, many small props with states, a save of everything.
- **Horror**: see exploration and adventure; darkness with a readable floor, sound first, few but close assets.
- **Strategy and city builders**: see top-down; modular buildings with construction states as builder edits; the interface from the first line of the brief.
- **Rhythm**: audio latency calibration, a beat clock that drives everything, music cues with exact tempo; visuals follow the clock, never the frame.
- **Puzzle in 3D**: few assets, all inspectable; state machines with saves; a hint path.
- **Multiplayer of any genre**: out of scope here. Networking changes the controller, the tests and the hosting.

## What to write in the hand-over

- The six answers.
- For each asset family: route used, model kept and on which measure.
- For each system and test: built and measured, or planned and not measured.
- The line "this genre has no measured chapter in the skill; figures are from this project only".
