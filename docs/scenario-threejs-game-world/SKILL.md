---
name: scenario-threejs-game-world
description: Use when building or upgrading a real-time 3D game to a AAA-style bar with Scenario MCP as the asset pipeline, in any genre (first person, third person, racing, top-down, flight, adventure), in three.js in the browser or mapped to Unreal or Unity. Also when a level looks like a textured grey-box, built models must keep named parts or clips, a level start freezes the page, or feet slide.
---

# Scenario three.js game world

## Overview

A method for taking a game from a brief to a AAA-style build, with Scenario MCP supplying every generated asset. "AAA-style" means the look and the production pipeline, each claim carried by a full-size pair or a measured figure.

Two layers:

- **Layer 1, engine-neutral**: the bar, the production order, the asset pipeline, characters, world, presentation, sound, systems, the genre chapters, the tests.
- **Layer 2, the runtime pack**: three.js in the browser, written in full because it is the one that was measured. One file maps the steps to Unreal and Unity.

It comes from one build: a first-person shooter with five levels, six weapons and eight kinds of machine opponents, built by an agent and measured on 13 and 14 November 2026. The first-person chapter is measured. The other genre chapters are derived from the measured pipeline plus standard practice and say so in their first line. Never present a derived figure as tested.

**The rule that carries the rest: a full-size pair decides.** Our frame on the left, the target still on the right, both at full size. "Finished" is a statement about that pair, never about a checklist.

## The bar

Eight checks, each with a test: look, asset density, light and exposure, animation, sound, presentation layer, loading, frame rate. Plus two without a single figure: the whole loop plays, and a person has played it. The table, the pass values of the reference build and what the first human plays found: [references/aaa-bar.md](references/aaa-bar.md).

## The order of work

1. **Brief**, with the presentation layer and the sound events listed from the start.
2. **Target stills**: 2 or 3 per level, from the game camera.
3. **Grey-box of the whole loop**: every level, win, lose, results, the debug hook, a deterministic demo pass.
4. **The look on the grey-box**: sky as light, fog, lights, exposure, grade.
5. **Assets**: one of each family first, judged in engine at play distance, then the rest.
6. **Content**, level by level, with the look loop: capture, pair, name the largest gap, fix that gap. At least four loops per level.
7. **Feel**: time everything the player waits for.
8. **Presentation**: key art from the game's own frames, title, menus, loading screens, HUD, results.
9. **Tests**, alone on the machine.
10. **Human play**, as early as one level is playable.

Detail, the brief template and how to run builder agents: [references/production-order.md](references/production-order.md).

## Terms

- **Grey-box**: the game in plain boxes, playable from start to results.
- **Target still**: a generated image of what a view must look like. **Pair**: our frame beside it, both at full size. **Grading poses**: the fixed views of a level captured every loop.
- **Look loop**: capture, pair, name the largest gap, fix that gap, capture again.
- **Builder model**: a 3D generation model that returns an editable scene with named parts. **Builder agent**: a coding agent that builds a level.
- **Structure sentence**: the sentence of a build prompt that lists part names, hierarchy and pivots ([references/builder-prompts.md](references/builder-prompts.md)).
- **Debug hook, page contract**: the state the game exposes and the URL switches it reads, which every script relies on ([references/testing.md](references/testing.md)). **Demo pass**: a scripted route on a fixed step that replays the same frames.

## You are building X: open these files

Always read first: [references/aaa-bar.md](references/aaa-bar.md), [references/production-order.md](references/production-order.md), [references/asset-pipeline.md](references/asset-pipeline.md). At the grey-box, read the page contract in [references/testing.md](references/testing.md).

| You are building                        | Genre file                                                                                      | Read with it                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| A first-person game (shooter, action)   | [genres/first-person.md](references/genres/first-person.md) (measured)                          | builder-prompts, play-tests                                    |
| A third-person game (action, adventure) | [genres/third-person.md](references/genres/third-person.md) (derived)                           | characters-and-animation, builder-prompts, builder-edits       |
| A car race or driving game              | [genres/racing.md](references/genres/racing.md) (derived)                                       | builder-prompts (vehicle), builder-edits, loading, performance |
| A top-down, isometric or strategy game  | [genres/top-down-and-isometric.md](references/genres/top-down-and-isometric.md) (derived)       | characters-and-animation, builder-prompts (modular kit)        |
| A flight or space game                  | [genres/flight-and-space.md](references/genres/flight-and-space.md) (derived)                   | builder-prompts (aircraft), performance                        |
| A walking, story, puzzle or horror game | [genres/exploration-and-adventure.md](references/genres/exploration-and-adventure.md) (derived) | characters-and-animation if bodies are on screen               |
| Anything else                           | [genres/any-other-genre.md](references/genres/any-other-genre.md) (method)                      | the chapter whose camera is closest                            |

