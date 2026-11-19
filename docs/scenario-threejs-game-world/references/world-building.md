# World building

Evidence: measured in the reference build (five interior and exterior levels, first-person camera). Distances are for a camera at eye height; for other cameras scale them as the genre file says.

## Contents

- Layout
- The level kit
- Dressing layers, in the order that moved frames most
- Density and rhythm
- Light
- Exposure
- Fog, haze and light cones
- Wet surfaces and mirrors
- Enemy readability
- Restraint with a signature effect
- Scale
- Traps

## Layout

- Draw the route first: start, the beats of the loop (arrive, fight or task, move on), the end. One signature space per level, reached in the first third.
- Each space has a sight line to the next goal: a lit door, a tall machine, a coloured lamp.
- Cover and obstacles every few metres on a fight floor, never a bare hall.
- Checkpoints at each beat. Retry starts from the last one.
- Keep the collision layout as data. The minimap, the step surfaces, the exposure grid and the AI all read it.

## The level kit

Levels in the build are code on a small kit:

- boxes with collision (walls, floors, platforms, stairs);
- placed generated props with a hit mesh;
- baked practical lamps with a fixture model and a haze cone;
- shadowed spot lights for the one or two keys;
- signs, doors, water and wet masks;
- a dressing library, drawn only, with no collision: wear decals, posters, cable ladders, ducts, pipes, hoses, chains, litter.

Give kit geometry its own module and its own seeded generator, so a change in one hall does not shift what was validated in another.

## Dressing layers, in the order that moved frames most

1. **Wear in every surface shader.** A world-space term for dirt in corners, runs under edges, damp near the floor. No asset did as much.
2. **A haze cone under every practical lamp.** Additive, soft, strength 0.035 to 0.14, with a longer base (`base: 0.5`) for long shafts.
3. **A shared decal atlas and a paper atlas.** Rust and dirt runs, missing tiles, oil, scorch, hazard bands; posters, notice boards, plates, warning signs.
4. **Ceiling services.** Ducts, cable ladders, pipes. The upper third of an interior frame is ceiling; left bare it reads as a box.
5. **Built hero machines** in place of plain shapes. One level reached the standard of the first one loop after built models replaced cylinders.
6. **Small clutter with thickness.** 96 pieces of litter with real thickness in one hall, luggage, a kiosk: every plain block replaced by an object.
7. **Surface atlases with variation.** A tile atlas with dirt runs, missing tiles and a patch, so a wall does not repeat.

Restrict each decal by wall type. Check prop heights from a top view and count visible props per room: props placed without a height sat under the floor for two versions.

## Density and rhythm

- **No empty floor over about 4 m** in any grading pose.
- **Structure rhythm every 4 to 8 m**: a column, a beam, a door frame, a rib.
- Check both on every pose, every loop. A pose that fails gets an object, not a texture.

## Light

- **The sky is the first light.** Environment and background from the same texture, rotated to the key azimuth.
- **One or two shadowed key lights per level**, with static shadow maps redrawn only when something moves in the cone. A key can change place, colour and cone with a stage of the level.
- **Practical lamps are baked into the light loop** with their fixture and haze cone ([render-recipe.md](render-recipe.md)). Lamp states (on, flicker, alarm) go through one colour uniform.
- **Verify the shadows exist.** The shadow maps of the first version were never rendered. Capture with shadows off and on and compare.
- **A lamp close under a ceiling burns it.** A tube 0.4 m under a ceiling puts 25 to 60 times the floor irradiance on the ceiling. Give each baked lamp a minimum radius so the light point stays at the fixture.
- **Emissive objects need a local light.** A glowing tank with no light near it reads as a sticker.
- **Soft bounce lamps are set against the lamp scale.** A bounce of 0.34 was right at lamp scale 5 and invisible at 2.2.
- **Metallic walls do not show diffuse light.** Keep interior walls dielectric.
- **Choose the sun for the main views**, then check the grading poses.

