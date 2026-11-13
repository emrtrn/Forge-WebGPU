// @forge/sdk: the one surface a game project imports (architecture §4.8, A8).
//
// Every name is listed on purpose; nothing is re-exported wholesale, so the
// surface changes only by an edit here (and the API snapshot shows it).
// Engine internals (asset index, save service, tools, editor) stay out.

export { SDK_VERSION } from "./version.ts";

// Ids
export { createId, isId } from "../core/index.ts";
export type { ActorId, AssetId, IdKind, LevelId } from "../core/index.ts";

// Schema DSL: components and their fields
export {
  actorRef,
  array,
  assetRef,
  bool,
  color,
  defineComponent,
  enumOf,
  num,
  object,
  text,
  transform,
  vec2,
  vec3,
  vec4,
} from "../core/index.ts";
export type {
  ComponentData,
  ComponentDef,
  FieldDef,
  FieldMap,
  FieldValues,
  Transform,
  Vec2,
  Vec3,
  Vec4,
} from "../core/index.ts";

// Game-wide save state (A7); actor state is `persist` fields and a component's `state`
export { defineSaveState } from "../core/index.ts";
export type { SaveStateData, SaveStateDef } from "../core/index.ts";

// Asset types a game brings: binary files with a meta file, and schema-defined JSON assets (A13)
export { defineAssetType, defineJsonAssetType } from "../core/index.ts";
export type { BinaryAssetTypeDef, FeatureAssetTypeDef, JsonAssetDoc, JsonAssetTypeDef } from "../core/index.ts";

// Features, subsystems, services
export { createServiceKey, defineFeature, defineSubsystem, TICK_GROUPS } from "../core/index.ts";
export type {
  ComponentEntry,
  EndPlayReason,
  FeatureDef,
  ServiceKey,
  Services,
  SubsystemContext,
  SubsystemDef,
  SubsystemInstance,
  TickGroup,
  WorldActor,
  WorldState,
} from "../core/index.ts";

// The game module
export { defineGameModule } from "../runtime/gameModule.ts";
export type { GameModuleDef } from "../runtime/gameModule.ts";
