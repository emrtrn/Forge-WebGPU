# Presentation layer

Evidence: measured in the reference build (web page, DOM menus over a WebGL canvas). The list of screens and the key art method are engine-neutral; the DOM and CSS notes apply to a browser build.

The presentation layer is what a player sees before and around play: key art, title, menus, loading screens, HUD, results. It was missing from the first brief of the reference build and had to be added in a second round. List it in the brief from the start.

## Contents

- The screens
- Key art from the game's own frame
- Title treatment and wordmark
- Splash and first paint
- Menus
- A 3D preview inside a menu
- Loading screens
- HUD
- Type and text
- Promo capture
- Renders of the 3D assets
- Checks

## The screens

| Screen         | Holds                                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Splash         | Maker's mark, once per session                                                                                                         |
| Title          | Key art, wordmark, real load progress, "press to start"                                                                                |
| Mission select | One card per level: key art, brief, cleared difficulty, best record                                                                    |
| Loadout        | The choice the genre needs (weapons, car, character), shown in 3D                                                                      |
| Deploy         | Difficulty (three in the build), start                                                                                                 |
| Loading        | Key art of the level, its name, real progress, one line of context                                                                     |
| HUD            | Only what the player acts on                                                                                                           |
| Pause          | Resume, options, restart, quit                                                                                                         |
| Options        | Sensitivity, invert Y, field of view, quality, shadows, motion blur, grain, brightness, three volumes, map mode; stored in the browser |
| Lost           | What happened, retry from the last checkpoint                                                                                          |
| Results        | Time, score, grade, next                                                                                                               |

## Key art from the game's own frame

The art shows the place the player will see, because it is made from it.

1. Capture one 1920 x 1080 frame of the level at its best pose, HUD off.
2. Send it as the only reference image to an image edit model picked by `recommend`. Ask for 2560 x 1440, high quality, two outputs.
3. In the prompt, name every machine and light in the frame, then: "Keep every machine and structure of the reference with the same shape, colour and position."
4. Say where the title will go, so that area stays calm.
5. End with: "No people, no creatures, no text, no letters, no numbers, no logos, no interface elements, no watermark."

In the build: six jobs, twelve takes, every machine in place in all twelve.

A short muted clip of each level with a sound button convinced more than key art on the page that presents the game. Capture one per level from the demo pass.

## Title treatment and wordmark

- Build the wordmark as an image: one HTML file with the type, screenshotted with a transparent background. A system font is not on every machine.
- Fit two words to one width by measuring their rendered width, then set the size.
- A CSS mask slit through letters needs `line-height: 1`.
- Use the game's own splash and title screens as the cards of a trailer.

## Splash and first paint

- **First paint before the bundle.** An inline script sets the key art and picks title or loading screen while the main bundle (1.2 MB in the build) downloads.
- **Splash once per session** (`sessionStorage`), skipped when `navigator.webdriver` is true, forced with `?splash=1`.
- **Skip handling.** The splash key handler listens in the capture phase with `stopPropagation`, and the click that follows a `pointerdown` skip is swallowed, so a skip never activates the button underneath.
- **Sound starts on the first gesture.** Resume the audio context on a one-shot `pointerdown` and `keydown`.

## Menus

- DOM over the canvas, one screen visible at a time, keyboard and mouse both complete.
- Do not render the 3D scene behind an opaque screen.
- Cards that grow on hover: flex items with a transition on `flex-grow`.
- Menu music and effect gains are set at once on entering a menu and restored at deploy.
- A choice made in a menu applies to the mission that follows. In the build the loadout was built at page load, so the armory choice applied one mission late; rebuilding the loadout in place took 0.04 to 0.07 s against 4.9 to 5.0 s with a page reload.
- Drive every menu test through the screen itself, never through the debug hook.

## A 3D preview inside a menu

For a weapon, a car or a character shown in the loadout:

- A gradient over the canvas dims the preview. Put the darkness in the scene: a backdrop plane attached to the camera 2.2 m from the eye, the object at 0.66 m.
- Studio light: three point lights parented to the camera. A warm key front right, a rim in the level's colour behind left at about three times the key, a cool top light, range 2.6 m.
- Thumbnails are studio renders of the object alone, with no display plate.

## Loading screens

- Real progress: wrap `fetch`, add the loading manager's counts, divide by the larger of the running total and the count stored from the last load in `localStorage`.
- Cap at 90 percent until assets are in, show 93 before the world build, and yield a frame before the build so the number is painted.
- The world build itself must be sliced, or the page freezes on that number ([loading.md](loading.md)).

## HUD

- Show only what the player acts on: health, the resource in use, the objective, a map.
- A timed action shows a progress bar and a stage word (the reload in the build).
- Minimap: draw the level once from the collision layout into a canvas, then each frame a rotated window with the player arrow, the objective, pickups and opponent markers. A key shows the whole sector.
- A hint fades after it has been used a few times (the aim hint after three aims).
- Subtitles for every voice line, with a switch.
- Each genre file lists its own HUD.

## Type and text

- One display face and one text face, both shipped with the build.
- No fixed heights with `overflow: hidden` on text containers: that was the cause of 15 cut texts.
- Test it: for every text node, a `Range` rectangle against the viewport and against clipping ancestors, on every screen at two sizes. The build went from 15 cut texts to 0.

## Promo capture

- Add capture switches to the game: `?nomap=1` hides the minimap, `?nosub=1` the subtitles. Promo footage shows neither.
- A trailer is cheap once every level has a deterministic demo pass: cut points are times. A portrait version is the same pass captured at 1080 x 1920.
- Preview at low resolution before the final render.
- Look at the portrait contact sheet as well as the landscape one: a glare showed there first.

## Renders of the 3D assets

To present the generated 3D assets themselves (a page, a making-of, a store listing), render each one in Blender as a short seamless loop that also shows its mesh and its skeleton: [asset-renders.md](asset-renders.md).

## Checks

- Every screen reachable by keyboard alone and by mouse alone.
- Cut texts: 0 at two window sizes.
- Options persist after a reload.
- The loadout choice is the one in play in the next mission.
- Progress on the loading screen moves and never freezes for more than the bound of [loading.md](loading.md).
- A person has read every screen once.
