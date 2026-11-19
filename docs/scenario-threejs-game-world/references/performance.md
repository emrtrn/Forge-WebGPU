# Performance

Evidence: measured in the reference build on one desktop machine in Chromium, at 1920 x 1080 on the high preset. Phones were not exercised: the phone section is a list of what to decide and test, not a result.

## Contents

- Budgets
- Measuring
- Finding what costs
- Draw calls and parts
- The mirror
- Lights and shadows
- Post-processing
- Pixel cap
- Idle rate
- Hidden tab and off-screen canvas
- Lost context
- Reduced motion
- Quality presets
- Phones and tablets
- Checks

## Budgets

Starting budgets from the reference build: a first-person game with five interior and yard levels. Another genre needs its own (a grid of cars, a crowd of skinned bodies, kilometres of track were not measured). Set them at the grey-box step, write them in the brief, and measure the heaviest view first.

| Budget                    | Reference build                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| Frame rate                | 60 frames per second at 1920 x 1080, high preset                                                  |
| Result                    | Median at target at 18 of 20 test poses (builds v2.1 and v2.2); no full round on the later builds |
| Triangles per hero asset  | 5,000 to 60,000 after delivery                                                                    |
| Triangles per machine     | 5,000 to 13,000 in 10 to 20 parts                                                                 |
| Draw calls per machine    | 14 to 66, counted again in a mirror                                                               |
| Texture size              | 2048 px for hero assets, 1024 px for dressing props                                               |
| First load                | Brief: about 40 MB. Measured 36.9 MB (v2.1); 52.9 MB in the build log of v2.7                     |
| Per level                 | Brief: about 60 MB. Measured 48.1 to 54.5 MB (v2.1)                                               |
| Longest main-thread block | See [loading.md](loading.md)                                                                      |

## Measuring

- **Four poses per level**, one of them the heaviest view you can find, the same poses every round.
- **Three rounds, take the median.** Identical runs vary by about 20 percent on a shared GPU.
- **A frozen earlier build in the same round** is the reference for machine load: if the reference drops too, the machine was busy. On a first build there is none: leave the reference argument out, freeze that build, and use it from the next round on.
- **The machine alone.** No other capture, no builder agent, no video call.

```
sh scripts/capture/perfround.sh out/perf.log "1 2 3" ref/dist
python3 scripts/perftable.py out/perf.log 60
```

State the result as a count with its build: "median of 60 frames per second or more at 18 of 20 test poses, builds v2.1 and v2.2, 1920 x 1080, high preset", with the two that do not and their medians. A figure belongs to the build it was taken on: builds v2.7 to v2.8.1 of the reference game had no full round, and the skill says so.

## Finding what costs

- **Interleaved probe.** Switch variants inside one page, three rounds each, so machine load hits both sides alike. A before and after in two page loads measures the machine.
- **Draw list by scene root.** Print calls and triangles per top-level group. The heaviest group is rarely the one suspected.
- **One URL factor per effect family** set to zero: lamps, fog, haze, bloom, mirror, shadows.
- **Change one thing**, measure, keep or revert. Halving the mirror's resolution gave nothing in the build; the distance rule below gave the gain.

## Draw calls and parts

- Each rigid named part is a draw call. Seventeen machines were about 470 calls per view.
- Give a part budget in the build prompt: 10 to 20 parts for an opponent, more only for a hero machine seen close.
- Share geometry and materials between clones.
- Dressing that repeats (pipes, litter, cable ladders) is instanced or merged per room. Named parts of animated assets are never merged.
- Built bodies cost no more frame time than the single meshes they replaced.

## The mirror

A planar mirror draws the scene twice.

- **Distance rule**: draw in the mirror only what is within 22 m, plus anything larger than 7 m so large models keep their reflection.
- Result in the build: 2,119 calls and 3.3 million triangles went to 1,518 and 2.26 million. Stills differed by under 1.4 percent RMSE.
- Sheets of water outside the main floor use a cube captured once at load ([world-building.md](world-building.md)).

## Lights and shadows

- Many small lamps: baked into the light loop instead of dynamic lights. A pose went from 31.0 ms to 16.3 ms.
- One or two shadowed keys per level, 4096 px maps, static: redrawn only when something moves in the cone.
- The haze beam of a key is cut by the same shadow map.

