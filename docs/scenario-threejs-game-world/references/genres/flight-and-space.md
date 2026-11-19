# Flight and space

Evidence: derived from the measured pipeline plus standard practice; not built or tested in the reference build. Craft with named parts, skies, sound and presentation follow measured routes. Six-degree flight, large-scale worlds, terrain and space backdrops are not measured.

## Contents

- What changes against a level on foot
- Asset list and routes
- The craft as a builder asset
- World at large scale
- Camera
- Flight model
- Opponents and targets
- Light and effects
- HUD
- Sound
- Tests specific to the genre
- Traps

## What changes against a level on foot

- **Scale spans from 1 m to tens of kilometres.** A cockpit detail and a mountain or a planet share a frame.
- **The sky is most of the picture.** It gets the first look loops: clouds, sun, haze layers, or stars and nebulae.
- **No floor to dress.** Depth comes from layers: near debris or clouds, mid targets, far terrain or bodies.
- **Speed is hard to read** with nothing near. Something must pass close.
- **All axes are free.** Camera, controls and readability of "up" need decisions.

## Asset list and routes

| Asset                           | Route                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| Target stills                   | Text to image from the chase camera, one per mission phase                                         |
| Player craft                    | Builder build with named parts, judged from the chase camera and in the hangar                     |
| Craft variants and liveries     | Builder edits and retexture with a guide image                                                     |
| Opponent craft, drones, turrets | Builder builds with rigid parts and clips; variants by edit                                        |
| Capital ships, stations, bases  | Builder builds in modular sections with a stated grid; hero sections with named parts              |
| Asteroids, debris, rocks        | Concept image, image to 3D, a small set instanced with rotation and scale                          |
| Terrain                         | A height field with PBR sets blended by slope and height; hero landmarks as built assets           |
| Sky (air)                       | Equirectangular sky as light; cloud layers as cards or volumes                                     |
| Sky (space)                     | Equirectangular star field and nebula, checked at the seam and for banding; planets as lit spheres |
| Sound                           | Engine loops by throttle, wind or hull, weapons, warnings, pass-by, radio voice                    |
| Presentation                    | As in [presentation.md](../presentation.md); hangar as the 3D studio                               |

Describe craft by role, era and shape. No real aircraft types, air forces or liveries unless you hold the rights; a real aircraft named by a user must keep its real structure, so check it against references.

## The craft as a builder asset

- Structure: `root > hull`, then control surfaces with origins on their hinge lines (`aileron_L`, `aileron_R`, `elevator_L`, `elevator_R`, `rudder`, `flap_L`, `flap_R`), `gear_nose`, `gear_L`, `gear_R` with doors, `canopy`, engine nozzles, weapon mounts, lights.
- Clips: `gear_down`, `gear_up`, `canopy_open`. Control surfaces are driven by code from the stick, not by clips.
- Engine glow and lights as their own materials, switched by a colour.
- State length, span and height in metres, forward and up axes, origin at the centre of mass.
- Break-up by named parts: wings, tail, panels ([game-systems.md](../game-systems.md)).
- A cockpit view needs a second, detailed build.

## World at large scale

- **Depth precision.** A near plane of 0.1 m and a far plane of 50 km do not fit one depth range. Use a logarithmic depth buffer or draw far and near in two passes.
- **A floating origin.** Keep the player near the world origin and move the world, or positions shake far from zero.
- **Layers by distance**: near (parts, debris, clouds passing), mid (targets, landmarks), far (terrain, bodies as cards or low detail), sky.
- **Level of detail** per asset, and impostors for the far layer.
- **Terrain** in tiles loaded around the player; the load is sliced ([loading.md](../loading.md)).
- **Space**: a planet is a lit sphere with an atmosphere rim; a sun is a light and a flare, kept under the bloom bound.
- Fog becomes aerial perspective: distance haze that takes the sky's colour.

## Camera

- Chase camera behind and above, with lag in rotation so the craft reads against the horizon.
- The horizon or a reference object stays in frame; in space, a grid of dust or a large body does that job.
- Cockpit or nose view as an option.
- A target camera that keeps a locked opponent in view.
- Field of view widens with speed, behind a switch.

