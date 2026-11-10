# @forge/sdk changelog

Every change to the SDK surface (`src/sdk/index.ts`, `src/editor-sdk/index.ts`)
gets an entry here, newest first, in the same commit as the change. The `API:`
line is the hash of `api.snapshot.txt`; `npm run verify:sdk-api` checks that it
matches, so the surface cannot change without this file changing too.

Before 1.0 every minor version may break: a project's `sdkVersion` must match
the engine's major.minor (architecture §4.8, A8).

## 0.1.0

First surface: ids, the component schema DSL, binary asset types, features,
subsystems, typed services, world actors, game modules.
