# World Builder pack

World Builder's default content (plan 2b `tools/world`, user decision
2026-11-12). A project that builds random worlds picks it in
`forge.project.json` with `"contentPacks": ["worldbuilder"]`; a brief refers
to these files by their asset index label, `engine:content/packs/worldbuilder/…`.

The pack requires the starter pack (`forge.pack.json`: its terrain layer
materials, trees and rocks live there), so a project picks both:
`"contentPacks": ["starter", "worldbuilder"]`; `forge check` reports one
that does not, and the editor's World Builder window adds them.

- `covers/*.cover.json`: the six ground cover presets of Forge WebGL (forest,
  meadow, farmland, steppe, desert, alpine), as `forge.groundCover` data
  documents. The content is Forge's but for the paint layers' materials,
  which are the starter pack's material GUIDs (phase 3 step 8, user decision
  2026-11-13), and their plants: a tree names a starter foliage type by GUID
  (`plants[].foliageType`; Conifer and Broadleaf prototypes, 5d step 8), a
  bush or grass has none until the pack grows one and is reported.
- `profiles/neutral.regionprofile.json`: a culture-neutral region profile,
  the random world's default. Region profiles of a game live in the game's
  repository.
