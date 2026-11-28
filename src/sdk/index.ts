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

// World physics queries
export { PhysicsServiceKey } from "../engine/physics/physicsService.ts";
export type { PhysicsCastFilter, PhysicsHit, PhysicsService } from "../engine/physics/physicsService.ts";
export type { CastShape, RayCast, ShapeCast } from "../engine/physics/physicsCasts.ts";
export { InputServiceKey } from "../engine/input/inputService.ts";
export type { InputService } from "../engine/input/inputService.ts";
export type { ActionState, AxisModifiers } from "../engine/input/actionMap.ts";
export { TimeControlKey } from "../engine/time/timeControl.ts";
export { ActorMotionKey } from "../engine/world/actorMotion.ts";
export type { ActorMotion, ActorTransformUpdate } from "../engine/world/actorMotion.ts";
export { defineBehavior } from "../engine/behavior/worldBehavior.ts";
export type { BehaviorContext, BehaviorDefinition, BehaviorEvent, BehaviorMessage } from "../engine/behavior/worldBehavior.ts";
export { CameraServiceKey } from "../engine/camera/worldCamera.ts";
export type { CameraService, RuntimeCameraPose, RuntimeViewModel } from "../engine/camera/worldCamera.ts";
export { PlayerServiceKey } from "../gameplay/player/playerSpawn.ts";
export type { PlayerService, PlayerStartOptions } from "../gameplay/player/playerSpawn.ts";
export { CharacterMovementKey } from "../gameplay/character/characterMovement.ts";
export type { CharacterMoveInput, CharacterMovementService, CharacterMotion } from "../gameplay/character/characterMovement.ts";
export { SkeletalClipsKey } from "../engine/animation/skeletalClips.ts";
export type { SkeletalClips } from "../engine/animation/skeletalClips.ts";
export { CheckpointKey } from "../engine/persistence/checkpointService.ts";
export type { CheckpointService } from "../engine/persistence/checkpointService.ts";
export { AudioServiceKey } from "../engine/audio/worldAudio.ts";
export type { AudioBus, AudioPlayOptions, AudioPlaybackHandle } from "../engine/audio/audioTypes.ts";
export { UiServiceKey } from "../engine/ui/worldUi.ts";
export type { UiService, WidgetAnchor, WidgetHandle, WidgetOptions } from "../engine/ui/worldUi.ts";
export type { UiLocaleTable } from "../engine/ui/uiLocale.ts";
export type { UiThemeDef } from "../engine/ui/uiTheme.ts";
export { NavigationServiceKey } from "../engine/navigation/worldNavigation.ts";
export type { NavigationService } from "../engine/navigation/worldNavigation.ts";
export type { NavAgent } from "../engine/navigation/navigationTypes.ts";
export type { RecastPlanResult } from "../engine/navigation/recastPlanner.ts";
export { PerceptionServiceKey } from "../engine/perception/worldPerception.ts";
export type { PerceptionEvaluationInput, PerceivedStimulus } from "../engine/perception/perception.ts";
export { VehicleServiceKey } from "../engine/physics/vehicle/worldVehicle.ts";
export type { VehicleService } from "../engine/physics/vehicle/worldVehicle.ts";
export type { VehicleDefinition, VehicleInput, VehicleState, VehicleWheelState } from "../engine/physics/vehicle/vehicleTypes.ts";

// The World Environment: hour, season, weather, what falls, the visible surface
export { WorldEnvironmentServiceKey } from "../engine/environment/worldEnvironmentRuntime.ts";
export type { WorldEnvironmentService } from "../engine/environment/worldEnvironmentController.ts";
export type { WorldEnvironmentState } from "../engine/environment/environmentResolve.ts";
export type { Precipitation, SurfaceCondition } from "../engine/environment/surfaceCondition.ts";
export type { Season, WeatherPreset } from "../engine/environment/worldEnvironment.ts";
export type { TimeTransitionRequest } from "../engine/environment/timeTransition.ts";
export type { WeatherMix, WeatherShare, WeatherTransitionRequest } from "../engine/environment/weatherTransition.ts";
export type { SurfaceAmount } from "../engine/environment/surfaceAccumulation.ts";

// The game module
export { defineGameModule } from "../runtime/gameModule.ts";
export type { GameModeDef, GameModuleDef } from "../runtime/gameModule.ts";
