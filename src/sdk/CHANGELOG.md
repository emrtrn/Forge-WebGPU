# @forge/sdk changelog

Every change to the SDK surface (`src/sdk/index.ts`, `src/editor-sdk/index.ts`)
gets an entry here, newest first, in the same commit as the change. The `API:`
line is the hash of `api.snapshot.txt`; `npm run verify:sdk-api` checks that it
matches, so the surface cannot change without this file changing too.

Before 1.0 every minor version may break: a project's `sdkVersion` must match
the engine's major.minor (architecture §4.8, A8).

## 0.1.1

API: d8bb500ca5f4f90d

Save game (architecture A7), additive: a field's `persist` flag (a save keeps
its run-time value; top-level component fields only), a component's `state`
section (run-time-only values, never in a level, always saved) and
`persistTransform` option, `defineSaveState` for game-wide save state and
`defineFeature({ saveStates })`. No untyped `flags`.

## 0.1.0

API: 98af92859f3f882b

First surface: ids, the component schema DSL, binary asset types, features,
subsystems, typed services, world actors, game modules.