## Flight model

- Fixed time step.
- Arcade: speed along the nose, turn rates by stick, automatic level-out, no stall. Simulation: lift, drag, thrust and stall. Space: thrust and drift, with a flight-assist option that damps drift.
- Invert Y as an option; pad and stick as first-class inputs, keyboard and mouse supported.
- Ground and obstacle contact: explode, bounce or land. State it in the brief.
- Boundaries: a mission area with a turn-back warning, never an invisible wall.

## Opponents and targets

- Pursuit curves: lead the target, break off at a distance, regroup.
- Ground and capital targets with turrets as named parts that track and fire with a telegraph.
- Missiles with a warning time the player can act on.
- Measured on the flying machines of the reference build (a game on foot): an opponent that steers at a goal point with no collider test ends inside solids. Goal points in free air, movement that slides on a blocked axis and an overlap probe are in [game-systems.md](../game-systems.md), "Flying enemies and colliders".
- Markers do the readability work at range: a bracket per target, lead indicator, off-screen arrows. Contrast at 10, 20 and 35 m becomes angular size and marker contrast at 200 m, 1 km and 5 km.

## Light and effects

- One sun. Shadows near the camera only (the craft on itself, the cockpit).
- Clouds: lit cards or a simple volume; flying through one is a fade, not a wall.
- Trails, tracers, engine glow, explosions: additive, capped, judged against the brightest sky.
- Exposure: looking into the sun and into a planet's shadow are the two bounds. Run the exposure test on a sphere of view directions at sampled points.
- Space is not black on screen: stars, a nebula tone and a rim light keep shapes readable.

## HUD

- Speed, altitude or range, heading, throttle, a horizon or attitude cue.
- Target bracket, lead marker, lock tone, missile warning.
- Radar or a sphere map; objective distance.
- Damage state of the craft by part.

## Sound

- Engine loops by throttle, layered, with a pass-by effect for others.
- Air: wind by speed, buffet near stall. Space: hull and system sounds; decide once whether exterior sounds are heard.
- Warnings as distinct tones: lock, missile, ground, boundary.
- Radio voice through a band-pass, with subtitles ([audio.md](../audio.md)).

## Tests specific to the genre

Each is a test to write; none was run in the reference build. The bounds are proposals with no measured source: adjust them after a first figure, and never quote them as results.

| Test                     | Method                                                                                           | Bound to start from                     |
| ------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------- |
| Depth fighting           | Stills at near, mid and far ranges looking at overlapping surfaces                               | No flicker between two frames           |
| Position shake           | Fly to the edge of the mission area; measure vertex jitter of the craft                          | None visible at the far edge            |
| Exposure over directions | At sampled points, look along a sphere of directions                                             | Same bounds as on foot                  |
| Target readability       | Angular size and marker contrast at stated ranges against sky and ground                         | Marker passes the contrast bound        |
| Scripted sortie          | A scripted pilot flies each mission from start to end                                            | Completes, no ground contact            |
| Boundary                 | Fly out of the area in six directions                                                            | Warning, then turn-back, every time     |
| Opponents against solids | The overlap probe of [game-systems.md](../game-systems.md) on a scripted sortie and a stress run | 0 overlap frames, 0 crossings           |
| Frame rate               | Median of three in the heaviest fight and low over the densest terrain                           | Target held                             |
| Streaming hitch          | Longest frame at top speed over terrain                                                          | Under two frames                        |
| Sky seam and banding     | `scripts/sky_seam.py`, plus a still of the darkest sky region                                    | Seam under your bound, no visible bands |
| Inputs                   | Functional round with pad, stick, keyboard and mouse, invert on and off                          | Same checks pass                        |
| Human play               | A person flies each mission                                                                      | Their remarks on control and "up"       |

## Traps

- A sky with a visible seam or bands: it is most of the picture.
- Nothing near the camera, so speed does not read.
- One depth range for a cockpit and a planet.
- Targets as dark dots on a dark sky with no marker.
- A sun inside the bloom with no bound: a white frame.
- Motion with free roll and no horizon cue, without a comfort option.
