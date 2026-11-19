# Shipping a browser build

Evidence: measured in the reference build for the static build, serving under a sub-path, hosting in a frame inside a page, and the media weights. Not tested: compression and cache headers of a real host, a slow connection, browsers other than Chromium.

## Contents

- Static build
- Weights
- Hosting inside a page
- Pointer lock and full screen
- Cross-origin assets
- What goes in the public bundle
- Freezing a build
- Media beside the game
- Checks
- Not tested in the reference build

## Static build

- A static folder that any file host can serve. No server code.
- **Relative base path** (`base: './'` in the bundler) and manifests resolved against the page URL, so the build works under any sub-path.
- Test it under a sub-path with nothing at the root: 7 of 7 pages ready in the build.
- Pin dependency versions and record them. The build shipped with three 0.187.0, three-mesh-bvh 0.9.18, n8ao 2.0.2 and Vite 8.3.8.
- Add files to a served build with an atomic swap of the folder, never by rebuilding under a running page.

## Weights

From the build's records. A weight belongs to the build it was measured on:

| What                          | Weight                                                          | Build      |
| ----------------------------- | --------------------------------------------------------------- | ---------- |
| First load, from a cold cache | 36.9 MB in 216 files                                            | v2.1       |
| First load, build log         | 49.8 MB, then 52.9 MB after one level's props were replaced     | v2.6, v2.7 |
| One level, in total           | 48.1 to 54.5 MB, of which 34.2 to 37.8 MB not in the first load | v2.1       |
| Whole build folder            | 194 MB in 327 files                                             | v2.7       |
| Largest files                 | Models of 1 to 2 MB, one script bundle of 1.2 MB                | v2.1       |

- The brief's limits were about 40 MB for the first load and about 60 MB per level. The first load was inside its limit when measured on v2.1 and is above it in the build log of v2.7: weigh the first load again after every asset round, and move what the title screen does not need out of it.
- Load a level's assets when the level is chosen, not at the title.
- Geometry compressed with meshopt and textures as WebP at 2048 px took a hero model from about 15 MB to about 2 MB ([threejs-delivery.md](threejs-delivery.md)).
- Measure with a cold profile. A warm cache hides the first visit.

## Hosting inside a page

The reference game runs in a frame inside a longer page.

- The frame needs permission for full screen (`allow="fullscreen"`). If the frame is sandboxed, its sandbox list needs `allow-scripts` and `allow-pointer-lock`. Web platform rules; check them on your host.
- The game starts on a click inside the frame. Nothing loads the heavy assets before that click.
- Suspend the loop and the sound when the frame is scrolled off screen ([performance.md](performance.md)).
- One WebGL context at a time on the page: pause the game while a 3D viewer is open.
- On context loss the page leaves full screen and offers a restart.
- Check the functional round and the headed pass on the hosted copy as well as on the local one: 136 of 136 and 30 of 30 on the hosted build.

## Pointer lock and full screen

- Request pointer lock on a user gesture only. Handle refusal: show "click to play" again.
- Leaving pointer lock pauses the game and shows the pause menu.
- A scripted test with a simulated pointer lock is not a test of pointer lock. Run one headed pass with a real one (`node scripts/capture/headed.mjs 1,2`).
- Pointer lock is refused while the machine's screen is locked. On macOS check with `ioreg -n Root -d1 | grep CGSSessionScreenIsLocked` before reading a headed failure as a bug.
- Full screen follows the screen size, so the pixel cap applies there too: a 3840 x 2160 screen draws 2560 x 1440 in the reference build ([performance.md](performance.md)).
- Escape leaves pointer lock in every browser: bind nothing else to it.

## Cross-origin assets

- Textures and models served from another origin need the store's CORS header. Test with every asset answered by another origin: 7 of 7 pages ready in the build.
- Audio and video from another origin need the same.

## What goes in the public bundle

- Minified production dependencies with their third-party notices.
- No source maps, no archives, no raw sources, no ledgers, no job or asset ids.
- No debug hook that changes game state unless it is behind a switch you accept to ship.

## Freezing a build

- Copy the build folder to a dated frozen folder at each version. It is the reference for frame rate rounds and for rollbacks.
- The hosted copy equals the frozen build byte for byte: compare file hashes after upload.
- Write the version in the page and in the hand-over.

## Media beside the game

- Level clips on the page: 23.2 to 24.0 MB each under a 25 MB rule of the host. Know your host's limit before encoding.
- Clips start muted, with a sound button, and paused under reduced motion.
- A 3D viewer for the assets shows textured, solid, mesh, normals and rig views, with clips playable. Some hosts cannot serve model files: short looping videos of the turntable are the fallback.

## Checks

- Build served under a sub-path: every page ready.
- Cold cache weights written down: first load, per level.
- Functional round and headed pass on the hosted copy.
- Hashes of the hosted copy equal the frozen build.
- No source map, archive or id in the public folder (search for them).

## Not tested in the reference build

State these as not verified unless you test them:

- a real host's compression and cache headers;
- a slow connection;
- browsers other than Chromium;
- phones and tablets;
- more than one machine.
