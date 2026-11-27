/** Serialized collision profiles shared by model schemas and the physics runtime. */
import { enumOf, object } from "./fields.ts";

/** Unreal "Collision Enabled": which collision interactions a body runs. */
export type CollisionEnabled = "none" | "query" | "physics" | "queryAndPhysics";

export const COLLISION_ENABLED_VALUES: readonly CollisionEnabled[] = [
  "none",
  "query",
  "physics",
  "queryAndPhysics",
];

/** Unreal "Collision Complexity": how collision geometry is resolved. */
export type CollisionComplexity =
  | "projectDefault"
  | "simpleAndComplex"
  | "simpleAsComplex"
  | "complexAsSimple";

export const COLLISION_COMPLEXITY_VALUES: readonly CollisionComplexity[] = [
  "projectDefault",
  "simpleAndComplex",
  "simpleAsComplex",
  "complexAsSimple",
];

/** Per-channel response (Unreal Block / Overlap / Ignore). */
export type CollisionResponse = "ignore" | "overlap" | "block";

export const COLLISION_RESPONSE_VALUES: readonly CollisionResponse[] = [
  "ignore",
  "overlap",
  "block",
];

/** Built-in object channels: a body's collision identity + what it responds to. */
export type CollisionObjectChannel =
  | "worldStatic"
  | "worldDynamic"
  | "pawn"
  | "physicsBody"
  | "trigger";

export const COLLISION_OBJECT_CHANNELS: readonly CollisionObjectChannel[] = [
  "worldStatic",
  "worldDynamic",
  "pawn",
  "physicsBody",
  "trigger",
];

/** Built-in trace channels for queries (raycast / camera). */
export type CollisionTraceChannel = "visibility" | "camera";

export const COLLISION_TRACE_CHANNELS: readonly CollisionTraceChannel[] = [
  "visibility",
  "camera",
];

export type CollisionChannel = CollisionObjectChannel | CollisionTraceChannel;

export const COLLISION_CHANNELS: readonly CollisionChannel[] = [
  ...COLLISION_OBJECT_CHANNELS,
  ...COLLISION_TRACE_CHANNELS,
];

/** Sparse per-channel overrides; an absent channel falls back to the preset. */
export type CollisionResponseMap = Partial<Record<CollisionChannel, CollisionResponse>>;

/** Full per-channel response table (every channel resolved). */
export type CollisionResponseTable = Record<CollisionChannel, CollisionResponse>;

/** Built-in collision presets (Unreal-style named profiles) + `custom`. */
export type CollisionPresetId =
  | "noCollision"
  | "blockAll"
  | "overlapAll"
  | "blockAllDynamic"
  | "overlapAllDynamic"
  | "pawn"
  | "physicsActor"
  | "trigger"
  | "custom";

export const COLLISION_PRESET_IDS: readonly CollisionPresetId[] = [
  "noCollision",
  "blockAll",
  "overlapAll",
  "blockAllDynamic",
  "overlapAllDynamic",
  "pawn",
  "physicsActor",
  "trigger",
  "custom",
];

const collisionResponse = () => enumOf(COLLISION_RESPONSE_VALUES, { default: "block" });

export const CollisionProfileField = object({
  preset: enumOf(["default", ...COLLISION_PRESET_IDS], { default: "default", hint: "Custom seçildiğinde aşağıdaki kanallar kullanılır." }),
  collisionEnabled: enumOf(COLLISION_ENABLED_VALUES, { default: "queryAndPhysics" }),
  objectType: enumOf(COLLISION_OBJECT_CHANNELS, { default: "worldStatic" }),
  responses: object({
    worldStatic: collisionResponse(), worldDynamic: collisionResponse(), pawn: collisionResponse(),
    physicsBody: collisionResponse(), trigger: collisionResponse(), visibility: collisionResponse(), camera: collisionResponse(),
  }),
}, { label: "Collision Profile" });