## Exposure

- Exposure follows the picture. The level value is the fixed exposure of [render-recipe.md](render-recipe.md). A meter reads the 1 x 1 log average of the frame and scales that value by 0.5 to 2.2 so that the average moves toward a key set per level (a target for the log average, 0.042 to 0.070 in the build).
- Settle it at once on the first frame and at a respawn, so the player never watches it adapt from black.
- Give a brightness slider in the options.
- Test it on a grid of reachable points in every lighting state, not on four poses ([play-tests.md](play-tests.md)).
- Lower the ceiling on scattered light, put a soft knee on bloom, add one level of dither, and check for banding in the darkest room.

## Fog, haze and light cones

- Height fog and raymarched cones share one pass.
- Keep fog neutral. A hall went flat green from coloured fog; colour belongs in the lamps.
- Haze cones: 32 sides, squared profile, fading within 1.8 m of the eye.
- Haze on moving lights adds up in closed rooms (a pink veil for ten seconds in one fight). Fade it with distance to the player: full at 8 m, 5 percent at 2 m.
- Judge unlit smoke and haze in the darkest room, with the largest wave, at point blank.
- Additive layers need separate alpha blending so they do not lift the alpha of the frame.

## Wet surfaces and mirrors

- A wet floor needs a mirror. A dielectric puddle reflects 4 percent head on and renders black.
- One planar mirror for the main floor, with a distance rule for what it draws ([performance.md](performance.md)).
- For sheets of water elsewhere, capture the room once into a cube (512 px, six small renders at load) and use unlit sheets: lit sheets took one pose from 84 to 61 frames per second, unlit ones gave 68.
- One wetness mask per level, read by the ground shader: puddles, film, darkening, roughness, mirror.
- Glass tank recipe: transparent standard material at opacity 0.2 with a strong environment reflection, an inner emissive fluid cylinder drawn on its back side, an additive bubble cylinder that scrolls.

## Enemy readability

Measured in the build at 10, 20 and 35 m as the number of test rows where the enemy fails a contrast bound against its background ([play-tests.md](play-tests.md)).

- First fix the light where enemies stand.
- Then a highlight: a rim light plus a small flat lift that grows from 6 to 30 m, in a colour per level, with an option Off, Subtle, Strong. Default subtle.
- An alert sound when an enemy wakes and a marker on the minimap carry what the picture cannot.
- Telegraphs are part of readability: an `aim` clip and a light or sound cue of the same length.

## Restraint with a signature effect

The first version put a wet mirror floor in every level. Seen in play, a mirror floor everywhere reads as a default look. Keep it for the levels where the fiction has water.

- Give each level its own signature and its own way of being wet or dry: a tunnel with a wet track bed and leaks; a dry hall with oil stains and dust; one polished hall.
- List the signature effect of every level side by side before building. If two lines read the same, change one.
- Grade the levels together on one sheet at the end, not each alone.

## Scale

- Work in metres from the grey-box on. Usual starting values (standard practice, not figures of the build): door 2.1 m, corridor 2.5 to 4 m wide, ceiling 3 m for a room and 8 m and more for a hall, stair rise 0.17 m.
- State dimensions in every asset prompt and measure the returned file.
- Place a human-height marker (1.8 m) in the grey-box and keep it in the grading poses until the dressing is in.
- A first-person weapon is scaled for the view, not the world: scope parts at 0.74 at the hip in the build.

## Traps

- A menu gradient over the canvas dims the 3D preview. Put the darkness in the scene.
- Ambient effects must not draw from the seeded generator of the demo pass, or every capture shifts when dressing changes.
- A flash scan misses a half-second glare. Print the highest frame mean per segment and look at the contact sheet.
- A grade judged on a small frame is wrong. Judge it at full size beside the target.
- A trailer segment from one window shows one place. Cut from the demo pass of each level.
