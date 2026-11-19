# Asset pipeline: Scenario MCP end to end

Evidence: measured in the reference build, except the lines marked "not exercised". The pipeline is engine-neutral up to the returned files; delivery into three.js is in [threejs-delivery.md](threejs-delivery.md), other engines in [other-engines.md](other-engines.md).

Load the Scenario skills that own each step if they are installed: `scenario` (connection, jobs, uploads), `scenario-image`, `scenario-3d`, `scenario-textures`, `scenario-skyboxes`, `scenario-audio`, `scenario-moderation`. This file says what a game build adds on top of them.

## Contents

- Choosing a model
- The asset map
- Concept images
- Image to 3D, with a shoot-out
- Builder models
- Which 3D route for which asset
- Replacing a family of props late
- PBR material sets
- Skies
- Decals, signs and paper
- Sound, music, voices
- Key art
- Large batches
- Moderation
- File checks before an asset enters the game

## Choosing a model

Never hard-code a model. The catalogue holds over 500 models from 50 providers and changes weekly.

1. `recommend` with the task and quality as the priority.
2. `search` for the asset type sorted by `createdAt:desc`, to see what was added since.
3. `model_schema_get` on the candidates. Read the parameters before writing a prompt or a plan.
4. When two are close, run a small shoot-out on one input and record the choice, the runner-up and the measure.
5. Once a model is validated in a project, keep it for that asset family so the set stays coherent.

Record what was used in a dated file. The record of the reference build is [models-2026-11-15.md](models-2026-11-15.md); read it as a record, not as a recommendation.

## The asset map

| Asset                               | Route                                                       | Judge it                                                   |
| ----------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| Target stills                       | Text to image                                               | Against the brief                                          |
| Prop, painted or organic            | Concept image, then image to 3D                             | In engine at 1 m                                           |
| Machine, vehicle, weapon, structure | Builder model: build with named parts at a face budget      | In engine at play distance, and in motion                  |
| Variant of an asset                 | Builder edit: scene file plus prompt                        | Beside the original, same pose                             |
| Character with a skeleton           | Scenario rigging and motion models                          | [characters-and-animation.md](characters-and-animation.md) |
| Surface material                    | PBR set, then engine calibration                            | On a wall and a floor under the level's light              |
| Sky                                 | Equirectangular sky, seam check, used as light              | Seam figure, then the level lit by it                      |
| Decal, sign, poster                 | Image with transparency, packed in an atlas (not exercised) | On the wall type it belongs to                             |
| Sound effect                        | Sound model, several events per clip, then trim and level   | Measured, then heard by a person                           |
| Music                               | Instrumental cue per level or mood                          | In the mix, under the effects                              |
| Voice                               | Speech model, one voice, then transcript check              | Transcript against the script                              |
| Key art                             | Image edit from the game's own frame                        | Beside the frame: same place, same machines                |

## Concept images

- One concept per asset, on a plain background, three-quarter view, the whole object in frame, even light.
- Name materials and wear, and the reading distance: "reads at 1 m" asks for surface detail, "reads at 30 m" asks for silhouette.
- Use a target still or an accepted concept as style reference so the set holds together. For one character or one car across many images, load `scenario-consistency` if installed.
- A side view alone gives a relief, not a volume. A weapon made from a side view concept did not survive the first-person view.

## Image to 3D, with a shoot-out

- Run two or three image-to-3D models on the same concept.
- Judge the results **in the engine, under the level's light, at 1 m**, never in a viewer on a neutral background. Keep the one that holds at 1 m and note the measure.
- Judge a first-person weapon only in the first-person view, a vehicle only from the chase camera.
- The result is one fused mesh: nothing can move or break off, and a weapon's own optic covers the game's sight. If parts must move, use a builder model.
- Ask for a face count and a texture size that fit the game: luggage and kiosk props in the build were ordered at 14,000 faces with 1024 px textures.
- Generated props go soft within about 2 m. Place them where the player does not press against them, or order the hero ones from a builder model.
- World models and splats read soft up close. They suit a far backdrop and do not suit the hero of a close shot.

## Builder models

A builder model writes and runs modelling code and returns a Blender file. The reference build used one for every machine, weapon and large structure. Find it with `search`: an editable 3D model that accepts a prompt, images and a scene file. The one used in the build is named in [models-2026-11-15.md](models-2026-11-15.md).

In this skill a "builder model" is that 3D generation model, and a "builder agent" is a coding agent that builds a level.

What it can do, each exercised in the build:

