// Ported from Forge WebGL engine/scene/layout.ts (Vec3, LayoutPhysicsAxisLocks, LayoutLandscape, LayoutWorldEnvironment, LayoutPlacement, LayoutModelInstances, RoomLayout slice) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// TRANSITION (plan 2b, user decision 2026-11-11): Forge WebGL's old entity and
// component model, only the part ported subsystems read. Faz 6 replaces it with
// schema components (each subsystem binds to the world with its feature) and
// deletes src/engine/legacy. Kept inside src/engine (engine-legacy-stays-in-engine).
import type { LayoutWind } from "../environment/wind.ts";
import type { CollisionEnabled, CollisionObjectChannel, CollisionPresetId, CollisionResponseMap, NavigationRole } from "../physics/collision.ts";

export type Vec3 = [number, number, number];

export type LayoutPhysicsAxisLocks = [boolean, boolean, boolean];

/**
 * Placed Landscape actor (à la Unreal's Landscape): a level-owned heightfield
 * terrain. Faz 1 models only the placed actor + a reference to its height/layer
 * sidecar data (`dataRef`); sculpt/paint tools are later phases. Unlike the other
 * placed actors there is no `scale` field — terrain size is fixed by the sidecar's
 * `size` (vertex grid + spacing), not a transform scale. Optional fields read
 * defaults from `engine/scene/landscape.ts`.
 */
export interface LayoutLandscape {
  id: string;
  name?: string;
  hidden?: boolean;
  locked?: boolean;
  scaleLocked?: boolean;
  groupId?: string;
  nodeId?: string;
  parentId?: string;
  position: Vec3;
  /** Full Euler rotation (XYZ order) in degrees. */
  rotation?: Vec3;
  /** Public-root-relative `*.terrain.json` World Terrain definition. */
  dataRef: string;
  /** Landscape material asset id, unused until Faz 3 (layer paint + landscape material). */
  material?: string;
  /** Runtime collision. Absent means true (statically collidable, rebuilt on Save/Play). */
  collision?: boolean;
}

/**
 * Singleton environment actor: World Environment (WES) — time of day, season,
 * weather and the (K2) visual snow/wetness cover. It stores **level defaults**
 * only: the editor preview and the Play clock are runtime state and never write
 * here, and WES never writes the Sun/Sky/Fog/Cloud actors either — it overrides
 * their render objects. All fields are optional; absent reads the defaults in
 * `engine/environment/worldEnvironment.ts`, which also holds the normalizer the
 * loader and the save validator share.
 */
export interface LayoutWorldEnvironment {
  /** Display name in the Outliner. Absent means "World Environment". */
  name?: string;
  /** true turns WES off: the authored sky/fog/sun render exactly as without the actor. */
  hidden?: boolean;
  time?: {
    /** Level default hour, 0 ≤ h < 24. */
    hour?: number;
    /** Play: real minutes per 24 game hours; 0 stops the clock. */
    dayLengthMinutes?: number;
  };
  sunPath?: {
    /** Compass direction of the noon sun in degrees (0 = +Z). */
    azimuthDeg?: number;
    /** Noon sun elevation, 5..90 degrees. */
    noonElevationDeg?: number;
    sunriseHour?: number;
    sunsetHour?: number;
  };
  night?: {
    /** Intensity multiplier of the directional light while it is the moon. */
    moonIntensity?: number;
    /** 0..1 multiplier of the authored shadow strength at night; 0 disables moon shadows. */
    moonShadowStrength?: number;
    moonColor?: string;
    /** Visible full-moon diameter in degrees (art-directed, not an astronomical calendar). */
    moonAngularDiameterDeg?: number;
    /** Visible disc brightness, independent of direct light intensity; 0 hides it. */
    moonBrightness?: number;
    /** Independent soft glow outside the lunar disc (0..5; 0 disables). */
    moonHaloIntensity?: number;
    /** Halo extent beyond the limb, in moon radii (0.5..12). */
    moonHaloSize?: number;
    /** Live sky star radiance, 0 disables stars (0..5). */
    starBrightness?: number;
    /** Fraction of the deterministic star population (0..1). */
    starDensity?: number;
    /** Angular size multiplier (0.5..3). */
    starSize?: number;
    /** Lower bound of the night ambient as a fraction of the authored ambient. */
    ambientFloor?: number;
    /** Independent night fill in moonColor (absolute AmbientLight intensity); 0 disables it. Fades out by day. */
    ambientIntensity?: number;
  };
  season?: "spring" | "summer" | "autumn" | "winter";
  weather?: {
    preset?: "clear" | "cloudy" | "rain" | "snow" | "fog";
    /** 0..1 blend from `clear` to the preset. */
    intensity?: number;
  };
  /** K2 visual cover; never physics. */
  surface?: {
    snowCoverage?: number;
    wetness?: number;
    winterSnowCoverage?: number;
    snowColor?: string;
    snowSlopeStartDeg?: number;
    snowSlopeEndDeg?: number;
    /** World Y; null = no altitude limit. */
    snowMinAltitude?: number | null;
    snowAltitudeBlend?: number;
  };
  /** Faz 6 sway wind; absent falls back to `worldSettings.wind`. Weather and season scale it. */
  wind?: LayoutWind;
}

