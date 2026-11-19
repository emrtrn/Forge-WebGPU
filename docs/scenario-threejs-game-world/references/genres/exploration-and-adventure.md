# Exploration and adventure

Evidence: derived from the measured pipeline plus standard practice; not built or tested in the reference build as a genre. The world, light, dressing, sound, voice and presentation routes are the measured ones, and a first-person walk through dressed levels is what the reference build renders. Puzzles, dialogue, inventory, saving a world state and long play sessions are not measured.

Covers walking and story games, puzzle adventure and horror, in first or third person.

## Contents

- What changes against an action game
- Asset list and routes
- Camera and controller
- World as the main content
- Interaction
- Story and voice
- Characters
- Puzzles and progression
- Light and mood
- HUD
- Save
- Tests specific to the genre
- Traps

## What changes against an action game

- **The player looks at everything, slowly, from close.** Props are picked up and turned. The 1 m rule becomes a 0.3 m rule for anything that can be inspected.
- **The world is the content.** There is no fight to carry a plain room. Every space needs a reason, a composition and things to read.
- **Sound and voice carry half the experience.**
- **State is long-lived**: what was opened, taken, read and solved has to be saved.

## Asset list and routes

| Asset                          | Route                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Target stills                  | Text to image, 3 per space: wide, mid, and one close on the object that tells the story                             |
| Spaces                         | Level kit plus dressing library ([world-building.md](../world-building.md))                                         |
| Hero structures and mechanisms | Builder builds with named parts: doors, levers, lifts, machines, a vehicle                                          |
| Inspectable objects            | Builder builds at 2048 px, or image to 3D judged at 0.3 m; generated props go soft that close, so choose per object |
| Readable items                 | Notes, signs, screens: text drawn by the engine on a generated paper or screen image, never generated lettering     |
| Props                          | Concept image, image to 3D                                                                                          |
| Characters                     | Scenario rigging and motion models; or voices and traces only, with no body on screen                               |
| Sky, weather                   | Equirectangular sky as light, per time of day                                                                       |
| Sound                          | Room tones per space, steps per surface, every interaction, weather                                                 |
| Voice                          | Narrator or characters, one voice each, transcript check, subtitles                                                 |
| Music                          | Cues per place and per story beat                                                                                   |
| Presentation                   | As in [presentation.md](../presentation.md), with a chapter select                                                  |

## Camera and controller

- First person: as in [first-person.md](first-person.md), without weapons. Walk speed lower, a run option, a small head bob behind a switch.
- Third person: as in [third-person.md](third-person.md).
- A focus on the object under the cursor: a soft highlight and a prompt.
- An inspect mode: the object in front of the camera on a dimmed scene, turned with the mouse, lit by a studio rig parented to the camera ([presentation.md](../presentation.md), 3D preview).
- Comfort options: field of view, bob off, a centre dot, motion blur off.

## World as the main content

- Compose each space for the first view on entering: a lit goal, a path, a frame.
- Dressing tells what happened: what is out of place, worn, left behind. List three such details per space in the brief.
- Density and rhythm rules apply at walking pace, and the player will reach every corner: check from a top view that no area is bare and that no prop sits under the floor.
- Vary the signature of each space; restraint with any effect used twice.
- Landmarks visible from far, so the player always knows where they are without a map.

## Interaction

- One verb key for the object in focus: open, take, read, use.
- Mechanisms are built assets with named parts driven by code or clips: a lever arm, a valve wheel, a door leaf, a lift cage.
- Every interaction has a sound and a visible change of state.
- Carried objects: held in front of the camera on its own depth range, with simple collision against walls.
- An inventory only if puzzles need it.

## Story and voice

- Script first, as lines with an id, a speaker, a trigger and a subtitle.
- One voice per speaker with fixed settings, chosen on the processing it goes through (radio, tape, room).
- Transcribe every line and compare with the script ([audio.md](../audio.md)).
- Triggers by place, by interaction and by time, never two lines at once: a queue with priorities.
- Text in the world comes from the same script file.

## Characters

- If bodies are on screen and seen close, they are the costliest assets of the game: face, hands, lip sync, eye contact. Use the `rigged-character-pipeline` recipe skill for a face rig with blendshapes.
- Lip sync from the voice file through the blendshapes: not exercised here.
- A game of this genre can hold without bodies on screen: voices and machines only. Those two routes are measured.

## Puzzles and progression

- Each puzzle is a small state machine with a save key.
- State what the player must notice, and place a light or a sound on it.
- A hint after a stated time without progress.
- Gates between chapters are also loading boundaries.

## Light and mood

- Light is the guide: the brightest area of a view is where the player goes.
- Dark games still need a readable floor and exits: run the exposure grid test with its lower bound, and give a brightness slider with a calibration image.
- Time of day and weather per chapter change the sky, the key and the wetness mask together.
- Horror: darkness with a hand light as a shadowed key. Fade haze near the eye, and judge at point blank in the darkest room.

## HUD

- Almost none: the prompt, the subtitle, a centre dot.
- A journal or objective line on a key.
- Inventory as a strip, if any.

## Save

- Save at every chapter gate and at every solved puzzle: position, chapter, the state table of interactables, inventory, lines already played.
- A version number in the save, and a test that an old save loads or is refused with a message.
- In a browser, `localStorage` holds small saves; say that clearing site data removes them.

## Tests specific to the genre

Each is a test to write; none was run in the reference build. The bounds are proposals with no measured source: adjust them after a first figure, and never quote them as results.

| Test                 | Method                                                                                  | Bound to start from                      |
| -------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------- |
| Scripted walkthrough | A script completes every chapter through the real interactions                          | Completes; time written down             |
| Reachability         | Flood the walkable grid from the start: every interactable is reachable, no player trap | No unreachable item, no pit without exit |
| Sequence breaks      | Try each puzzle's last step first                                                       | Refused or handled                       |
| Save and load        | Save at each gate, reload the page, compare state                                       | Equal                                    |
| Old save             | Load a save of the previous version                                                     | Loads or is refused with a message       |
| Close inspection     | A still of every inspectable object at 0.3 m                                            | No soft texture, no open back            |
| Readable text        | Every note and sign at the reading distance, at two window sizes                        | Legible, no cut text                     |
| Voice queue          | Trigger every line in a scripted round                                                  | No overlap, subtitles match              |
| Exposure             | Grid test in every space and lighting state                                             | Within bounds, floor readable            |
| Human play           | A person plays a chapter without help                                                   | Where they got lost, what they missed    |

## Traps

- Generated lettering on signs and notes. Draw text in the engine.
- A prop that reads well at 2 m and falls apart when inspected.
- A room with nothing to look at between two story beats.
- Two voice lines triggered at once.
- A dark scene tuned on one monitor.
- State kept in memory only: a reload loses an hour.
