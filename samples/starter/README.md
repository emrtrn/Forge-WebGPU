# Starter

The smallest game project, in the shape every game repository has
(architecture §4.8): `forge.project.json`, `content/`, `src/game.ts`. It is
the project `npm run dev` opens when no other is named, and the template
`npm run create-project` copies.

- `content/levels/main`: a level folder (A11) with a Height Fog actor in the
  persistent layer and a Player Start in cell `0_0`.
- `src/game.ts`: the game module; it imports `@forge/sdk` only.

Inside the engine repository this project is read-only: the dev server
refuses saves here. Make your own with `npm run create-project`.
