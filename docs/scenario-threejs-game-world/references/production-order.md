# Production order

Evidence: measured in the reference build (five levels, one lead agent with builder agents, 13 and 14 November 2026). The order is engine-neutral. Loop counts and times are from that build.

## Contents

- The order in one table
- The brief
- Step 1: target stills
- Step 2: grey-box of the whole loop
- Step 3: the look on the grey-box
- Step 4: assets
- Step 5: content, level by level
- Step 6: feel
- Step 7: presentation
- Step 8: tests
- Step 9: human play
- The look loop
- Running builder agents
- Ledgers and progress files

## The order in one table

| Step | What exists at the end                                                   | Gate to the next step                                              |
| ---- | ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 1    | 2 or 3 target stills per level, one sentence each on what must match     | The owner, or the brief, accepts the stills                        |
| 2    | The whole game loop in plain boxes: start, play, win, lose, results      | A scripted pass completes every level                              |
| 3    | The render recipe, sky, fog, exposure and grade on the grey-box          | A grey-box frame beside the target already shares light and colour |
| 4    | Hero assets built and judged in engine at play distance                  | Each asset passes the file checks and the 1 m look                 |
| 5    | Each level dressed, lit and graded                                       | The look loop ends: the largest gap is small and named             |
| 6    | Controls, camera, weapons or vehicles, enemies, sound in place and timed | The play tests pass                                                |
| 7    | Key art, title, menus, loading screens, HUD, results                     | No cut text; every screen reachable                                |
| 8    | Functional, impact, light, load, frame rate, flash and NaN tests         | All run alone on the machine, figures written down                 |
| 9    | A person has played every level with real controls                       | Their remarks are fixed or listed as open                          |

Steps 4 to 7 overlap in practice. Steps 1 to 3 do not move: content placed before the look is set gets redone.

## The brief

Write the brief before any generation. A brief that lacks one of these lines produces a build that lacks it.

```
Game: <genre, camera, one sentence of the loop>
Levels or tracks: <n>, each with <place, time of day, weather, one signature element>
Target: <frame rate> at <resolution> on <machine>, in <browser or engine>
Look: 2 or 3 target stills per level (made in step 1)
Player: <body, weapons, vehicle, abilities>
Opponents: <kinds, how each moves, how each is beaten>
Hero assets: <list, each with reading distance and whether parts move or break off>
Dressing: <prop families per level>
Sound: <events from the player's side: moving, acting, being hit, dying, winning>, music, voices
Presentation: key art per level, title treatment, splash, menus, loading screens, HUD, results
Tests: functional round, <genre tests>, load, frame rate, human play
Hand-over: what a person must still verify
```

The presentation line was missing from the first brief of the reference build. The game shipped its first version with no key art, no title treatment and plain loading text, and a second round had to add them.

## Step 1: target stills

- Generate 2 or 3 stills per level with an image model picked by `recommend`. Wide establishing view, a mid view at play height, one close view of the signature element.
- Write under each still what must match: light direction and colour, fog depth, floor material, the density of objects, the brightest and darkest area.
- If a set of target frames already exists (a mood board, concept art), use it the same way. Do not publish target frames that are not yours.
- These stills are also the first input of concept images for hero assets, so the world and its assets share one look.

## Step 2: grey-box of the whole loop

- Boxes with collision, a player controller, one opponent as a capsule, objectives, a win and a lose state, a results screen in plain text.
- All levels, not one. The loop of level 5 exists before level 1 is dressed.
- Add the debug hook and the URL switches of the page contract now ([testing.md](testing.md)): every later test depends on them.
- Add a deterministic demo pass per level: a scripted camera or player route on a fixed time step with a seeded generator. Clips, contact sheets, the flash scan and the trailer all come from it.

A grey-box must look like one. If it is shown later (a making-of, a film), plain grey boxes with a grid read as a grey-box; half-textured boxes read as a poor level.

## Step 3: the look on the grey-box

Set the frame before the content: the sky as light, fog, the light loop, shadows, ambient occlusion, bloom, exposure, tone curve and grade ([render-recipe.md](render-recipe.md), [world-building.md](world-building.md)).

- Judge a grey-box frame beside the target still. Light direction, fog colour and the black level can match with no asset in the scene.
- In the reference build a level with plain cylinders in place of machines reached the standard of level 1 one loop after built models replaced them. The look was already there.

## Step 4: assets

See [asset-pipeline.md](asset-pipeline.md). Order one hero asset of each family, judge it in engine, then order the rest: a first weapon came back without textures and with a scope too large for the hip view, and the remaining orders were corrected from it.

