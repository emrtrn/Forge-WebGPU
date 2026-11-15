# Starter

The smallest game project, in the shape every game repository has
(architecture §4.8): `forge.project.json`, `content/`, `src/game.ts`. It is
the project `npm run dev` opens when no other is named, and the template
`npm run create-project` copies.

- `content/levels/main`: a level folder (A11) with a Height Fog actor in the
  persistent layer and a Player Start in cell `0_0`. The fog is an instance of
  the starter pack's height fog class: `"contentPacks": ["starter"]` in the
  manifest makes the engine's `content/packs/starter/` part of this project's
  asset index; nothing is copied (A9).
- `src/game.ts`: the game module; it imports `@forge/sdk` only.

Inside the engine repository this project is read-only: the dev server
refuses saves here. Make your own with `npm run create-project`.

## Editing levels from an agent

`npm run forge -- edit` (in the engine repository) changes a level the way
the editor does, without reading or rewriting its files: the same operations,
checks and canonical files, no dev server needed. An editor that has the level
open follows by itself (or asks, when it has unsaved changes).

```
npm run forge -- edit --project <this project> --level content/levels/main find --component forge.pointLight
npm run forge -- edit --project <this project> --level content/levels/main add --component light=forge.pointLight --at 2,1.5,0 --set light.intensity=4
npm run forge -- edit --project <this project> --level content/levels/main move act_6519 --by 0,0,3
npm run forge -- edit --project <this project> --level content/levels/main set act_6519 fog.density=0.002
```

Commands: `find`, `show <id>`, `add`, `move`, `delete`, `set <path>=<value>`,
`reset`; `--json` for one JSON object; `-` reads commands from stdin, one per
line, saved together. An id may be a unique prefix of the GUID.