/**
 * Generic, project-defined gameplay metadata value. The base editor stays
 * schema-agnostic: it stores whatever scalar/list a project's metadata schema
 * declares without knowing the gameplay semantics.
 */
export type MetadataValue = string | number | boolean | string[];
export type LayoutMetadata = Record<string, MetadataValue>;

/**
 * Authoring reference to a runtime behavior script: a registered `script` id and
 * optional JSON-ish `params`. The runtime behavior registry resolves the id to
 * an update function; the saved layout only stores the reference.
 */
export interface LayoutBehavior {
  script: string;
  params?: LayoutMetadata;
}

/**
 * Authoring reference to a particle/VFX emitter: a manifest `effectId` plus a
 * small set of per-instance overrides. Behaviour (spawn/lifetime/velocity/…)
 * lives in the effect asset (`.effect.json`) — the single source of truth — so a
 * reused effect looks the same in every scene. Overrides only re-skin/re-time
 * this one placement: `enabled` (default true) toggles the emitter, `autoPlay`
 * plays it on scene load, `scale` uniformly grows the effect, `tint` recolours
 * it, and `loop` forces looping on/off for this instance. The runtime VFX system
 * resolves `effectId` and simulates (see `engine/render-three/particleEffect`).
 */
export interface LayoutParticleEmitter {
  effectId: string;
  enabled?: boolean;
  autoPlay?: boolean;
  scale?: number;
  tint?: string;
  loop?: boolean;
}

/**
 * Authored interaction marker: an `action` id the runtime interprets, with an
 * optional player-facing `prompt`, default `enabled` flag, a `requires` gate
 * and a `cooldown` (seconds). Project game rules interpret these at runtime.
 */
export interface LayoutInteraction {
  action: string;
  prompt?: string;
  enabled?: boolean;
  requires?: string;
  cooldown?: number;
}

export interface LayoutPhysics {
  /** Override mass in kilograms. Absent lets the physics backend derive mass from the collider. */
  massKg?: number;
  /** Linear velocity damping. Absent means the runtime default. */
  linearDamping?: number;
  /** Angular velocity damping. Absent means the runtime default. */
  angularDamping?: number;
  /** Whether world gravity affects this body. Absent means true. */
  enableGravity?: boolean;
  /** Per-axis translation locks, X/Y/Z. Absent means all axes are free. */
  lockPosition?: LayoutPhysicsAxisLocks;
  /** Per-axis rotation locks, X/Y/Z. Absent means all axes are free. */
  lockRotation?: LayoutPhysicsAxisLocks;
}

