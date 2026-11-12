# Starter pack

A content pack: a project picks it in `forge.project.json` with
`"contentPacks": ["starter"]` and reads it from the engine under
`engine:content/packs/starter/`. Nothing is copied into the game and the
editor does not write here (architecture A9).

A pack may refer to engine content, never to another pack
(`npm run verify:assets` checks).

- `classes/exponential-height-fog.json`: a height fog actor class.
- `starter-content/`, `DevelopmentContent/`: Forge WebGL assets the engine's
  ported code names by id (World Builder's temporary materials, particle
  flipbooks, water normal, noise, UI / footstep / impact / engine sounds),
  imported with `npm run import:forge -- --forge <Forge public/> --pack starter`
  (plan 2b, user decision 2026-11-12). The list and why each is here:
  `tools/import-forge-webgl/starterSeeds.ts`. Folders keep Forge's paths
  without `assets/`; GUIDs come from the Forge ids, so a second run writes the
  same files. Textures only for now: the materials that use them come in
  phase 3.

Licences are in each `*.meta.json`. `LicenseRef-forge-unverified` means
Forge never recorded where the asset came from (its manifest text is the
`source.origin`): the user keeps it until their own assets replace it, and it
is not meant for a game. `LicenseRef-forge-project` is the user's own work
(Forge placeholders, ThreeAges, AI-generated textures).
