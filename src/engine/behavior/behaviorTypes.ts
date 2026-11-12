// Ported from Forge WebGL engine/behavior/behaviorSubsystem.ts (types) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// Split from behaviorSubsystem.ts for the 1,500-line budget (user-approved 2026-11-12):
// the behavior API types; declarations unchanged except where the K12 cut notes say.
// LaunchOptions / TransformSink live in movement/movementHostTypes.ts and the
// physics query types in physics/physicsQuery.ts (moved there with their ports).
import type { AudioBus } from "../audio/audioTypes.ts";
import type { ActionMap } from "../input/actionMap.ts";
import type { InteractionComponent, TransformComponent } from "../legacy/components.ts";
import type { EntityId, SceneJsonValue } from "../legacy/entity.ts";
import type { LaunchOptions } from "../movement/movementHostTypes.ts";
import type { PhysicsImpact } from "../physics/impactEvents.ts";
import type { PhysicsContact, PhysicsQuery } from "../physics/physicsQuery.ts";
import type { EngineUpdateContext } from "../subsystem.ts";
import type { ActorEventKind } from "./actorEvents.ts";
import type {
  ScriptMessageBus,
  ScriptMessageEnvelope,
  ScriptMessageFlushResult,
  ScriptMessagePayload,
  ScriptMessageTraceEntry,
  ScriptMessageWarning,
} from "./scriptMessages.ts";

export type EntityRef = EntityId;

export interface ScriptMessages {
  send(target: EntityRef, type: string, payload?: ScriptMessagePayload): void;
  emit(type: string, payload?: ScriptMessagePayload): void;
}

export type ReadonlyVec3 = readonly [number, number, number];

export interface ScriptTransformSnapshot {
  readonly position: ReadonlyVec3;
  readonly rotation: ReadonlyVec3;
  readonly scale: ReadonlyVec3;
}

/**
 * Host-provided read-only velocity source (A6, Unreal `GetVelocity`). Character
 * (kinematic) velocity lives in the game's CharacterMovement subsystem and
 * simulated bodies in the physics subsystem, so the runtime shell implements this
 * by combining those sources; the engine only consumes it through
 * {@link ScriptWorld.velocityOf}. Absent in pure tests, where a stub is passed.
 */
export interface EntityVelocityProvider {
  /** World-space linear velocity (units/s) of an entity, or null when unknown. */
  velocityOf(entityId: EntityId): ReadonlyVec3 | null;
}

// K12 (Actor Script surface not ported): `ref(key)` (authored references),
// `withInterface` and `nearestWithInterface` (script interfaces) are cut.
export interface ScriptWorld {
  self(): EntityRef;
  byName(name: string): EntityRef | null;
  byTag(tag: string): EntityRef[];
  byClassRef(classRef: string): EntityRef[];
  transformOf(ref: EntityRef): ScriptTransformSnapshot | null;
  distanceTo(ref: EntityRef): number | null;
  forwardOf(ref: EntityRef): ReadonlyVec3 | null;
  rightOf(ref: EntityRef): ReadonlyVec3 | null;
  upOf(ref: EntityRef): ReadonlyVec3 | null;
  /**
   * World-space linear velocity (units/s) of `ref`, or null when the host has no
   * velocity for it (no provider wired, or a static/behavior-parked actor).
   */
  velocityOf(ref: EntityRef): ReadonlyVec3 | null;
  /**
   * The actor that spawned `ref` (Unreal Owner/Instigator), or null when `ref`
   * was authored into the layout, has no owner, or its owner has left play.
   */
  ownerOf(ref: EntityRef): EntityRef | null;
}

export interface ScriptState {
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, value: T): void;
  toggle(key: string, fallback?: boolean): boolean;
  persist(key: string, value: SceneJsonValue): void;
}

export type ActorEventPhase = "begin" | "end";

/**
 * Why an `endPlay` event fired: `destroyed` for an explicit `actor.destroy()` /
 * lifespan expiry, `teardown` for scene reload / disposal, `unloaded` when the
 * actor's World Partition cell unloads (Unreal `RemovedFromWorld`). An unloaded
 * actor may return later as a fresh instance.
 */
export type ActorEndPlayReason = "destroyed" | "teardown" | "unloaded";

export interface ActorEventEnvelope {
  readonly kind: ActorEventKind;
  readonly frame: number;
  readonly entityId: EntityId;
  readonly phase?: ActorEventPhase;
  readonly otherEntityId?: EntityId;
  readonly contact?: PhysicsContact;
  /** Present on `impact` events: the frame's merged impact of this pair. */
  readonly impact?: PhysicsImpact;
  /** Present on `endPlay` events: why the actor left play. */
  readonly reason?: ActorEndPlayReason;
  readonly payload?: ScriptMessagePayload;
}

export type ScriptTimerHandle = string;

export interface ScriptTimers {
  after(seconds: number, message: string, payload?: ScriptMessagePayload): ScriptTimerHandle;
  clear(handle: ScriptTimerHandle): void;
}

