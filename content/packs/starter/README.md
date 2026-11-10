# Starter pack

A content pack: a project picks it in `forge.project.json` with
`"contentPacks": ["starter"]` and reads it from the engine under
`engine:content/packs/starter/`. Nothing is copied into the game and the
editor does not write here (architecture A9).

A pack may refer to engine content, never to another pack
(`npm run verify:assets` checks).

- `classes/exponential-height-fog.json`: a height fog actor class.

The rest of the starter content comes with the Forge WebGL importer (phase 2b).
