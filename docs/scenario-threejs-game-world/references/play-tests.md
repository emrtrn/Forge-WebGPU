# Lighting and readability tests

Seven tests that the first human play of the build showed were missing, with the figures of 14 November 2026. The approved stills had shown none of these defects: they come from fixed poses, and a player stands everywhere.

The tools of that build are not packaged with this skill. Each test below is a short script on the page hook (`window.__g`, contract in [testing.md](testing.md)): set a pose, draw, read pixels or state.

## 1. Exposure along the whole route

Walk a grid of reachable points, four headings at each, in every lighting state of the level, plus the demo route. Count the frames outside a bound:

| Measure                     | Bound                |
| --------------------------- | -------------------- |
| Clipped pixels              | over 1 % of frame    |
| Crushed pixels              | over 25 % of frame   |
| Median luminance (0 to 255) | under 12 or over 110 |
| Floor band                  | under 8              |
| Weapon                      | under 7 or over 150  |
| Reticle box clipped         | over 30 %            |

Build: 397 of 6,065 frames outside a bound before, 15 of 6,033 after. Per level after: 1, 5, 3, 3 and 3 frames.

Draw two frames before the first captured frame of each pose, or the exposure meter has not settled.

## 2. Named regression poses

Keep a file of poses where a person saw a defect, and measure each one on every build with two figures: the share of the frame that is clipped, and the largest share of clipped pixels in one tile of an 8 by 6 grid. The tile measure finds a white blob that covers under 1 % of the frame.

Build, one pose: 2.98 % of frame and 70 % of the worst tile before, 0.46 % and 12.2 % after. Worst pose after: 0.34 % and 12.5 % (3.97 % and 45.7 % before). Median of the darkest pose: 18 before, 26 after. Judge each before and after pair at full size as well.

## 3. Firing test

Every weapon, from the hip and sighted, against a wall at 2 m and at about 15 m, in the darkest room of each level, 2 s per run. A run fails when over 30 % of the reticle box is white on any frame.

Build: six weapons, 120 runs. Before: 24 runs failed (290 of 14,400 frames). After: 0.

Limits that fixed it, all near the eye: particles fade within 8 m, the impact light falls with the fourth power of distance under 10 m, the flash plane and the muzzle light scale with the nearest hit under 6 m.

## 4. Enemy contrast at distance

Render the same frame with and without the enemy at 10, 20 and 35 m, in the state the player meets it (lit as in play, highlight on if the game has one). A row passes with a contrast of 12 display levels or more and 50 % or more of its pixels changing visibly.

| Build state                             | Failing rows at 10 m | 20 m    | 35 m    |
| --------------------------------------- | -------------------- | ------- | ------- |
| Before                                  | 1 of 13              | 1 of 14 | 8 of 14 |
| After the lighting work, no highlight   | 4                    | 6       | 8       |
| Final: default rim light plus flat lift | 1                    | 1       | 6       |

Median contrast on the final build: 23.3, 22.1 and 16.9 display levels. The middle row is the lesson: fixing exposure made the machines harder to see until they got their own light.

## 5. Weapon orientation for every finish

Check every weapon with every finish, never one weapon with one finish: a finish can come from a file with another orientation. Build: 12 wrong of 54 before, 0 of 54 after.

## 6. Reload times as a table

Read reload time from the game state, chambered and empty, per weapon. A table makes "too slow" a figure.

| Weapon           | Before (chambered / empty) | After         |
| ---------------- | -------------------------- | ------------- |
| Rifle            | 2.02 / 2.72 s              | 1.55 / 2.08 s |
| SMG              | 1.65 / 2.22 s              | 1.52 / 2.03 s |
| Marksman rifle   | 2.33 / 3.15 s              | 1.95 / 2.63 s |
| Sidearm          | 1.48 / 2.00 s              | 1.10 / 1.50 s |
| Shotgun          | 0.52 s per shell           | 0.47 s        |
| Grenade launcher | 0.68 s per round           | 0.60 s        |

## 7. Step surfaces over the walkable grid

Ask the game for the footstep surface at every point of the walkable grid and print the shares. A single-point footstep test passed while the road of level 1 answered "metal" on 42 % of the grid (its collider material was named after steel). After the fix: concrete 51 %, water 42 %, gravel 5 %, metal 2 % on level 1.

## Voice lines

56 operator lines were transcribed with two speech models. A line fails only when both miss the script.

## Traps

- **A demo pass hides a flying enemy inside a wall.** The drones crossed walls and ended inside buildings, and no still or scripted check showed it. A per-frame probe of every enemy sphere against the static colliders did: thousands of overlap frames before the fix, 0 after ([game-systems.md](game-systems.md), "Flying enemies and colliders").
- **A bug behind a comment.** The per-frame effects update sat after a `// note` on one long source line, so sparks, smoke, tracers and flashes were spawned and never advanced, in every build of the second version. It showed as a white centre while firing and was first treated as exposure. On a line with more than one statement, write comments as `/* ... */` only, and test that something each effect owns has moved after one second.
- **Additive blending wrote into frame alpha.** The ambient occlusion pass reads frame alpha as transparency, so occlusion vanished around every additive sprite and drew hard edges. Found by hiding one class of objects at a time, then changing only the blend function. Fixed once at GL level (additive blending leaves frame alpha alone), behind a URL switch.
- **A capture of the old build.** An apostrophe in a shader comment inside a single-quoted string broke the build, and the capture ran on the previous one. Chain `build && capture`, never `build; capture`.
- **Never edit a shell script while it runs.**
