# Testing

The test set of the build, the page contract the scripts rely on, and what each test measured there. Every script takes paths and queries as arguments and reads `GAME_DIST` (the built game, default `./dist`) and `CAPTURE_HOME` (browser profiles, default the system temp folder).

## Contents

- Setup
- Page contract
- Prove the tools on the example page
- The tests, one by one
- What the build measured
- What no script covers
- Tests added after the first human play
- Tests per genre
- Writing a new test
- The load freeze test
- Driving menus through the screen
- Tests on the hosted copy
- Scripts and their inputs
- The page contract in another genre

## Setup

```bash
npm i -D playwright-core
npx playwright-core install chromium
cp -R dist frozen/dist            # test a frozen copy, so a rebuild does not empty it under the page
GAME_DIST=frozen/dist node scripts/capture/shot.mjs out/look "level=1&demo=1" 4,11.5
```

- The browser is the script's own Chromium, never the one a person or another agent uses. `lib.mjs` picks the newest full Chromium in the playwright browser folder (`CHROME_PATH` overrides it). The full browser in headless mode keeps the GPU; the headless shell renders in software and every frame rate is then meaningless. Check the renderer string once (`__g.gpu` in the build prints the ANGLE backend).
- On macOS the scripts pass `--use-angle=metal`.
- One script per browser profile at a time ("Failed to create a ProcessSingleton" otherwise).
- Start the scripts from the folder that holds `node_modules/playwright-core`.

## Page contract

The game exposes a hook and reads URL switches. Build them with the grey-box, not at the end.

| URL                     | Meaning                                                                |
| ----------------------- | ---------------------------------------------------------------------- |
| `?level=n`              | Start in level n, no menu                                              |
| `?demo=1`               | A scripted pass plays the level: fixed inputs, seeded random generator |
| `?pose=x,y,z,yaw,pitch` | Fixed camera pose, no demo                                             |
| `?capture=1`            | No real-time loop: the page waits for `advance`                        |
| `?q=high`               | Quality tier                                                           |
| effect switches         | One per effect family, for before and after                            |

| `window.__g`                                                                                                                                 | Used by                    |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `ready` (true when the level is loaded)                                                                                                      | all                        |
| `advance(n, draw = true)`: n fixed 1/60 s steps, drawing the last or none                                                                    | all                        |
| `THREE`, `eng { renderer, scene, camera }`                                                                                                   | impact, perf, nanprobe     |
| `eng.reflRT`, `eng._renderReflection()` (or your own target and its render call)                                                             | nanprobe                   |
| `game.mod.poses` as `[x, y, z, yaw, pitch]`, `game.mod.checkpoints` as `[x, y, z, yaw]`: y is the ground under the feet, yaw 0 looks down -Z | shot, impact, perf         |
| `game.world.rayShot(origin, dir, maxT)` returning `{ t, object, mat }` or null                                                               | impact                     |
| `solid(mesh)`: true when the mesh stops a bullet                                                                                             | impact                     |
| `game.actors.list` with an `active` flag; `play()` on the hook, which leaves any menu                                                        | impact                     |
| `game.state`, `game.player { yaw, pitch, pos }`, `game.weapon.ammo`                                                                          | headed                     |
| `info()`: time, level, state, position, counts                                                                                               | clip, your functional test |
| `audio(t0, t1)`: the sound event log rendered offline (optional)                                                                             | clip                       |

The page adds its eye height to a pose; `impact.mjs` adds 1.65 m. The extra query of `impact.mjs` and `perf.mjs` is given as `bug=1` or `&bug=1`.

## Prove the tools on the example page

`scripts/capture/example-page/` holds the hook on the smallest page that satisfies it (a floor, forty boxes, one moving target, about 200 lines), written from the table above and nothing else. It is not the game. Run it once before wiring the hook into your own game: it shows that the browser, the GPU path and the scripts work on this machine, and that the two tests that matter most can fail.

```bash
mkdir -p hook/dist && cp <skill>/scripts/capture/example-page/* hook/dist/
cp node_modules/three/build/three.module.js node_modules/three/build/three.core.js hook/dist/
export GAME_DIST=hook/dist
node <skill>/scripts/capture/shot.mjs hook/out "level=1&demo=1" 1,3
node <skill>/scripts/capture/impact.mjs 1                        # PASS
node <skill>/scripts/capture/impact.mjs 1 hook/bug.json bug=1    # FAIL: shots tested against inflated boxes
node <skill>/scripts/capture/nanprobe.mjs "level=1&nan=1" 10     # names bad_plane
```