- **Build** from a prompt, alone or with 1 to 8 images, with named parts at a face budget.
- **Edit** a returned scene file with a prompt: add a clip, change paint, add parts, make a variant.
- **Retexture** with a guide image (a PBR base colour works as the guide).
- **Split** a fused mesh into named parts.
- **Rig**: an armature came back; skin weights did not ([characters-and-animation.md](characters-and-animation.md)).
- **Clips**: keyframed transforms of rigid named parts, exported as separate glTF animations.

Contract in the build: `prompt` up to 2,000 characters, `images` 1 to 8, `sceneFile` for an edit, `buildEffort` standard, high or maximum, `faceBudget`. Read the schema again; these are the values of one date.

Times in the build: high effort builds 23 to 31 minutes, standard machine builds 12 to 16, a clip edit 4 to 5. Launch them in parallel and work on something else (`jobs_wait` beside local work).

What comes back: one Blender file with named objects, PBR textures, and a studio set (backdrop, lights, cameras) to strip at export. Keep named parts through every optimisation step: no joining.

Prompts are in [builder-prompts.md](builder-prompts.md), edits in [builder-edits.md](builder-edits.md).

The shipped game holds 98 3D assets: 73 image-to-3D meshes and 25 from the builder (19 builds, 6 edits). Results in the build: a furnace of 17 parts, a bridge crane of 14, a metro car with body, roof, glass, interior and bogies, eight machine kinds that all returned the asked structure with no retry, six weapons. A face budget made decimation unnecessary: builds came back at 9,000 to 25,000 triangles.

## Which 3D route for which asset

| The asset                                                                                | Route kept in the build | Why, on what was measured                                   |
| ---------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------- |
| Parts must move or break off                                                             | Builder                 | Named rigid parts with pivots at joints                     |
| Hard-surface silhouette, large hero machine, read at 1 m and 30 m                        | Builder                 | Clean edges at both distances                               |
| Painted, organic or cluttered prop                                                       | Image to 3D             | More painted detail at 1 m                                  |
| A body seen mostly in motion                                                             | Builder                 | Judge in motion: built bodies won in motion and in break-up |
| A static body seen close                                                                 | Image to 3D             | Carries more painted surface detail at 1 m                  |
| First-person weapon                                                                      | Builder                 | Magazine, bolt and sights as parts, driven by the reload    |
| Enclosures and vehicles among the props (booth, switchgear, generator, forklift, hauler) | Builder                 | Flat panels, glass, wheels and a turret as named parts      |
| Loose yard props (cargo, drums, sandbags, pallets, sleepers, reel, barrier)              | Image to 3D             | Painted wear and clutter from the concept                   |

Cost in frames: built bodies cost no more frame time than the meshes they replaced (5 to 13 thousand triangles in 10 to 20 parts against one mesh of 26 thousand), but each rigid part is a draw call. Give a part budget in the prompt ([performance.md](performance.md)).

## Replacing a family of props late

In build v2.7 the reference game replaced all 18 props of one level: 12 by image to 3D and 6 as builds with named parts. What the round showed:

- **Same names, same footprints.** Read the metric size of each old file first. A build must carry the old footprint: a booth prompted at 1.5 by 1.5 m did not fit a place of 3.4 by 2.1 m and was built again. Install under the same file names so the level code does not change.
- **Judge old against new from the same pose, at two distances.** The frozen previous build on the left, the new one on the right, at about 1.5 m and about 5.6 m, one pair per prop. A prop hidden at the pose is posed again on another instance. Then pairs of the level's grading poses, whole frame.
- **Check front and back** on every prop that was rotated to fit: cab, motor and strap faces.
- **A second reader finds what the first let pass.** All 12 were first judged kept; a review of the same pairs found two that were not improvements and one that looked deformed from far. They were redone: a straight-on concept where a three-quarter one had given thin flanges, another seed for a leaning cab. The redone concepts came from the successor of the image model, the newest at that date ([models-2026-11-15.md](models-2026-11-15.md)).
- **Weathering words in a concept carry into the texture.** Concepts that asked for heavy wear gave grainy, greyer surfaces. The redone concepts asked for moderate wear and named what must read (planks, stencilled numbers, chevrons). Detailed textures also bring their own normal map: its strength was set to 0.5 on these props.
- **A new family shifts the palette.** The frames came back a little greyer and had lost a yellow accent. Restored without a new job: base colour pulled toward the old hue on two props (78 and 55 percent, grey-level detail kept) and tints of 0.9 to 1.0 in the manifest.
- **Glass on a small build shows what stands behind it.** The booth's panes became dark glass with a reflection and a dim light behind.
- **Run the checks again**: the scripted round, the load probe and the impact test on that level, and the first-load weight, which grew by 3 MB.
- Captures that show the replaced props (stills, clips, trailer segments, key art made from a frame) are listed and redone, or dated.

