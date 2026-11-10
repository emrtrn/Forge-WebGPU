# Asset fixture

A tiny content root for the `tools/assets` tests: a texture and a mesh with
their meta files, an actor class and a level that use them. The asset types
and components are the test ones from `src/core/assets/testKit.ts`.

Tests never write here (A9): they copy this folder to a temporary directory
and move, delete or break files in the copy. The layer gate and
`verify:assets` do not scan it.
