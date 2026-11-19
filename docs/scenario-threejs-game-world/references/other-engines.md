# Other engines: Unreal and Unity

Evidence: not exercised in the reference build. The reference game runs in three.js in a browser. This file maps each step of the method to Unreal and Unity for a reader who builds there. Tool names for Unreal were read from the Scenario skill for the Unreal plugin on 15 November 2026; nothing here was run for this skill. Verify each name against the installed skill or plugin before use.

## Contents

- What carries over unchanged
- What changes per engine
- Unreal
- Unity
- Step by step mapping
- Export from Blender to an engine
- What to re-measure

## What carries over unchanged

Layer 1 of this skill is engine-neutral:

- the bar and its checks ([aaa-bar.md](aaa-bar.md));
- the production order and the look loop ([production-order.md](production-order.md));
- the asset pipeline through Scenario MCP up to the returned files ([asset-pipeline.md](asset-pipeline.md));
- builder prompts and edits ([builder-prompts.md](builder-prompts.md), [builder-edits.md](builder-edits.md));
- characters and animation routes ([characters-and-animation.md](characters-and-animation.md));
- world building rules, presentation, audio, the genre chapters;
- the human play and the hand-over.

## What changes per engine

- the render recipe: an engine has its own lighting, reflections, fog, post-processing and exposure. Use them; do not port the three.js shader patches;
- delivery: import formats, materials, collision, level of detail;
- tests: the capture scripts of this skill drive a web page. An engine needs its own automation for the same tests;
- loading and performance figures: all of them.

## Unreal

Use the **Scenario for Unreal Engine** plugin and the `scenario-unreal` skill. The plugin runs a local server inside the Unreal Editor that an agent connects to; the skill explains the connection (the plugin's Agent page writes the configuration, and the token is never pasted in a chat).

Order of calls, as the skill gives it:

1. `scenario_status`: signed in, project, permissions and spending rules. **Read the permissions first.** With "Change this project" or Python execution switched off, the world and film tools refuse. Tell the user which switches a task needs before starting.
2. `scene_summary`, `object_detail`, `screenshot_viewport`: look before changing.
3. `list_models` with a lane (image, video, 3d, material, audio, environment, render) or `recommend_models`, then `model_schema`.
4. `estimate_cost`, then `generate` with the returned quote, then `wait_for_job`. A paid call is never retried blindly: the skill has a recovery call for a job whose answer was lost.
5. `prepare_result_application` with a purpose (import, place, material, environment, media plate, mesh edit), then `apply_result_application`. Read the checks in the result: scale, triangles, bones, materials.
6. `save_changes`.

Kit tools named in the skill for larger steps: `build_world`, `dress_world`, `make_game`, `dress_template`, `make_film`, `render_film`, `play_level`. They need the "Change this project" permission.

Notes from the skill that matter for this method:

- Scenario 3D models face +Y in that plugin; the apply step has a front yaw setting. Check orientation on the first asset.
- For editor work that is not generation (actors, Blueprints, materials, sequences, lighting), the skill points to Epic's own editor server and to an Unreal expert skill if one is installed.

Mapping of the look: sky as light becomes a sky light with the generated sky; baked practical lamps become the engine's lights with its global illumination; the planar mirror becomes the engine's reflections; height fog and light cones become its volumetric fog; exposure, bloom and grade become its post-process volume. Judge with the same full-size pairs.

## Unity

Scenario publishes a plugin for Unity (the public repository `scenario-labs/unity-plugin`, package `com.scenario.unity`). Its tool list was not read for this skill, and no Scenario skill for Unity was installed where this skill was written. Treat the lines below as a plan to verify:

- Check what the installed plugin exposes before planning around it. If it offers an agent connection, read its tool list and follow the same order as above: status, look, choose a model, generate, apply, save.
- If it does not, generate through Scenario MCP as in [asset-pipeline.md](asset-pipeline.md), download the files, and import them with an editor script.
- Use an engine expert skill for Unity if one is installed.

Mapping of the look: sky as light becomes the skybox with environment lighting; baked lamps become baked or mixed lights with light probes; the mirror becomes planar or screen-space reflections of the chosen render pipeline; fog and cones become its volumetric fog; exposure, bloom and grade become a post-processing volume.

## Step by step mapping

| Step of the method   | three.js (measured)                  | Unreal                                                   | Unity                                            |
| -------------------- | ------------------------------------ | -------------------------------------------------------- | ------------------------------------------------ |
| Target stills        | Scenario MCP                         | Plugin or Scenario MCP                                   | Scenario MCP or plugin                           |
| Grey-box             | Boxes in code                        | Blockout geometry in a level                             | Primitives as a blockout                         |
| Look on the grey-box | [render-recipe.md](render-recipe.md) | Sky light, fog, post-process volume                      | Skybox, fog, post-processing volume              |
| Props                | Image to 3D, pack, load              | Generate and apply with purpose import or place          | Generate, import as model asset                  |
| Machines with parts  | Builder file, export GLB, mixer      | Builder file, export FBX or GLB, skeletal or rigid parts | Builder file, export FBX or GLB, Animator        |
| Skinned characters   | Scenario rigging, glTF skin          | Scenario rigging, skeletal mesh, animation blueprint     | Scenario rigging, humanoid or generic avatar     |
| Materials            | PBR set, calibrate in code           | Apply with purpose material, calibrate in the editor     | Material from the set, calibrate in the editor   |
| Sky                  | Equirectangular as environment       | Apply with purpose environment                           | Skybox material                                  |
| Sound                | Web Audio                            | Engine audio, sound cues                                 | Engine audio, mixer                              |
| Menus and HUD        | DOM over canvas                      | Engine UI                                                | Engine UI                                        |
| Functional test      | Browser automation                   | Engine automation tests, `play_level` for a look         | Engine play mode tests                           |
| Frame rate           | `perfround.sh`, medians of three     | Engine profiler on fixed poses, medians of three         | Engine profiler on fixed poses, medians of three |
| Human play           | Hosted page                          | A packaged build                                         | A build                                          |

## Export from Blender to an engine

A builder model returns a Blender file whatever the engine.

- Inspect it first: `blender -b model.blend --python scripts/blend_info.py` (parts, hierarchy, triangles, textures, clips).
- Strip the studio set (the `--clean` option exports a GLB; for FBX use Blender's exporter on the same selection).
- Keep named parts as separate objects. In an engine they import as a hierarchy of meshes or as bones of a rigid skeleton, depending on the import settings: choose once and check the names after import.
- Unreal works in centimetres with Z up, Unity in metres with Y up, and Blender in metres with Z up; the importers convert. Keep metres in the build prompt, and check the first asset in the level beside a human-height marker.
- Clips: one action per clip survives as one animation per clip. Check names and lengths after import.

## What to re-measure

Every figure of this skill that comes from the three.js build: frame times, draw calls, loading blocks, download weights, exposure bounds, contrast rows. Keep the tests and their bounds; take the figures again in your engine and write them in the hand-over.