export interface ActorSpawnRequest {
  readonly sourceEntityId: EntityId;
  readonly classRef: string;
  readonly transform: TransformComponent;
  readonly params?: Record<string, SceneJsonValue>;
}

/**
 * Options for {@link ActorCommands.attachTo} (Unreal `AttachToActor` location
 * rule): `keepWorld` (default) preserves the child's current world pose and
 * captures it as a relative offset; `snapToTarget` snaps the child onto the
 * parent's transform.
 */
export interface AttachOptions {
  readonly rule?: "keepWorld" | "snapToTarget";
}

/** Options shared by the actor commands: opt in to save-game persistence. */
export interface ActorCommandOptions {
  /**
   * When true, the effect is written to this entity's persistent script state
   * ({@link getPersistentStateSnapshot}) so a save-game restores it on a fresh
   * scene. Never touches the layout file — runtime state only.
   */
  readonly persist?: boolean;
}

/**
 * The generic per-actor command surface (Unreal `SetActorHiddenInGame` /
 * `DestroyActor`). A behavior calls these on {@link BehaviorContext.actor} to
 * act on *its own* entity; the subsystem queues them and applies them once the
 * current tick's behaviors + message flush have run (deterministic end-of-tick
 * mutation), delivering visibility/teardown to the host via an
 * {@link ActorCommandSink}. Targeting other actors is intentionally not exposed
 * here — cross-actor effects go through script messages.
 */
export interface ActorCommands {
  /** Shows/hides this entity's rendered object (host-applied). */
  setVisibility(visible: boolean, options?: ActorCommandOptions): void;
  /**
   * Toggles this entity's collision (Unreal `SetActorEnableCollision`). Disabled,
   * it stops generating overlap/hit contacts and stops blocking character
   * movement (e.g. an opened door/platform becomes walk-through), while its
   * rendered object and transform are untouched. Applied at end of tick like the
   * other commands.
   */
  setCollisionEnabled(enabled: boolean, options?: ActorCommandOptions): void;
  /**
   * Destroys this entity: after this tick it leaves the behavior instance set,
   * the world indexes and its message subscriptions, and the host removes its
   * render object + physics body. Subsequent ticks/messages/contacts skip it.
   */
  destroy(options?: ActorCommandOptions): void;
  /**
   * Destroys this entity after `seconds` of behavior simulation time. Passing 0
   * or a negative/non-finite value clears the active lifespan, matching Unreal's
   * SetLifeSpan(0) cancel semantics.
   */
  setLifeSpan(seconds: number): void;
  /**
   * Enables/disables this entity's `tick` bindings (Unreal `SetActorTickEnabled`).
   * Disabled, its per-frame behaviors stop running while its other event bindings
   * (beginPlay/overlap/hit/interact) keep firing. Takes effect from the next tick.
   */
  setTickEnabled(enabled: boolean): void;
  /**
   * Throttles this entity's `tick` bindings to run at most every `seconds`
   * (Unreal `Actor Tick Interval`). The throttled tick receives the accumulated
   * elapsed time as `engine.deltaSeconds` so time-integrated logic stays correct.
   * Passing 0 or a negative/non-finite value restores every-frame ticking.
   */
  setTickInterval(seconds: number): void;
  /**
   * Applies an instantaneous linear impulse to this entity's *simulated* (dynamic)
   * physics body (Unreal `AddImpulse`). No-op on a body that isn't simulating
   * physics (static/kinematic); use {@link launch} for characters.
   */
  addImpulse(impulse: ReadonlyVec3): void;
  /**
   * Launches this entity if it is a character (Unreal `LaunchCharacter`): injects
   * a launch velocity into its CharacterMovement so it goes airborne and arcs /
   * is knocked back. Additive by default; {@link LaunchOptions} overrides a
   * component. No-op on a non-character entity.
   */
  launch(velocity: ReadonlyVec3, options?: LaunchOptions): void;
  /**
   * Attaches this entity to `parent` (Unreal `AttachToActor`): from the next frame
   * its world transform follows the parent's (translating + orbiting/co-rotating
   * as the parent moves), until {@link detach}. Kinematic follow — the parent must
   * be an actor whose transform the behavior subsystem drives (a behavior-moved /
   * spawned actor); a purely physics/character-driven parent is out of scope.
   */
  attachTo(parent: EntityRef, options?: AttachOptions): void;
  /** Detaches this entity from its parent (Unreal `DetachFromActor`); keeps its pose. */
  detach(): void;
  /**
   * Queues a runtime actor spawn from an Actor Script class. The host resolves
   * the class/ref and instantiates render + physics incrementally; exposed params
   * are merged into the spawned class's behavior binding params.
   */
  spawn(
    classRef: string,
    transform: TransformComponent,
    params?: Record<string, SceneJsonValue>,
  ): void;
}

/**
 * Host sink for {@link ActorCommands}, wired by the runtime shell (the
 * `AudioBus` precedent: engine defines the surface, the host implements it).
 * `setVisibility` toggles the entity's rendered object; `destroy` tears down its
 * render object and physics body. The subsystem does its own internal cleanup
 * (indexes/instances/subscriptions) before calling `destroy`, so the sink only
 * owns render + physics.
 */
