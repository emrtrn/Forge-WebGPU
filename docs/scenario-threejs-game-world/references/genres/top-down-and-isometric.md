# Top-down and isometric

Evidence: derived from the measured pipeline plus standard practice; not built or tested in the reference build. Covers action role-playing, twin-stick action, strategy and tactics seen from above. Asset routes are the measured ones; unit counts, selection, pathfinding for many agents and the high camera are not measured.

## Contents

- What changes against a camera at eye height
- Asset list and routes
- Camera
- Controls
- Characters and units
- World
- Light from above
- Many agents
- HUD and interface
- Tests specific to the genre
- Traps

## What changes against a camera at eye height

- **Everything is seen from 12 to 40 m, from above.** Roofs, floors and tops of objects are the picture. Judge assets from the game camera, never at 1 m.
- **Silhouette and colour separate things**: player, allies, enemies, loot, hazards, walkable ground.
- **Many small bodies** instead of a few large ones. The budget per body is small and instancing matters.
- **The interface is half the game** in strategy and role-playing: panels, lists, tooltips, icons.

## Asset list and routes

| Asset                      | Route                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| Target stills              | Text to image at the game camera's angle and height, with units in frame                    |
| Hero character             | Scenario rigging and motion models, judged from above; 10,000 to 25,000 triangles to start  |
| Units and creatures        | One body per family, variants by edit or retexture; rigid machines by the builder route     |
| Buildings                  | Builder builds with named parts (roof, walls, door, damage states); roofs that hide indoors |
| Modular kit                | Builder builds: wall, corner, gate, floor tile, stair, bridge, on a stated grid size        |
| Props and loot             | Concept image, image to 3D, at low face counts                                              |
| Terrain materials          | PBR sets blended by a mask; paths and edges as decals                                       |
| Icons, portraits, item art | Image models with a style reference; load `scenario-game-assets` if installed               |
| Effects                    | Ground rings, area markers, projectiles: drawn in code, coloured by team                    |
| Sound, music, voice        | As in [audio.md](../audio.md); many short confirmations and barks                           |
| Presentation               | As in [presentation.md](../presentation.md); far more interface art than an action game     |

## Camera

- A fixed pitch between 45 and 65 degrees, perspective with a narrow field of view (20 to 35 degrees) or orthographic.
- Follows the hero with a small lag, or pans freely with edge scroll and keys in strategy.
- Zoom between two stated heights. Rotation in steps of 90 degrees, or none.
- What stands between camera and hero is cut away or faded: roofs, near walls, tree tops.
- The mirror, the fog and the haze of the render recipe are tuned again: from above, height fog reads as a layer over the ground.

## Controls

- Action: move with keys or stick, aim with mouse or second stick. The aim point is the cursor's ray on the ground plane.
- Click to move: a ray to the navigation mesh, a path, a marker on the ground.
- Strategy: box selection, groups, orders with a right click, a queue with a modifier key.
- Every order gives feedback within a frame: a marker, a sound, a voice bark.

## Characters and units

- One skeleton per family so clips are shared ([characters-and-animation.md](../characters-and-animation.md)).
- Clips read from above: wide arm and weapon arcs, clear wind-ups. Subtle motion is lost.
- Minimum set: idle, move, attack, hit, die, plus one per ability.
- Team or rarity colour on a material slot asked for by name in the prompt.
- A selection ring and a health bar per unit carry what the small body cannot.

## World

- A grid or a navigation mesh from the collision layout decides where things go; the kit's grid size is in every build prompt.
- Dressing layers still apply, seen from above: ground wear, path edges, roof detail, clutter at the base of walls.
- Density rule from the camera: no bare ground wider than about a quarter of the view.
- Interiors: roofs hide when the hero enters, with floors and walls dressed for the high view.
- Height differences need ramps and stairs that read at a glance.

## Light from above

- A key from one side at 35 to 50 degrees so that every object throws a readable shadow on the ground.
- Shadows are the main depth cue: one shadowed key over the visible area, with a map sized to the view.
- Local lamps as baked lights with small haze; from above, cones read as pools on the ground.
- Exposure is steadier than at eye height, but run the grid test indoors and at night all the same.
- Enemy contrast is measured against the ground they stand on, from the game camera ([play-tests.md](../play-tests.md)).

## Many agents

- Instanced or shared-geometry bodies; clips updated at a lower rate for far or off-screen units.
- Pathfinding budget per frame, with paths spread over frames.
- Local avoidance so groups do not stack.
- A cap on active effects and sounds per kind.
- Budget to start from: decide the largest fight (for example 60 units on screen) and measure that pose first.

## HUD and interface

- Action: health, resource, abilities with cooldowns, a minimap.
- Role-playing: inventory, character sheet, item tooltips, a quest log.
- Strategy: resources, selection panel, build menu, minimap with orders.
- Every panel passes the text overflow test at two sizes ([presentation.md](../presentation.md)).
- Icons generated as a set with one style reference, checked at the size they are shown.

## Tests specific to the genre

Each is a test to write; none was run in the reference build. The bounds are proposals with no measured source: adjust them after a first figure, and never quote them as results.

| Test             | Method                                                                         | Bound to start from                      |
| ---------------- | ------------------------------------------------------------------------------ | ---------------------------------------- |
| Hero visible     | Walk the walkable grid: frames where the hero is hidden and not cut away       | 0                                        |
| Click target     | Clicks on a grid of screen points: the order lands where the ray hits          | Every reachable point                    |
| Path             | Paths between sampled pairs of points: found, and walked without getting stuck | All pairs on the main route              |
| Largest fight    | Frame rate median of three with the stated unit count, effects on              | Target held                              |
| Unit contrast    | Each unit kind against each ground material from the game camera               | The bound of the contrast test           |
| Team readability | Stills in greyscale and in simulated colour blindness: teams told apart        | By shape or mark, not colour alone       |
| Selection        | Box select, groups, orders in a scripted round                                 | Same result every run                    |
| Interface text   | Text overflow on every panel at two sizes                                      | 0 cut texts                              |
| Human play       | A person plays a full mission                                                  | Their remarks on readability and control |

## Traps

- Assets ordered with detail on the sides and none on the top.
- A grade that works at eye height and flattens the ground from above.
- Units of two teams told apart by hue alone.
- Roofs that hide the fight.
- Sound stacking when twenty units act at once.
- An interface built last: in this genre it is in the brief from the first line.