Measured on 2026-11-14 with three.js 0.187 (older releases have no `three.core.js` to copy): 0 of 27,648 rays in mid air on the clean page; 18,395 in mid air and exit code 1 with `?bug=1`; 1,008 non-finite pixels and the object `bad_plane` named with `?nan=1`, 0 without. `shot.mjs`, `clip.mjs` and `perf.mjs` ran on it too.

- Keep one planted defect per test behind a URL switch in your own game, and see each test fail on it once.
- To plant a non-finite pixel, take a `pow` of a negative number. `z / z` and `log(z) - log(z)` with z at 0 gave none on this GPU: the shader compiler folds them.

## The tests, one by one

**Functional loop per level.** Your own script on the hook: every phase of every level, win, lose, checkpoint restart, each weapon, each menu screen. It is specific to the game, so it is not in `scripts/`. Add a text overflow check with DOM Ranges on every screen: the build found 15 cut texts that way.

**Deterministic pass.**

```bash
node scripts/capture/clip.mjs out/clips/l2.mp4 "level=2&demo=1" 40
sh scripts/sheet.sh out/clips/l2.mp4.frames out/clips/l2_sheet.jpg
```

One fixed step per frame, so capture speed does not matter and a second run gives the same frames. The sheet (one frame per second) shows glare, a stuck actor, an empty stretch.

**Impacts.**

```bash
node scripts/capture/impact.mjs 1,2,3 out/tests/impact.json
```

For a grid of rays from many views, the game's own shot distance is compared with the depth of the drawn frame at the same pixel. It counts impacts in mid air and passes through visible geometry, and lists the objects behind the largest groups. A level passes under 1 percent of each kind. Name what remains in the report (silhouette edges, far objects drawn without a hit mesh on purpose).

**Flash scan.**

```bash
python3 scripts/flashscan.py out/clips/l2.mp4
```

Mean level per frame through ffmpeg; a frame far above both neighbours is a spike. Exit code 1 on any spike. It also prints the highest frame mean with its time: a glare of half a second is not a spike and shows only there and on the sheet.

**White frame source.**

```bash
node scripts/capture/nanprobe.mjs "level=3&demo=1" 742
```

Draws every frame up to the reported one (stepping without drawing did not reproduce the defect), reads the half-float target back, counts non-finite pixels, then hides scene objects one at a time, four levels deep, until the count is zero. In the build four guesses cost ten minutes before this probe named the object in one run. `flashscan.py` counts frames from 0 and the pass can be one frame apart, so the probe also tries the two next frames and prints the one it read. Run again on the build's frozen copy with the defect: frame 209 from the scan, 3 non-finite pixels at frame 210, one object named (`Mesh:ShaderMaterial:transparent:additive`, the haze cones of the lamps).

**Frame rate.**

```bash
sh scripts/capture/perfround.sh out/tests/perf.log "1 2 3" versions/v1/dist 1
python3 scripts/perftable.py out/tests/perf.log 60
```

Each pose: 480 frames through `requestAnimationFrame` with vsync off, the first 180 dropped (shader compilation), median and mean of the rest, draw calls and triangles of a whole frame. Three rounds, each preceded by the same measure on a frozen reference build (rows tagged REF): when REF moves between rounds, the machine was loaded and the round says so. The table gives the median and the range per pose and the count of poses at the target in every run.

- One pose read 54.5, 67.3 and 78.3 fps in three identical runs on a shared GPU. A single run is not a result.
- A video encode on all cores moved single poses by 10 to 20 fps. Nothing else on the GPU while measuring; if that is not possible, say so next to the table.
- To find what costs a frame, compare one pose with and without one effect switch in alternating runs, and count draw calls by scene root.

**Real pointer lock.**

```bash
node scripts/capture/headed.mjs 1,2,3
```

A windowed Chromium with the browser's own lock: deploy, lock granted, mouse look, walk, fire, lock lost (pause opens), resume. It needs an unlocked screen: under a locked macOS session the browser refuses the lock ("WrongDocumentError"). The script reads the session flag first and prints SKIPPED. A skipped pass goes in the hand-over as "real pointer lock not exercised".