export interface ActorCommandSink {
  setVisibility(entityId: EntityId, visible: boolean): void;
  destroy(entityId: EntityId): void;
  /** Enables/disables the entity's physics collision (A6 SetActorEnableCollision). */
  setCollisionEnabled?(entityId: EntityId, enabled: boolean): void;
  /** Applies an impulse to the entity's simulated body (A6 AddImpulse). */
  addImpulse?(entityId: EntityId, impulse: ReadonlyVec3): void;
  /** Launches the entity if it is a character (A6 LaunchCharacter). */
  launch?(entityId: EntityId, velocity: ReadonlyVec3, options: LaunchOptions): void;
  spawn?(request: ActorSpawnRequest): void;
}

export interface PersistentScriptStateEntry {
  readonly entityId: EntityId;
  readonly key: string;
  readonly value: SceneJsonValue;
}

/** Per-tick context handed to a behavior update function. */
export interface BehaviorContext {
  readonly entityId: EntityId;
  readonly engine: EngineUpdateContext;
  readonly actions: ActionMap;
  readonly messages: ScriptMessages;
  readonly world: ScriptWorld;
  readonly state: ScriptState;
  readonly timers: ScriptTimers;
  /** Generic per-actor commands (visibility/destroy) targeting this entity. */
  readonly actor: ActorCommands;
  /**
   * The actor that spawned this entity (Unreal Owner/Instigator), or null when it
   * was authored into the layout or its owner has left play. Convenience for
   * `world.ownerOf(world.self())`.
   */
  readonly owner: EntityRef | null;
  readonly physics?: PhysicsQuery;
  readonly audio?: AudioBus;
  // K12: `audioComponent` (the audio component) is cut; the AudioBus stays.
  /** This entity's authored interaction marker, when it carries one. */
  readonly interactionComponent?: InteractionComponent;
  readonly params: Record<string, SceneJsonValue>;
  /** Present when this behavior was invoked for an actor event ({@link BehaviorDefinition.events}). */
  readonly event?: ActorEventEnvelope;
  /** Present when this behavior was invoked for a script message ({@link BehaviorDefinition.messages}). */
  readonly message?: ScriptMessageEnvelope;
  /** This entity's transform; behaviors mutate it in place. */
  readonly transform: TransformComponent;
}

export type BehaviorUpdate = (context: BehaviorContext) => void;

/**
 * A script message a behavior handles (K12, user decision 2026-11-12): declared
 * in code where Forge read a `MessageBindings` component. `self` receives only
 * messages sent to this actor; `any` every message of the type.
 */
export interface BehaviorMessageHandler {
  readonly target: "self" | "any";
  readonly handle: BehaviorUpdate;
}

/**
 * A code-registered behavior with its event and message handlers (K12, user
 * decision 2026-11-12). Forge bound events and messages to scripts with authored
 * `EventBindings` / `MessageBindings` components; here the registration declares
 * them and the actor's `Behavior` component (script id + params) selects it.
 * `tick` runs every frame like Forge's `Behavior` script; `events.tick` is a tick
 * event handler like Forge's tick binding (both honour tick enable / interval).
 */
export interface BehaviorDefinition {
  readonly tick?: BehaviorUpdate;
  readonly events?: Partial<Record<ActorEventKind, BehaviorUpdate>>;
  readonly messages?: Readonly<Record<string, BehaviorMessageHandler>>;
}

/** A plain update function is a tick-only behavior (Forge's `Behavior` script). */
export type BehaviorRegistration = BehaviorUpdate | BehaviorDefinition;

/** Resolves a script id to its registration. Runtime/game-owned. */
export interface BehaviorRegistry {
  get(scriptId: string): BehaviorRegistration | undefined;
}


export interface BehaviorSubsystemOptions {
  readonly messageBus?: ScriptMessageBus;
  readonly messageTraceLimit?: number;
  readonly onMessageWarnings?: (warnings: readonly ScriptMessageWarning[]) => void;
  /** Host sink for actor visibility/destroy commands (A1); omitted in pure tests. */
  readonly actorCommandSink?: ActorCommandSink;
  /** Host velocity source for `world.velocityOf` (A6); omitted in pure tests. */
  readonly velocityProvider?: EntityVelocityProvider;
}

export interface ScriptMessageSubscriberDebugInfo {
  readonly entityId: EntityId;
  readonly message: string;
  readonly scriptId: string;
  readonly target: "self" | "any";
}

export interface ScriptActorDebugInfo {
  readonly entityId: EntityId;
  readonly name?: string;
  readonly classRef?: string;
  readonly nodeId?: string;
  // K12: `interfaces` and `dispatchers` (script interfaces / event dispatchers) are cut.
  readonly subscribers: readonly ScriptMessageSubscriberDebugInfo[];
}

export interface ScriptMessageDebugSnapshot {
  readonly lastFlush: ScriptMessageFlushResult;
  readonly recentMessages: readonly ScriptMessageTraceEntry[];
  readonly subscribers: readonly ScriptMessageSubscriberDebugInfo[];
}