## PBR material sets

- Order tileable sets per surface family (concrete, tile, steel plate, grating, asphalt, brick).
- Tell the maps apart by their `source` field in the job result, not by file name or order.
- A smoothness map is the inverse of roughness: invert it.
- **Calibrate in the engine.** The returned roughness is a start. Set roughness, normal strength and tile size on a wall and a floor under the level's light. Tile size in the build: about 0.42 per metre.
- Interior walls are dielectric. A metallic wall does not show diffuse light and goes black between lamps.
- Generated base colours read 5 to 10 times brighter than a dark gunmetal: multiply by 0.2 to 0.3 where a dark paint is wanted (0.85 for a navy).
- Add a wear term in world space in every level material (dirt in corners, runs under edges). Wear in the shader moved the frames more than any single asset.

## Skies

- Order an equirectangular sky and use it as the light of the level: the same texture feeds the background and the environment.
- Check the seam: `uv run --with pillow python scripts/sky_seam.py sky.png`. The kept sky measured 4.9 at the seam against 21.5 for a rejected take.
- Several skies for one place (dry and wet, day and dusk): keep the first sky as the reference image of the next, or edit the kept sky with an image edit model, then rotate each to the same key azimuth. Derived, not run in the build.
- Check where the generated sun sits. A disc 3 degrees above the horizon was lifted 6 degrees and the sky rotated to the azimuth of the key light.
- Choose the sun so that it lights the surfaces of the main views, then check the grading poses.
- For a muted grade, desaturate the sky texture itself; the grade then decides the hue of the shadows.

## Decals, signs and paper

In the build, wear decals (rust and dirt runs, damp, missing tiles, oil, scorch, cracks, hazard bands, scuffs, chips) and paper (torn posters, notice boards, plates, warning signs) live in two atlases of a dressing library and are drawn only, with no collision.

Suggested generated route, not exercised in the build: order each decal as an image with a transparent background, check the alpha edge, pack into one atlas per family, and keep one material per atlas.

Rule from the build: restrict each decal by wall type. Torn posters on tile and missing-tile decals on steel were rejected takes.

## Sound, music, voices

See [audio.md](audio.md) for prompts, checks and the mix. In short: every prompt names source, material, action and space and excludes voice and music; footsteps and hits ask for several separated events per clip; every file is trimmed, levelled and measured with `scripts/audio_check.py`.

## Key art

From the game's own frame, so the art shows the place the player will see ([presentation.md](presentation.md)).

## Large batches

The reference build ran 466 jobs. What kept it manageable:

- **Ledger first.** `python3 scripts/ledger.py jobs.tsv add <kind> <model> name=job_id ...` at launch, before waiting.
- **Read asset ids from the job result**, then `python3 scripts/ledger.py jobs.tsv ids` and `fetch <out-dir> result.json` to download by name.
- **The listing trap.** An asset listing returns prompt text assets as well as media. Fetch with a model filter, one call per model, with a limit of 100.
- **`status`** prints what is still missing on disk.
- **Wait beside local work.** `jobs_wait` on a group of jobs while the level code moves on.
- **Uploads**: ask for an upload URL, then `curl -fsS -X PUT -T file '<url>'`, then complete the upload.
- **A retake gets a new name** in the ledger; the old line stays as the record.
- **Network drops**: wait a minute and retry. With the ledger and the progress file current, a restart costs minutes.

## Moderation

Load `scenario-moderation` when a job is refused. Cases in the build:

- Weapon side views were blocked at output on one image model and passed on another with an accepted image as style reference.
- One machine head prompt was refused and passed after rewording toward the object's function and materials.

Describe the object by shape, material and use in the game. Keep the refused prompt and the accepted one in the ledger notes.

## File checks before an asset enters the game

Run on every returned file (`blender -b model.blend --python scripts/blend_info.py`):

- **Parts**: the names and hierarchy asked for, count as asked.
- **Skinning**: armature present or not, vertex groups per mesh.
- **Textures**: image count and UV layers per mesh. One weapon came back with none.
- **Orientation and origin**: forward axis, up axis, origin at the asked point. A metro car sat 1.1 m low because its origin was not where the prompt said: measure, then place with an offset.
- **Scale**: 1 on every object, dimensions in metres as asked.
- **Metal**: cap metalness between 0.45 and 0.85 and multiply base colour by 0.3 to 0.5 on bright generated metals.
- **Clips**: names, lengths, first and last frame equal on loops (`scripts/anim_info.py`), stride per cycle (`scripts/stride_info.py`).

Then the look: in engine, at play distance, under the level's light, beside its neighbour assets.
