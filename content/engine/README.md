# Engine content

What the engine needs to open at all, seen by every project: default
material, gizmos, editor icons, sky defaults (architecture A9). Empty until
the renderer (phase 3) and the editor (phase 4) need it.

A project reads these files from the engine under `engine:content/engine/`;
nothing is copied into the game and the editor does not write here. Engine
content refers to no content pack (`npm run verify:assets` checks).
