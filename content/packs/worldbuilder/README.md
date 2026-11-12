# World Builder pack

World Builder's default content (plan 2b `tools/world`, user decision
2026-11-12). A project that builds random worlds picks it in
`forge.project.json` with `"contentPacks": ["worldbuilder"]`; a brief refers
to these files by their asset index label, `engine:content/packs/worldbuilder/…`.

- `covers/*.cover.json`: the six ground cover presets of Forge WebGL (forest,
  meadow, farmland, steppe, desert, alpine), as `forge.groundCover` data
  documents. The content is Forge's as it was: paint layers name Forge
  material ids (materials come with phase 3) and plant rules name Forge
  foliage types (foliage comes with 5c); until then the layers paint with
  their colour and the plant rules are reported as deferred.
- `profiles/neutral.regionprofile.json`: a culture-neutral region profile,
  the random world's default. Region profiles of a game live in the game's
  repository.