**Sound.** `scripts/audio_check.py` per set (see SKILL.md). State in the hand-over whether a person listened.

**Stride of a clip, before wiring.** `blender -b walker.blend --python scripts/stride_info.py` reads the ground speed and stride of each clip from the feet. It needs no game.

**Foot slide, in engine.** Move a machine in a straight line at a set speed, with clips driven by the game code, and measure the world speed of each foot while it is in the lowest 12 percent of its height range, as a share of the body speed (0 planted, 1 dragged).

## What the build measured

| Test                      | Result on the final build                                                                                                                                                                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Functional                | 123 of 123 checks on the five levels; after a later build, 90 of 90 on the two levels it changed                                                                                                                                                                                   |
| Impacts                   | at most 11 in mid air and 10 through per level, out of 48,384 to 62,208 rays (first version: 8,637 and 4,621 of 33,760)                                                                                                                                                            |
| Flash                     | 0 spikes in five 40 s clips (17 single white frames in three clips before the guard)                                                                                                                                                                                               |
| Frame rate                | 18 of 20 test poses hold 60 frames per second at 1080p (1920 x 1080, high preset, Apple M5 Max, build v2.2); a later run, measured while other applications loaded the GPU, read 57.2 on one level (6 of 8 poses held 60) and its record says the target is not shown as met there |
| Foot slide                | 0.05 walker, 0.04 spider; small crawler 0.36 to 0.38 with its walk clip, 0.02 at the tip once the walk was computed from ground distance (see game-systems.md)                                                                                                                     |
| Hosting under a subfolder | 7 of 7 checks                                                                                                                                                                                                                                                                      |
| Real pointer lock         | 30 of 30 on the hosted build with `headed.mjs`; an earlier run was refused because the screen was locked                                                                                                                                                                           |

On build v2.7 (the 18 props of one level replaced): scripted round 136 of 136; level 1 load ready in 4.8 s with a longest block of 106 ms; impact test on level 1, 2 rays in mid air and 8 through of 48,384. The frame rate round was not run again in full on that build.

On builds v2.8 (flying enemies kept to free air) and v2.8.1 (pixel cap, idle rate, reduced motion): scripted round 136 of 136 on v2.8. On v2.8.1 every functional check passed; the frame rate gate failed in one run on a loaded machine (52.6 frames per second) and passed on reruns, and one real-time check (hit points half a second after a respawn) failed in 1 of 6 runs of one level, with the reduced-motion preference on or off. The overlap probe of flying enemies read 0 and 0 on both builds ([game-systems.md](game-systems.md)); the pixel cap, idle rate and reduced-motion probes are in [performance.md](performance.md). Level 1 on v2.8.1: ready in 4.2 s, longest block 202 ms.

## What no script covers

Say each of these in the hand-over when it applies: no person has played the build; sound was measured, not heard; one browser engine only; mission length and difficulty not judged; frame rate measured on a shared GPU.

## Tests added after the first human play

The tests above passed on a build that froze at every level start and had white frames while firing at a near wall. Two more files hold what was added, as methods with their figures (their tools are not packaged here):

- [loading.md](loading.md): the longest main-thread block during load, in normal, slowed and first-visit conditions.
- [play-tests.md](play-tests.md): exposure along the whole route, named regression poses, the firing test, enemy contrast at distance, weapon orientation for every finish, reload times and step surfaces.

## Tests per genre

The tests above are shared by every genre. Each genre file adds its own table; only the first-person one was run.

| Genre                     | Tests it adds                                                                                                              | Status           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| First person              | Impact on drawn geometry, weapons, real pointer lock, firing at point blank, weapon orientation, reload table              | Run in the build |
| Third person              | Camera clipping and occlusion on a grid, foot slide through starts and turns, aim agreement, melee reach, telegraph length | To write         |
| Racing                    | Scripted lap, determinism, recovery, fall-through, checkpoint order, frame rate and hitch at speed, pop-in                 | To write         |
| Top-down and isometric    | Hero visible, click target, paths, largest fight, unit contrast, team readability                                          | To write         |
| Flight and space          | Depth fighting, position shake, exposure over directions, target readability, boundary                                     | To write         |
| Exploration and adventure | Scripted walkthrough, reachability, sequence breaks, save and load, close inspection, voice queue                          | To write         |
| Any other                 | One test per answer to the six questions                                                                                   | To write         |