## Step 5: content, level by level

Run the look loop below on each level. Dress in layers, in the order of [world-building.md](world-building.md).

## Step 6: feel

Time everything a player waits for (reload, respawn, a door, a countdown) and write the table. Tune from the table, then from a person's remarks ([play-tests.md](play-tests.md)).

## Step 7: presentation

See [presentation.md](presentation.md). Key art comes from the game's own frames, so this step needs step 5 at least on one pose per level.

## Step 8: tests

See [testing.md](testing.md), [play-tests.md](play-tests.md), [loading.md](loading.md), [performance.md](performance.md) and the tests of the genre file.

## Step 9: human play

Hand the build to a person as early as a level is playable, with real controls. The reference build split one round in two so that a person could play the lighting changes before the rest was finished. The remarks came back within minutes and changed the order of the remaining work.

Ask for remarks in their own words and keep them verbatim in the progress file. "The most important part seems the lighting to me" set the next round.

## The look loop

One loop:

1. Capture the grading poses of the level at full size (`scripts/capture/shot.mjs`).
2. Build a pair for each pose: our frame beside the target still (`sh scripts/pair.sh`).
3. Open the pair at full size. Write one sentence: the largest gap.
4. Fix that gap only.
5. Capture again.

Rules that came from the build:

- **At least four loops per level.** The levels of the reference build took 13, 6, 4, 8 and 5 loops. A level declared finished after one loop was a textured grey-box.
- **The pair decides, not the checklist.** "Finished" means the largest gap on a full-size pair is small and named. A list of placed objects is not a look.
- **Small cells lie.** A contact sheet of small frames hides noise, banding, soft textures and empty floor. Builders graded their own frames kindly from small sheets. Use sheets for coverage and full-size pairs for judgement.
- **One flattering pose misleads.** Keep at least four poses per level, one of them the worst view you can find, and the same poses every loop.
- **Pacing trap.** A builder given a time budget moved to close-out at 40 percent of its time. Give a loop count and a gate instead of a duration: twenty minutes per level gave textured grey-boxes.
- **One switch per effect family.** A URL factor per family (lamps, fog, haze, bloom, grade) set to zero finds the source of a defect in one capture per family.
- **A black surface: test the albedo before the light.** Multiply the base colour first; a surface that stays black under a strong lamp has a material problem.

A loop took about ten minutes in the build once the capture scripts and the pair script were in place.

## Running builder agents

- **One long run per level, then fix rounds.** A builder that owns one level end to end keeps its context. Short runs restart the grey-box each time.
- **Give each builder its own module and its own number generator.** Kit geometry in its own file with its own seeded generator, so that work on one hall does not shift validated areas of another.
- **Name the gate, not the time.** "Four loops, each with a full-size pair and the gap written in the progress file."
- **A separate reviewer reads full-size pairs.** The builder's own grade is kind.
- **Pause heavy agents while a person plays.** Captures from several agents on one machine load it enough to spoil a play test (a load average of 25 was recorded in the reference build). While a person tests by hand, captures run one process at a time or not at all.
- **Frame rate needs the machine alone.** Runs vary by about 20 percent between identical rounds on a shared GPU. Take the median of three rounds per pose, and measure a frozen earlier build in the same round as the reference for machine load.
- **Captures side by side.** Fixed-step captures with different browser profiles can run together. Real-time screenshots time out under load. Two scripts on one profile fail at launch.
- **Never rebuild under a running page.** Add files to a served build with an atomic swap of the folder.
- **Read a model's schema before framing it.** A new model was once described by analogy with an older family before its schema was read, and the plan built on it was wrong.
- **Ask for real usage figures early** when cost will be reported. An estimate built on assumed list prices does not replace them.

## Ledgers and progress files

- **Job ledger**: one line per generation job with kind, model, name, job id, asset id and local path (`scripts/ledger.py`). A retake gets a new name. See [asset-pipeline.md](asset-pipeline.md).
- **Progress file**: one dated line per step, with the figure or the named gap. Network drops and restarts cost minutes when the progress file and the ledger were current.
- **Look log**: per level, per loop, the sentence naming the largest gap and what was changed.
- **Models used**: a dated file, since the catalogue changes ([models-2026-11-15.md](models-2026-11-15.md) is the record of the reference build).
- **Rejected takes**: keep them with one line on why. The build rejected opaque glowing cylinders as tanks, torn posters on tile, missing-tile decals on steel, and gas puffs that whited out a room.