## Post-processing

- Ambient occlusion at half resolution.
- Fog and cones in one pass.
- Bloom on a clamped input.
- One final pass for exposure, tone curve, grade, vignette, anti-aliasing, sharpen and grain ([render-recipe.md](render-recipe.md)).

## Pixel cap

- Cap the drawing buffer in total pixels, at the same aspect, and leave the CSS size of the canvas unchanged. Every post-processing target follows the capped size.
- As built in the reference game (v2.8.1): at most 2560 x 1440 pixels in total. A 1920 x 1080 viewport draws 1920 x 1080, 3840 x 2160 draws 2560 x 1440, and 2560 x 1600 draws 2428 x 1517. Full screen goes through the same cap.
- Probe: set the viewport to each size, then read the size of the drawing buffer and of the composer target.
- Suggestion, not in the build: tie the cap to the quality preset and show the render size in a debug overlay.

## Idle rate

- A screen that does not change needs no frame. In the reference game (v2.8.1) the title, mission select and end screens draw nothing once shown; the armory, deploy, pause and death screens draw at most every 28 ms; play runs at full rate.
- Measured renders per second in a headless browser: title 0, mission select 0, armory 26.0, deploy 24.3, pause 27.4, end 0, play 79.7.
- Resuming must not replay the pause. After a 2 s pause, game time advanced 1.02 s over 1.00 s of wall time: no catch-up burst.
- How to measure: on each screen, count over a few seconds the animation frames that issue draw calls (read the renderer's call counter every frame) beside the count of animation frames. Then pause, wait, resume, and compare game time with wall time.

## Hidden tab and off-screen canvas

- When the document is hidden, return from the loop before drawing and suspend the audio context.
- When the canvas is off screen inside a longer page, do the same (an `IntersectionObserver`). Measured on the hosting page: 0 frames per second and sound suspended off screen, resumed in place.
- Pause the game clock with the loop, so the player does not return to a lost fight.

## Lost context

- Listen for `webglcontextlost`, call `preventDefault`, stop the loop, leave full screen and show a way back: a restart button.
- In the build a restarted level was ready in 7.2 s.
- One WebGL context at a time on a page: pause the game while a 3D viewer is open, dispose the viewer when it closes.

## Reduced motion

- Read `prefers-reduced-motion` live, so a change of the preference applies without a reload. On a page that hosts the game, start loops and clips paused.
- As built in the reference game (v2.8.1), with the preference on: camera shake off; head and weapon bob off (stride bob, landing dip, sprint tilt); menu background motion off; explosion and muzzle light flashes scaled to 0.3; the full-screen damage vignette and the hit marker capped (0.25 and 0.3), no longer pulsing to full.
- Kept, because they are play: recoil (aim mechanics), look sway, every input and every action.
- Probe with the preference emulated in the browser: bob 0 (0.065 without), landing dip 0, camera shake 0 (0.024 rad without), menu animations none. Then run the scripted round once with the preference emulated: every level passed in the reference build.
- With the preference off, nothing may change: a fixed-pose frame with the loop frozen was pixel-identical to the build before.
- One residual in the reference build: the start prompt of the title keeps a slow opacity pulse.
- Switches for motion blur and grain stay in the options for everyone.

## Quality presets

The build has a quality option and a shadow option. The list below is a suggestion for what presets change.

- Three presets that change render scale, shadow map size, ambient occlusion, mirror distance and haze steps.
- Pick the first preset from a short timing at the title screen, and let the player change it.
- Every preset passes the functional round. Frame rate is measured on the preset you claim.

## Phones and tablets

Not exercised in the reference build. Before claiming a phone build, decide and test:

- touch controls and their HUD;
- a render scale and a low preset that hold the target frame rate on the weakest phone you name;
- memory: texture sizes halved, fewer levels in memory, compressed GPU texture formats;
- download size on a mobile connection;
- orientation, the notch area, full screen behaviour of the phone browser;
- heat and battery over ten minutes of play.

The page around the game was checked at 320 x 568, 390 x 844 and 844 x 390 for layout only.

## Checks

- Frame rate table: medians of three rounds, reference build in the same round.
- Render size never above the cap.
- Hidden tab: 0 frames drawn, sound suspended, clock paused.
- Context loss simulated once: the way back works.
- Each preset: functional round passes.
