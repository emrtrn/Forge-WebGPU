# @forge/sdk changelog

Every change to the SDK surface (`src/sdk/index.ts`, `src/editor-sdk/index.ts`)
gets an entry here, newest first, in the same commit as the change. The `API:`
line is the hash of `api.snapshot.txt`; `npm run verify:sdk-api` checks that it
matches, so the surface cannot change without this file changing too.

Before 1.0 every minor version may break: a project's `sdkVersion` must match
the engine's major.minor (architecture §4.8, A8).

## 0.1.20

API: a5c50aa596e2f3a7

`PhysicsCastFilter.physicalChannel` selects solid blockers for an object
channel. Trace channels continue to select query responses. Colliders,
blocking volumes and models share the Block, Overlap and Ignore rules.
`PhysicsService.setCollisionEnabled` toggles a whole actor and can include
the change in a checkpoint. Code behaviors can configure tick intervals,
pause individual tick callbacks, schedule self-targeted messages and expire
their actors on the simulation clock.

## 0.1.19

API: e1383ca426aef2a5

`PhysicsServiceKey` exposes World ray and shape casts with optional trace channels. Results identify
the actor, component, contact position, normal and physical material.
`InputServiceKey`, `TimeControlKey` and `ActorMotionKey` expose World input,
simulation time and runtime transforms. Game modules register code-owned
actor behaviors with `defineBehavior`.
`PlayerServiceKey`, `CharacterMovementKey` and `CameraServiceKey` provide
spawn, possession, capsule movement and an optional game-controlled view.
`PlayerService.spawn()` can supply the default tagged pawn.
`CheckpointKey` captures a schema-based save and writes, lists, deletes and
restores its slots with level information. `AudioServiceKey` mounts game audio.
`UiServiceKey` mounts HUD and world widgets with themes and locale tables.
`VehicleServiceKey`, `NavigationServiceKey` and
`PerceptionServiceKey` expose ray-cast vehicles, Recast paths and perception.

## 0.1.18

API: 82db39f5c4696e11

`ComponentPresentation` (editor SDK) takes `groups: "accordion"` (the form's
groups start closed, and opening one closes its sibling groups) and
`extension: "top"` (the Details extension comes first in the panel, above the
component sections). The World Environment uses both.

## 0.1.17

API: f3e1fb19d6dc763a

`transitionWeather({ preset, intensity?, seconds })` on the World Environment
service (plan phase W2): the weather changes over simulation seconds, fog,
clouds, sun, wind and precipitation blending from where they are (rain and snow
both fall while one turns into the other). It resolves true when reached; a new
weather change, `setWeather`, the level ending or a missing World Environment
resolve it false; no seconds sets the weather at once. While it runs, the live
state carries `weatherFrom` (a `WeatherMix`: the shares of the presets it
started from), `weatherProgress` and `weatherSeconds`, and `weather` is the
target. A save taken mid-way resumes from there.

## 0.1.16

API: 362cbad47a0e51fa

`WorldEnvironmentServiceKey` (plan phase W): a game reads and changes the level's
hour, season and weather through `world.services`: `current()` (null without a
World Environment), `precipitation()` (rain and snow, 0..1), `transitionTo`,
`transitionSeason`, `setWeather`, `setSurface` / `setSurfaceTarget`. The surface
state carries `puddleFill` and `snowDepth`; both stay 0 until the weather drives
them (phase W5).

## 0.1.15

API: 746e548859aa3406

An asset preview may offer `select(key)`: an asset editor's tools show one part
of the asset in it. The family sheet's list shows the selected recipe's
generated output.

## 0.1.14

API: adbd54da1880bca0

A component's editor presentation may set `details: "tool"` (plan 5d,
Forge's Landscape layout): the actor's Details show the component's Details
extension, the other components, and the component's own fields last in a
closed section, with no name, Class row, transform, pivot, placement, Remove,
Advanced or Add Component. `details: "embedded"` gives a component no section of
its own on such an actor (the tool edits it). The World Terrain uses both
(its Auto Paint rules are embedded).