See [genres/first-person.md](genres/first-person.md), [genres/third-person.md](genres/third-person.md), [genres/racing.md](genres/racing.md), [genres/top-down-and-isometric.md](genres/top-down-and-isometric.md), [genres/flight-and-space.md](genres/flight-and-space.md), [genres/exploration-and-adventure.md](genres/exploration-and-adventure.md), [genres/any-other-genre.md](genres/any-other-genre.md).

## Writing a new test

The pattern of every test that held in the build:

1. **A question a player would ask.** "Do my shots land where I see them?" and not "does the ray function return a hit?"
2. **Against what is drawn or heard.** The frame, the drawn triangles, the audio file, the screen text.
3. **Over a grid, a route or a full list.** Every reachable point, every weapon with every finish, every screen at two sizes. Never one pose.
4. **Through the real path.** Real key and mouse events, the real menu, the real load.
5. **A number and a bound**, written before the run.
6. **Prove the tool** on a small page where you know the answer (`scripts/capture/example-page`) before trusting a pass.
7. **Run it alone** on the machine when timing matters, and three times when the figure varies.

## The load freeze test

No test of the first versions measured the load: each waited for "ready" and measured after it, while every level start blocked the page for 6 to 7 s.

- Record the longest main-thread block between the click that starts a level and "ready", in four conditions: normal, slowed CPU, a fresh browser profile, and shader text the machine has never seen (the true first visit).
- Bound in the build: no block over 500 ms. Result after slicing the world build: 75 to 383 ms.
- Under a slowed CPU the bound was exceeded in 3 of 10 runs (553, 598, 812 ms): state it.
- Method, traps and figures: [loading.md](loading.md).

## Driving menus through the screen

A scripted round that sets the loadout through the hook passed while the armory screen applied the choice one mission late. For every choice a player makes in a menu:

- click the real control;
- start the mission;
- read through the hook that the choice is the one in play.

## Tests on the hosted copy

Run the functional round and the headed pass again on the hosted build, inside the page that frames it. Results there: 136 of 136 and 30 of 30. Compare file hashes of the hosted copy with the frozen build.

## Scripts and their inputs

- Every script reads only the paths it is given and writes only its output path.
- `perftable.py`, `flashscan.py`, `ledger.py` and `sky_seam.py` were run twice on small inputs: inputs unchanged, same output on the second run, no file opened outside the input folder, the scripts and Python's own libraries. `ledger.py add` refuses a name already in the ledger, and `fetch` skips a file already on disk.
- Capture scripts need the page contract; frame rate scripts need the machine alone.

## The page contract in another genre

The contract above and the capture scripts were run with a first-person game only: numbered levels, and a pose `[x, y, z, yaw, pitch]` at the feet with the eye height added. For another camera or subject, adapt the page, not the scripts, where you can. Derived; not run.

| Script input                  | First person (run)          | Third person                                                                            | Racing or flight                                                            |
| ----------------------------- | --------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `level=<n>`                   | Level number                | Level number                                                                            | Track or mission number; weather and time as extra switches (`wet=1`)       |
| `pose=x,y,z,yaw,pitch`        | Player feet, view direction | Character feet and facing; the camera takes its boom place, `pitch` sets the boom pitch | Vehicle position and heading on the road; the chase camera follows its rule |
| `demo=1`                      | Scripted route              | Scripted route with fights                                                              | A lap or sortie by the scripted driver or pilot                             |
| Levels list of `perfround.sh` | "1 2 3"                     | Levels                                                                                  | Tracks; run the round once per weather with the extra-query argument        |
| Hook state                    | Player, weapon, actors      | Add character state, clip name, camera position and whether it is pulled in             | Add speed, lap, sector, wheel contact, position in the race                 |

- `impact.mjs` belongs to games with aimed shots. A racing game has no use for it; its counterpart is the wheel contact and fall-through tests of the genre file.
- `headed.mjs` tests pointer lock. A game played without it needs a headed pass for its own controls.
- New genre tests read the hook and act through real events, like the shipped ones.
