# The bar: what earns the word AAA

Evidence: measured in the reference build (a first-person shooter with five levels, built by an agent on 13 and 14 November 2026). The checks apply to any genre; the figures are from that one game on one machine.

"AAA" in this skill is a claim about the look and the production pipeline, and each part of the claim is a check you can run. Say "AAA-style" for the result. A claim without its pair or its figure is left out of the hand-over.

## Contents

- The eight checks
- What the first human plays found
- What a scripted round cannot tell
- The hand-over sentence for each check

## The eight checks

| Check              | The test                                                                | Pass in the reference build                                                                                    | Where                                                      |
| ------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Look               | Full-size pair: our frame beside the target still, largest gap named    | At least four loops per level, each gap written down                                                           | [production-order.md](production-order.md)                 |
| Asset density      | No empty floor over about 4 m, structure rhythm every 4 to 8 m          | Checked on every grading pose, every loop                                                                      | [world-building.md](world-building.md)                     |
| Light and exposure | Frames over a bound on a grid of reachable points, every lighting state | 15 of 6,033 frames outside a bound (397 of 6,065 before)                                                       | [play-tests.md](play-tests.md)                             |
| Animation          | Foot slide as a share of body speed; clips match game states            | 0.05 at run speed on the walker, 0.04 on the spider                                                            | [characters-and-animation.md](characters-and-animation.md) |
| Sound              | Every event has a sound; each file measured; a person listens           | Measured set; step surfaces by share of the walkable grid                                                      | [audio.md](audio.md)                                       |
| Presentation layer | Key art, title, menus, loading screens, HUD, results; no cut text       | 0 cut texts in 64 menu stills at two sizes                                                                     | [presentation.md](presentation.md)                         |
| Loading            | Longest main-thread block during load, normal, slowed and first visit   | 75 to 383 ms (5.9 to 6.7 s before)                                                                             | [loading.md](loading.md)                                   |
| Frame rate         | Median of three rounds per pose, beside a frozen reference build        | Median of 60 frames per second or more at 18 of 20 test poses (builds v2.1 and v2.2, 1920 x 1080, high preset) | [performance.md](performance.md)                           |

The checks hold for any genre. The tests behind them were written for a first-person game: in [play-tests.md](play-tests.md), tests 3, 5 and 6 are weapon tests and some exposure bounds name a weapon and a reticle. In another genre keep the frame-level bounds and take the rest from the genre file. First load and frame figures are those of that one game.

Two more that are part of the bar and have no single figure:

- **The whole loop plays.** Every level from start to results, win and lose, with checkpoints, pause, options that persist. The reference build ran 136 scripted checks, 136 passed, again on builds v2.7 and v2.8.
- **A person played it.** See the next section. No build is at the bar before one human play with a real pointer lock or real controls.

## What the first human plays found

Every item below passed the scripted tests and the builder's own grading. A person found each one within minutes.

| Found by playing                                                                  | Why the tests had missed it                                                     | The test or rule that now covers it                                       |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Bullet marks in mid air, shots through visible steel (first version)              | Shots were compared with the same boxes that caused the bug                     | Impact test against the drawn frame: [testing.md](testing.md)             |
| The page froze 6 to 7 s at each level start, the browser offered to stop the page | Every test waited for "ready" and measured after it                             | Load test in four conditions: [loading.md](loading.md)                    |
| Light too strong in places and too dark in others                                 | Stills came from four fixed poses per level                                     | Exposure over the whole route: [play-tests.md](play-tests.md)             |
| A white centre while firing at a near wall                                        | No test fired at point blank in a dark room                                     | Firing test: [play-tests.md](play-tests.md)                               |
| Enemies hard to see                                                               | Nothing measured the enemy against its background                               | Contrast at 10, 20 and 35 m: [play-tests.md](play-tests.md)               |
| Some weapons too long to reload                                                   | Reload was tested for function, never timed against feel                        | Reload table: [play-tests.md](play-tests.md)                              |
| Footsteps "not too believable"                                                    | A single-point step test passed while the road answered "metal" on 42 % of it   | Step surfaces over the walkable grid: [audio.md](audio.md)                |
| No sound when the player dies, no voices                                          | The sound list came from the code's events, and the player's own death had none | Event list written from the player's side: [audio.md](audio.md)           |
| One effect everywhere ("water on the floor, it's a little bit everywhere")        | Each level was graded alone                                                     | Restraint with a signature effect: [world-building.md](world-building.md) |
| One weapon drawn back to front                                                    | Orientation was checked on one weapon with one finish                           | Every weapon with every finish: [play-tests.md](play-tests.md)            |
| The armory choice applied one mission late                                        | The scripted round set the loadout through the hook, not through the screen     | Drive menus through the screen itself: [testing.md](testing.md)           |

The pattern: a scripted test proves what its author thought of. Fixed poses, a wait for "ready" and a state set through a debug hook each hide a class of defect. Add the grid, the load and the screen path from the first build, then put a person in front of it early.

## What a scripted round cannot tell

Write these in the hand-over as "not verified" until a person has done them:

- How long a mission takes in human play, and whether the difficulty holds.
- Weapon or vehicle feel, and whether an enemy's warning is readable in a fight.
- Sound by ear: mix, repetition, whether a voice line is understood.
- Motion seen at speed: a body turning, a clip played backward, a mirror switching at a distance.
- Other browsers, other machines, a slow connection.

## The hand-over sentence for each check

```
Look: <level>: <loops> loops, last named gap: <one sentence>
Density: <poses checked>, largest empty floor <m>
Light: <frames over a bound> of <frames>, worst pose <clipped %, worst tile %>
Animation: foot slide <value> at <speed> per walking kind
Sound: <events with a sound> of <events>; heard by a person: <yes, no>
Presentation: <screens>, cut texts <n> at <sizes>
Loading: longest block <ms> normal, <ms> slowed, <ms> first visit; ready in <s>
Frame rate: <n of m> poses at target in every round, lowest median <fps>
Played by a person: <who, how long, what they said>
Not verified: <list>
```
