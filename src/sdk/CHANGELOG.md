# @forge/sdk changelog

Every change to the SDK surface (`src/sdk/index.ts`, `src/editor-sdk/index.ts`)
gets an entry here, newest first, in the same commit as the change. The `API:`
line is the hash of `api.snapshot.txt`; `npm run verify:sdk-api` checks that it
matches, so the surface cannot change without this file changing too.

Before 1.0 every minor version may break: a project's `sdkVersion` must match
the engine's major.minor (architecture §4.8, A8).

## 0.1.5

API: 11a5c4d25d1025eb

A feature's editor side (plan phase 4 step 5a), additive, in
`@forge/editor-sdk`: `features/<name>/editor.ts` default-exports
`defineFeatureEditor({ feature, components })`; the editor collects those files
itself (the game never names them). `components` maps a component name to how
actors carrying it show in the Outliner (`ComponentPresentation`: Forge's
actor-type icon, `ActorTypeIcon`, or a function of the component's fields, and
the type filter group, `OutlinerType` / `OUTLINER_TYPES`). Later steps add Add
Actor entries and Details actions to the same definition.

## 0.1.4

API: ee63abe72d9159bd

The editor's world and edits (plan phase 4 step 2, user decisions 2026-11-13),
additive: `defineSubsystem({ inEditor })` marks a subsystem the editor's world
installs too (default false: physics and gameplay never run in the editor);
`SubsystemInstance.actorsChanged(changes)` hears edited actors as
`WorldActorChange { actor, previous, transformOnly }` (a moved actor's
descendants come along as transform-only changes). A subsystem without the hook
hears `actorsRemoved(previous)` then `actorsAdded(actor)`.

## 0.1.3

API: 0a371596f209279c

Data document references (plan phase 3 step 8, user decision 2026-11-13),
additive: a data document type names where in its `data` asset references
sit (`DataDocumentShape.references`, `DataDocumentReference`: a dotted path,
`[]` walking an array, and the accepted asset type), so the asset index
collects them and a dangling one fails the asset gate. The terrain's and the
ground cover's paint layer materials (`layers[].material`) are GUIDs.

## 0.1.2

API: 6153d070f1d75c42

Schema-defined JSON asset types (architecture §4.6, phase 3 decision 5; the
ground for A13), additive: `defineJsonAssetType(name, version, { suffix,
fields }, { migrations })` for a JSON asset whose content is a field map
(`{ "schema": "<type>/<version>", "id": "ast_…", …fields }`; normalised,
migrated, its `assetRef` fields walked by the asset index, its form and JSON
Schema from the fields), registered through `defineFeature({ assetTypes })`
next to binary types (`FeatureAssetTypeDef`). `color({ default: null })`
makes a colour optional: its value is `#rrggbb` or null ("none").

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