## 0.1.13

API: 99e95314c9991702

An asset editor can register a labelled `publish` action. Its callback receives
the validated draft, file path and base revision. The shared window owns the
busy state, conflict handling and reload after publication. The tree recipe
uses it to save the draft and generated family together.

## 0.1.12

API: 188fc6a99722ea29

Phase 5a step 7: level settings include the base wind. WES v2 migrates v1,
adds independent surface targets/rates and an optional wind override, and
persists its shared live cover/targets through the A7 component state codec.
The cover advances in simulation seconds; hour transitions do not add elapsed
time. Editor preview stays transient; plants consume this state in 5c.

## 0.1.11

API: f4d677b0cd5e7178

Details extensions (plan phase 5a step 6), additive, in `@forge/editor-sdk`:
`DetailsExtensionContext.target()` gives the primary selected actor's id and
the component's key in it (null when none), so an extension can ask a world
service about that component (the puddle's fill outcome). Nothing else changed.

## 0.1.10

API: bb3bd9b259905ae0

Asset editors (phase 4 step 7), additive in `@forge/editor-sdk`:
`defineFeatureEditor({ assetEditors })` registers an `AssetEditorPresentation`
by asset type, an optional renderer-free preview key, handled field paths and
tools. `AssetEditorExtensionContext` exposes the draft, schema fields, asset
catalog, read-only state, edit transactions and the `AssetPreviewController`;
extensions return an element with optional update/dispose hooks. Preview
information lists material slots and mesh primitive identities. Existing
feature editor registrations default to an empty list. HTTP and asset data
schemas are unchanged; game schemas automatically get the generic form/table.

## 0.1.9

API: 0ef8cb3a58b5d2b9

Asset drop rules (plan phase 4 step 6f), additive, in `@forge/editor-sdk`:
`defineFeatureEditor({ assets })` says what an asset type dragged from the
Content Browser into the viewport does (`AssetDropRule`): `place` makes a new
actor where it is dropped (`AssetPlacement`: components, icon, rotation, lift,
resting on the surface; the engine's model -> static mesh), `assign` writes
fields into a component of the actor it is dropped on, given the model
material slot under the pointer (the engine's material -> static mesh slot).
`DroppedAsset` is the asset's GUID and name.

## 0.1.8

API: 6b506d5a781c666c

New asset templates (plan phase 4 step 6d), additive, in `@forge/editor-sdk`:
`defineFeatureEditor({ newAssets })` lists starting points the Content
Browser's New menu offers for a JSON asset type the feature defines
(`NewAssetTemplate`: type, label, an optional description, and the fields
that differ from the type's defaults; the engine's material presets use it).
A JSON asset type without templates is created from its defaults.

## 0.1.7

API: 9922fe4a6eb5ceea

Details extensions (plan phase 4 step 5e), additive, in `@forge/editor-sdk`:
`defineFeatureEditor({ details })` maps a component name to a
`DetailsExtension`, which builds what its Details section shows below the
schema form (a preset button, a preview strip) from a
`DetailsExtensionContext`: the component's `value()`, `edit(label, fields)`
(one undo step on every selected actor), `service(key)` of the editor's
world, `onFrame(listener)` and `status`. Its `dispose` runs when Details draws
again.

## 0.1.6

API: 05d1c06309f53adc

Add Actor entries (plan phase 4 step 5d), additive, in `@forge/editor-sdk`:
`defineFeatureEditor({ addActor })` lists a feature's entries for the
editor's "+ Add Actor" menu (`AddActorEntry`: key, label, category, icon, the
components the new actor carries in stored form, and Forge's placement:
`rotation` in degrees, `lift` above the surface, `restOnSurface` for a
mesh's base). `ADD_ACTOR_CATEGORIES` is Forge's category order; a game's own
categories follow it. An entry whose component is a singleton is clicked,
never dragged.

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
