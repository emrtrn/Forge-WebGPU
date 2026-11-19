# Asset renders: one looping shot per generated asset

Evidence: the recipe of the render set made for the reference build's assets (30 assets and 7 edits, rendered headless in Blender 5.2 with EEVEE). This chapter describes the recipe and ships no script: write the Blender script for your own files from the steps below. Every figure is that set's. Nothing here was tried on another set of assets.

## Contents

- What one shot is
- Stage and light
- Camera and framing
- Motion in the shot
- The scan reveal
- An edit as a loop
- Checks
- Running the batch
- On the page: the spec text beside the render

## What one shot is

- 1920 x 1080, 30 frames per second, no sound, no text in the picture.
- A seamless loop: the last frame continues into the first, with the same camera and the same pose.
- 12 s for an animated asset (machines, weapons, large set pieces), 8 s for a static piece or an edit.
- Delivered with it: a poster (frame 0, finished like the video), a 3840 x 2160 still on the same stage, a contact sheet of 12 frames of which three sit inside the reveal, and a manifest entry (shot length, clip sequence with times, skeleton, parts, triangles, the automatic checks).

## Stage and light

- A dark studio (near `#04070d`), a wet concrete floor with puddles for reflections and contact shadows, a light haze.
- Light only from sources in the frame or implied by it: an overhead lamp (warm key, its pool on the floor, its beam in the haze), two cool strip lights behind (rim, mirrored by the floor), a soft cool fill, a low amber bounce from the pool.
- AgX view transform with a medium-high contrast look, a 65 mm lens, depth of field computed per asset so that the asset stays sharp. Bloom, a slight vignette and fine grain in the composite.
- **A light floor for dark assets.** Raise key and fill (up to 2.2 times in the set) until a small probe render of the asset reaches the luminance of shots already accepted. Record the factor per asset.

## Camera and framing

- An eased pendulum orbit, out and back, so that the loop closes, with a slight rise and push-in.
- **Fit per frame.** The camera distance is fitted for every frame so that the asset keeps about half the frame width, or 0.62 of its height, through the whole orbit, then smoothed over the loop. One fit for the whole orbit left a long asset too small.
- **Centre the asset at 0.70 of the width.** The left part of the frame stays free for a short spec text.
- **Long set pieces orbit off their long axis** (25 to 65 degrees), so the camera never looks down the length.
- **Weapons keep a pendulum around the broadside.** A wider orbit opened behind the stock.
- **An asset that moves across the stage gets one fit over every pose of its clip.** With a fit that ignored the clip, a flying machine left the frame.

## Motion in the shot

- Machines chain their own clips with short blends (0.4 s): idle, locomotion, aim, fire, back to idle.
- Under a machine that walks or drives, the floor moves at the stride speed measured from the feet or wheels in contact, and its texture repeats exactly over the distance travelled. Otherwise the loop does not close.
- Weapons float at a slight angle and play a handling sequence on their named parts: magazine out and in, bolt or slide, shots with recoil and a muzzle light.
- Set pieces whose parts can move do one motion (a hook, a door, a turret). The others do a calm exploded view: the parts separate from the centre, hold, reassemble.
- A prop made of one mesh gets the camera move only.

## The scan reveal

- In the middle of the loop (4.0 to 8.0 s of 12, 2.7 to 5.3 s of 8) a vertical scan band sweeps across the asset. Behind it the surface becomes dark glass with a rim and the true wireframe of the mesh, and the skeleton shows inside, still moving with the animation. A second sweep brings the textured asset back.
- The skeleton is drawn from the file: tapered bones from each parent joint to each child joint, and a sphere per joint, sized to the asset.
- None of the files of the set had an armature, so the skeleton follows the real object hierarchy. Where a part shares its parent's pivot, the joint sits at the part's centre. A file with no hierarchy gets a root at the base and one bone to each part centre, and the manifest says so. A single mesh shows its wireframe only.
- **Cap the joint spheres against the joint spacing.** On a weapon with close pivots the spheres merged into one mass.
- Render two layers per frame only inside the reveal (the finished picture and the x-ray), with identical camera and animation, and composite the sweep afterwards.

## An edit as a loop

- 8 s. The asset before the edit; the scan replaces it by the edited asset, textured on both sides of the band, in the same framing and light; a hold; a second scan restores the original at the loop point.
- The manifest states the edit in plain words.

## Checks

- **Loop seam**: the difference between the last and the first frame, beside the frame-to-frame differences of the shot.
- **Edge audit**: a frame counts as cut when the asset's box touches the frame edge, the edited layer included. Run it over every frame of every shot.
- **Left edge**: the leftmost point of the asset over the shot, against the area kept for the text.
- **Parts with several materials**: count them before rendering. A pass script that cleared material slots painted 12 of 25 assets with their first material.
- **Look at the contact sheet of every shot.** Three shots of the set were rejected on sight and redone: one too small and too dark, one that opened behind the stock with merged joints, one that left the frame. Each gave a rule above.

## Running the batch

- One asset wrote about 1 GB of PNG frames. Keep frames as JPEG in a scratch folder and remove them per asset once its master file is verified.
- Run headless at low priority, at most two Blender processes at a time, and start none while memory use is at or above 80 percent.
- Check a floor of free disk before every launch.
- Relaunch Blender every 100 renders and resume from the frames on disk.

## On the page: the spec text beside the render

- The free left part of the frame carries a short text, small and muted: name, model, faces, parts, materials, clips.
- Count those figures from the file the game loads, in one place: one script writes one data file that the page reads. Check every render's figures against it.
- A render framed for a text on its left leaves that side empty wherever it is reused without the text. Decide the layout before framing.