// K12: `audio` (audio component) and `movingPlatform` are cut from the placement; `fracture` waits for Faz 8.
export interface LayoutPlacement {
  /**
   * Stable identity that survives reindexing and asset swaps (World Builder
   * ownership, placeholder → model). Unique within a layout; absent on objects
   * nothing refers to. A duplicate never inherits it (`editor/core/layoutSnapshots.ts`).
   */
  id?: string;
  /**
   * Semantic role, e.g. `building.residential.detached` (`isSemanticRole`).
   * Says what the object is; a region profile decides which asset shows it.
   */
  role?: string;
  /** false keeps it in the persistent level when the level is World Partitioned (OPEN_WORLD_PLAN Faz 5) */
  spatiallyLoaded?: boolean;
  name?: string;
  hidden?: boolean;
  locked?: boolean;
  groupId?: string;
  /** Stable id assigned when this object becomes a parent (referenced by children). */
  nodeId?: string;
  /** This object's parent, referencing the parent's `nodeId`. */
  parentId?: string;
  position: Vec3;
  /** Legacy Y-only rotation in degrees. Read as a fallback when `rotation` is absent. */
  rotationYDeg?: number;
  /** Full Euler rotation (XYZ order) in degrees. Preferred over `rotationYDeg`. */
  rotation?: Vec3;
  /**
   * Authoring pivot: a point in the object's local (model) space that rotation
   * and scale gizmos act around. Absent/`[0,0,0]` means the model origin.
   * Editor-only; runtime should consume the baked world transform.
   */
  pivot?: Vec3;
  /** Uniform scalar (legacy) or per-axis scale. */
  scale?: number | Vec3;
  /** Editor hint: keep scale axes proportional when editing. */
  scaleLocked?: boolean;
  /** Legacy/runtime hint. Editor renderer controls instanced static shadows centrally. */
  castShadow?: boolean;
  /** Runtime hint: object participates in collision. Absent means true (default on). */
  collision?: boolean;
  /** Per-placement collision preset override; absent means inherit the asset default. */
  collisionPreset?: CollisionPresetId;
  /** Per-placement collision enabled override; absent means inherit the preset/asset default. */
  collisionEnabled?: CollisionEnabled;
  /** Per-placement object channel override; absent means inherit the preset/asset default. */
  objectType?: CollisionObjectChannel;
  /** Per-placement response overrides, mainly for Custom collision. */
  responses?: CollisionResponseMap;
  /** Per-placement physical material override. */
  physicalMaterialId?: string;
  /** Per-placement AI navigation role override; absent means inherit the asset default. */
  navigationRole?: NavigationRole;
  /** Emit begin/end overlap events for sensors. Absent means inherit/default true. */
  generateOverlapEvents?: boolean;
  /** Emit hit events while simulating physics. Absent means inherit/default true. */
  simulationGeneratesHitEvents?: boolean;
  /** Per-placement material override. References a manifest material asset id. */
  materialSlot?: string;
  /**
   * `#rrggbb` base colour replacing the material's own (textures still apply),
   * e.g. a World Builder placeholder's role or land-use colour. Absent keeps the
   * material colour.
   */
  color?: string;
  /** Runtime hint: collider is a non-blocking sensor (trigger zone). Absent means false. */
  sensor?: boolean;
  /** Runtime hint: this object is a dynamic rigid body in Play mode. Absent means false. */
  simulatePhysics?: boolean;
  /** Runtime physics body settings used when this object simulates physics. */
  physics?: LayoutPhysics;
  /** Project-defined gameplay metadata (schema-driven; omitted when empty). */
  metadata?: LayoutMetadata;
  /** Runtime behavior script reference (resolved by the behavior registry). */
  behavior?: LayoutBehavior;
  /** Runtime particle/VFX emitter attached to this object. */
  particle?: LayoutParticleEmitter;
  /** Authored interaction marker (interpreted by runtime game rules). */
  interaction?: LayoutInteraction;
  // `fracture` (per-placement fracture override) waits for the fracture port (Faz 8).
}

export interface LayoutModelInstances {
  assetId: string;
  placements: LayoutPlacement[];
}

/**
 * TRANSITION (plan 2b): the slice of Forge's `RoomLayout` (the old level
 * document) that ported code reads: World Builder stages read and the stage
 * runner writes `instances`. Not the whole document; Faz 6 / tools/world move
 * this to the new level model.
 */
export interface RoomLayout {
  instances: LayoutModelInstances[];
}