Every game, whatever the genre, also goes through: world-building, game-systems, audio, presentation, performance, loading, testing, shipping, and in three.js threejs-delivery and render-recipe. Open each when its step comes:

| You are doing                                                                      | Open                                                                                                                       |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Ordering a 3D asset with parts, or a variant                                       | [references/builder-prompts.md](references/builder-prompts.md), [references/builder-edits.md](references/builder-edits.md) |
| A body that bends, clips, foot slide                                               | [references/characters-and-animation.md](references/characters-and-animation.md)                                           |
| Dressing and lighting a level                                                      | [references/world-building.md](references/world-building.md)                                                               |
| Key art, title, menus, loading screens, HUD                                        | [references/presentation.md](references/presentation.md)                                                                   |
| Presenting the 3D assets with Blender renders                                      | [references/asset-renders.md](references/asset-renders.md)                                                                 |
| Sound, music, voices                                                               | [references/audio.md](references/audio.md)                                                                                 |
| Input, camera, physics, AI, damage, save, difficulty, accessibility                | [references/game-systems.md](references/game-systems.md)                                                                   |
| Getting a returned file into three.js                                              | [references/threejs-delivery.md](references/threejs-delivery.md)                                                           |
| The three.js frame: lights, shadows, mirror, fog, bloom                            | [references/render-recipe.md](references/render-recipe.md)                                                                 |
| A level start that freezes the page                                                | [references/loading.md](references/loading.md)                                                                             |
| Frame rate, pixel cap, idle rate, reduced motion, hidden tab, lost context, phones | [references/performance.md](references/performance.md)                                                                     |
| Writing or running tests                                                           | [references/testing.md](references/testing.md), [references/play-tests.md](references/play-tests.md)                       |
| Static build, hosting inside a page, pointer lock                                  | [references/shipping.md](references/shipping.md)                                                                           |
| Building in Unreal or Unity                                                        | [references/other-engines.md](references/other-engines.md)                                                                 |
| Which models the reference build used                                              | [references/models-2026-11-15.md](references/models-2026-11-15.md) (a dated record)                                        |

## Hard rules

**Method**

- No content before the look is set on the grey-box. No level called finished without at least four loops, each with a full-size pair and the largest gap written down.
- Judge on full-size pairs. Small contact sheets are for coverage; they hide soft textures, banding and empty floor.
- Give builder agents a loop count and a gate, never a duration. A separate reviewer reads the pairs.
- List the presentation layer and the sound events in the first brief.

**Assets**

- Never hard-code a model: `recommend` with quality as the priority, `search` sorted `createdAt:desc`, `model_schema_get`, and a small shoot-out when two are close. Record the choice and the measure.
- Judge every 3D asset in the engine, under the level's light, at play distance. Never accept one from a preview.
- Anything whose parts move or break off is a builder build with named rigid parts, pivots at joints and clips. The build prompt carries the structure sentence, a part count and a face budget.
- Bodies that bend go through Scenario rigging and motion models. Never hand-make a rig or weight a mesh by script. Check the returned file: count vertex groups.
- A variant is an edit of the accepted scene file, never a new build.
- Keep named parts through every optimisation step: no join, flatten or simplify.
- Ledger every job at launch. Fetch assets by model, one call per model.

**World and feel**

- On foot: no empty floor over about 4 m, structure rhythm every 4 to 8 m. Other cameras: the density rule of the genre file.
- One signature effect per level; list them side by side before building.
- A test a player can see (a shot, a hit, a contact) runs against what is drawn, or against volumes that follow the bones of a skinned body. Never against the movement shape.
- Advance walk clips by distance. Never blend walk and run by weight on a legged machine made of rigid parts.
- Every event on the player's side has a sound, including the player's own death.

**Tests and claims**

- Measure the load itself as well as what follows "ready".
- Test light on a grid of reachable points, not on approved stills.
- Drive menus through the screen, not through the debug hook.
- Frame rate is a median of three rounds on a machine left alone, beside a frozen reference build once one exists.
- One headed pass with real controls, then a person plays. Pause heavy agents while they do.
- Write what was not verified by a person. Derived chapters stay marked as derived.

## Requirements

- Scenario MCP connected, with the public Scenario skills that own each step (`npx skills add scenario-labs/skills`): `scenario`, `scenario-image`, `scenario-3d`, `scenario-textures`, `scenario-skyboxes`, `scenario-audio`, `scenario-moderation`. For a full character rig, the `rigged-character-pipeline` Agent Skill, downloadable from the Scenario exploration on a fully rigged character. For Unreal, `scenario-unreal`.
- For the three.js pack: Node 20 or later with `three`, `three-mesh-bvh`, `n8ao`, `vite`, `playwright-core`; Blender 4.2 or later; ffmpeg; ImageMagick 7; `uv`; `npx` for `@gltf-transform/cli`.

## Scripts

Run from the project folder, with the skill's path in front. Each carries its full usage in its header.

| Task                            | Command                                                                                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inspect a returned Blender file | `blender -b model.blend --python scripts/blend_info.py`                                                                                                                     |
| Export without the studio set   | `blender -b model.blend --python scripts/blend_info.py -- --clean out/model.glb`                                                                                            |
| Export clips                    | `blender -b walker.blend --python scripts/export_anim.py -- out/walker.glb`                                                                                                 |
| List parts, pivots and clips    | `blender -b walker.blend --python scripts/anim_info.py`                                                                                                                     |
| Ground speed a walk implies     | `blender -b walker.blend --python scripts/stride_info.py -- --feet foot --clips walk,run`                                                                                   |
| Pack models                     | `sh scripts/pack_glb.sh <out-dir> <texture-size> <in.glb> [...]`, for example `public/models 2048 out/model.glb`                                                            |
| Reduce triangles                | `blender -b --python scripts/decimate.py -- raw/bin.glb out/bin.glb 12000` (input, output, target triangles)                                                                |
| Job ledger                      | `python3 scripts/ledger.py jobs.tsv add <kind> <model> name=job_id`; `<kind>` is your own label (prop, machine, sound). Then `ids`, `fetch <out-dir> result.json`, `status` |
| Sky seam                        | `uv run --with pillow python scripts/sky_seam.py sky.png`                                                                                                                   |
| Sound files                     | `uv run --with numpy python scripts/audio_check.py <out-dir> <report.tsv> name=src:maxdur:peakdb:t` (seconds, dB; `t` trims to the transient, `k` keeps the start)          |
| Still                           | `node scripts/capture/shot.mjs <out-dir> "level=2&demo=1" 4,11.5,23` (times in seconds; or `pose=x,y,z,yaw,pitch` in the query)                                             |
| Pair                            | `sh scripts/pair.sh <ours.jpg> <target.jpg> <out.jpg>`                                                                                                                      |
| Contact sheet                   | `sh scripts/sheet.sh <frames-dir> <out.jpg>`                                                                                                                                |
| Clip of a demo pass             | `node scripts/capture/clip.mjs out/l2.mp4 "level=2&demo=1" 40` (seconds)                                                                                                    |
| Flash scan                      | `python3 scripts/flashscan.py out/l2.mp4`                                                                                                                                   |
| Impact on drawn geometry        | `node scripts/capture/impact.mjs 1,2,3` (levels)                                                                                                                            |
| Non-finite pixels               | `node scripts/capture/nanprobe.mjs "level=3&demo=1" 742` (the frame number a flash scan reported)                                                                           |
| Frame rate                      | `sh scripts/capture/perfround.sh out/perf.log "1 2 3" [reference-dist]` (levels, then a frozen build), then `python3 scripts/perftable.py out/perf.log 60`                  |
| Real pointer lock               | `node scripts/capture/headed.mjs 1,2` (levels)                                                                                                                              |

The capture scripts drive a web page that follows the page contract of [references/testing.md](references/testing.md). They were run with a first-person game: the last section of that file says what to adapt for another camera. In another engine, keep the tests and write the automation there.

## Output: the hand-over

```
Game: <genre, camera, engine>, <levels or tracks>
Build: <path>, <first load MB>, <MB per level>
Look: <level>: <loops> loops, last named gap: <one sentence>
Tests: functional <n of m> | genre tests <name: figure, or "not run"> | load <longest block ms> | frame rate <n of m poses at target, lowest median> | flash <spikes>
Sound: <events with a sound of events>; heard by a person: <yes, no>
Played by a person: <who, how long, what they said>
Measured or derived: <which parts follow a measured chapter, which a derived one>
Not verified: <real controls, audio by ear, mission length, other browsers, phones>
Models used: <asset type: model, how chosen, runner-up>
```

## Red flags

- "The level is done" with no pair on disk, or fewer than four named gaps in the log.
- A builder prompt without the structure sentence, a part count, or speed and stride per gait.
- A character rig accepted from a job status. A design that depends on a skinned body before one has gone through the pipeline.
- A model name copied from the dated record. A bound from a derived genre chapter quoted as a result.
- No person has played, and the hand-over does not say so.
