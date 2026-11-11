// Ported from Forge WebGL engine/physics/physicsSubsystem.ts (the subsystem) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// Forge's PhysicsSubsystem was one 2,817-line file; this repo's budget stops at
// 1,500, so it is split into physicsSubsystem / staticWorld / vehiclePhysics /
// physicsBodies / physicsTypes with method bodies unchanged. The ragdoll is not
// ported (plan K12).
import { type NavigationObstacleVisitor, type NavigationRect, type NavigationTriangleVisitor } from "./navigationGeometry.ts";
import { type GroundSurfaceSample } from "../movement/slopeSurface.ts";
import type { EngineUpdateContext, Subsystem } from "../subsystem.ts";
import { type TransformComponent } from "../legacy/components.ts";
import { interactionGroupsInteract } from "./collision.ts";
import { FixedStepClock, lerpPosition, nlerpQuaternion } from "./fixedStep.ts";
import { ImpactAccumulator, impulseToForceThreshold, manifoldNormal, type ImpactContactPoint, type ImpactVec3, type PhysicsImpact } from "./impactEvents.ts";
import { type VehicleGroundSinkProvider, type VehicleSurfaceProvider } from "./surface/surfaceResponse.ts";
import { initialVehicleDrivetrainState } from "./vehicle/vehicleDrivetrain.ts";
import { NEUTRAL_VEHICLE_INPUT, type VehicleDefinition, type VehicleInput, type VehicleMotionState, type VehicleState } from "./vehicle/vehicleTypes.ts";
import type { Entity, EntityId } from "../legacy/entity.ts";
import type { PhysicsAabb, PhysicsContact, PhysicsQuery, PhysicsSurfaceTriangle } from "./physicsQuery.ts";
import type { Vec3 } from "../legacy/layout.ts";
import { PHYSICS_SUBSYSTEM_ID, PASS_THROUGH_MARGIN, type PhysicsBackend, type PhysicsTransformSink, type PhysicsSubsystemOptions, type DynamicPhysicsActiveAreaSettings, type PhysicsBody, type RapierModule, type RapierWorld, type RapierRigidBody, type RapierCollider, type RapierEventQueue, type VehicleRecord, type RapierBodyRecord, type PreviousBodyPose, type SuspendedDynamicBody } from "./physicsTypes.ts";
import { impactNormal, contactKey, isOutsideDynamicActiveArea, bodyAabb, aabbOverlaps, cloneTransform, bodyFromEntity, colliderDescsForBody, rigidBodyDescForBody, vectorFromTransform, vectorFromVec3, quaternionFromEulerDegrees, eulerDegreesFromQuaternion } from "./physicsBodies.ts";
import { StaticWorld } from "./staticWorld.ts";
import { VehiclePhysics } from "./vehiclePhysics.ts";

export class PhysicsSubsystem implements Subsystem, PhysicsQuery {
  readonly id = PHYSICS_SUBSYSTEM_ID;
  private readonly backend: PhysicsBackend;
  private bodies: PhysicsBody[] = [];
  private readonly bodiesById = new Map<EntityId, PhysicsBody>();
  private contacts: PhysicsContact[] = [];
  /**
   * Entities whose collision is runtime-disabled (A6 SetActorEnableCollision).
   * They are skipped by contact generation and the movement-blocker/surface
   * collectors; with Rapier their colliders are also `setEnabled(false)`.
   */
  private collisionDisabled = new Set<EntityId>();
  /** Entities whose collider ignores the camera trace channel; rebuilt lazily. */
  private cameraIgnoredCache: Set<EntityId> | null = null;
  private rapierModule: RapierModule | null = null;
  private rapierWorld: RapierWorld | null = null;
  private rapierBodies = new Map<EntityId, RapierBodyRecord>();
  /** Far dynamic bodies deliberately put to sleep by the optional active-area policy. */
  private suspendedDynamicBodies = new Map<EntityId, SuspendedDynamicBody>();
  private dynamicActiveArea: DynamicPhysicsActiveAreaSettings = {};
  private rapierColliderToEntity = new Map<number, EntityId>();
  private gravity: Vec3 = [0, -9.81, 0];
  private transformSink: PhysicsTransformSink | null = null;
  private enabled = true;
  private readonly stepClock: FixedStepClock;
  /** Rapier slices taken by the latest `update()` (0 on a frame shorter than a step). */
  private frameStepCount = 0;
  /** Dynamic poses before the latest slice, for render interpolation. */
  private previousPoses = new Map<EntityId, PreviousBodyPose>();
  private readonly fixedStepListeners = new Set<(deltaSeconds: number) => void>();
  /** Opt-in impact sources: entity → owner → minimum slice impulse (N·s); see {@link setImpactEventThreshold}. */
  private readonly impactThresholds = new Map<EntityId, Map<string, number>>();
  /**
   * Bodies that pass through each other until they drift apart: entity → the
   * bodies it ignores. See {@link passThroughUntilApart}.
   */
  private readonly passThrough = new Map<EntityId, Set<EntityId>>();
  private readonly passThroughHooks = {
    filterContactPair: (collider1: number, collider2: number): number | null => {
      const a = this.rapierColliderToEntity.get(collider1);
      const b = this.rapierColliderToEntity.get(collider2);
      if (a !== undefined && b !== undefined && (this.passThrough.get(a)?.has(b) || this.passThrough.get(b)?.has(a))) return null;
      return this.rapierModule!.SolverFlags.COMPUTE_IMPULSE;
    },
    filterIntersectionPair: (): boolean => true,
  };
  private rapierEventQueue: RapierEventQueue | null = null;
  private readonly impactAccumulator = new ImpactAccumulator();
  private frameImpacts: readonly PhysicsImpact[] = [];
  private frameImpactsOverBudget = 0;

  /** Static blockers, surfaces and navigation views (see {@link StaticWorld}). */
  private readonly staticWorld = new StaticWorld(this.collisionDisabled, this.bodiesById);
  /** Ray-cast vehicles (see {@link VehiclePhysics}); reads the live world through this host. */
  private readonly vehiclePhysics = new VehiclePhysics({
    rapierModule: () => this.rapierModule,
    rapierWorld: () => this.rapierWorld,
    rapierBodies: () => this.rapierBodies,
    bodies: () => this.bodies,
    suspendedDynamicBodies: () => this.suspendedDynamicBodies,
    rapierColliderToEntity: () => this.rapierColliderToEntity,
    gravity: () => this.gravity,
    setEntityTransform: (entityId, transform) => this.setEntityTransform(entityId, transform),
  });

  private invalidateStaticCaches(): void {
    this.staticWorld.invalidateStaticCaches();
    this.cameraIgnoredCache = null;
  }

  /** Runtime CPU ground state advances after every completed physics slice. */
  onFixedStep(listener: (deltaSeconds: number) => void): () => void {
    this.fixedStepListeners.add(listener);
    return () => { this.fixedStepListeners.delete(listener); };
  }

  constructor(options: PhysicsSubsystemOptions = {}) {
    this.backend = options.backend ?? "placeholder";
    this.stepClock = new FixedStepClock({
      step: options.fixedTimestep,
      maxSubsteps: options.maxSubstepsPerFrame,
    });
  }

  /** The fixed Rapier slice length in seconds. */
  fixedTimestep(): number {
    return this.stepClock.step;
  }

  /** How many fixed slices the latest `update()` simulated. */
  lastFrameStepCount(): number {
    return this.frameStepCount;
  }

  /** Live collider profile reference for generic surface-provider hosts. */
  colliderPhysicalMaterialId(entityId: EntityId): string | undefined {
    return this.bodiesById.get(entityId)?.collider.physicalMaterialId;
  }

  /** Render blend (0..1) between the previous and latest simulated dynamic poses. */
  interpolationAlpha(): number {
    return this.stepClock.alpha;
  }

  /**
   * The latest *simulated* pose of a dynamic body (not the render blend), or
   * null for static/kinematic/unknown entities. Hosts read it where the
   * entity's own Transform component is stale because physics moves the body.
   */
  simulatedTransform(entityId: EntityId): TransformComponent | null {
    const body = this.bodiesById.get(entityId);
    if (!body?.collider.simulatePhysics || !this.rapierBodies.has(entityId)) return null;
    return cloneTransform(body.transform);
  }

  /**
   * Loads the Rapier runtime only when the scene actually needs it. The heavy
   * Rapier WASM/compat module (the `vendor-physics` chunk, ~2 MB) is pulled in
   * here via dynamic import, so a physics-free game never fetches it.
   *
   * Backend `"rapier"` is a *preference*: the real load is derived from scene
   * content. If the entities passed to `setEntities()` yielded no collider
   * bodies we stay on the placeholder backend — `update()` falls back to AABB
   * overlap when there is no `rapierWorld` — so only scenes with colliders pay
   * the cost. Relies on `setEntities()` running before `init()`, which is the
   * SceneApp / RuntimeSceneApp load order.
   */
  async init(): Promise<void> {
    if (this.backend !== "rapier" || this.bodies.length === 0) return;
    this.rapierModule = await import("@dimforge/rapier3d-compat");
    await this.rapierModule.init();
    this.rebuildRapierWorld();
  }

  /** True once the Rapier runtime has been loaded (i.e. the scene had colliders). */
  usesRapier(): boolean {
    return this.rapierModule !== null;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setGravity(gravity: Vec3): void {
    this.gravity = [...gravity];
    if (this.rapierWorld) {
      this.rapierWorld.gravity = vectorFromVec3(this.gravity);
    }
  }

  setTransformSink(sink: PhysicsTransformSink | null): void {
    this.transformSink = sink;
  }

  /**
   * Configures the optional runtime-only active area for *dynamic* Rapier bodies.
   * Empty/invalid settings immediately restore every body the policy suspended;
   * static colliders and kinematic character bodies are never affected.
   */
  setDynamicActiveArea(settings: DynamicPhysicsActiveAreaSettings): void {
    this.dynamicActiveArea = { ...settings };
    if (!this.hasDynamicActiveArea()) this.resumeSuspendedDynamicBodies();
  }

  /** Presentation shares the last physics step's active-radius decision. */
  isDynamicBodyActive(entityId: EntityId): boolean {
    return !this.suspendedDynamicBodies.has(entityId);
  }

  setEntities(entities: readonly Entity[]): void {
    this.bodies = [];
    this.bodiesById.clear();
    for (const entity of entities) {
      if (this.bodiesById.has(entity.id)) continue;
      const body = bodyFromEntity(entity);
      if (!body) continue;
      this.bodies.push(body);
      this.bodiesById.set(body.id, body);
    }
    this.contacts = [];
    this.collisionDisabled.clear();
    this.suspendedDynamicBodies.clear();
    this.staticWorld.staticRecords.clear();
    this.staticWorld.heightfieldRecords.clear();
    this.staticWorld.staticBlockerIndex.clear();
    this.staticWorld.staticSurfaceIndex.clear();
    this.staticWorld.nextStaticOrder = 0;
    for (const body of this.bodies) this.staticWorld.recordStaticBody(body);
    this.invalidateStaticCaches();
    this.staticWorld.navigationDirty = "all";
    // Component vehicles are rebuilt from the new entity set; API ones persist.
    for (const [entityId, vehicle] of this.vehiclePhysics.vehicles) {
      if (vehicle.source === "component") this.vehiclePhysics.removeVehicle(entityId);
    }
    if (this.rapierModule) this.rebuildRapierWorld();
  }

  /** Incrementally adds one entity's collider body for runtime SpawnActor. */
  addEntity(entity: Entity): boolean {
    return this.addEntities([entity]) > 0;
  }

  /** Adds a batch in input order, invalidating legacy flat caches only once. */
  addEntities(entities: readonly Entity[]): number {
    let added = 0;
    let addedStatic = false;
    for (const entity of entities) {
      if (this.bodiesById.has(entity.id)) continue;
      const body = bodyFromEntity(entity);
      if (!body) continue;
      this.bodies.push(body);
      this.bodiesById.set(body.id, body);
      this.staticWorld.recordStaticBody(body);
      addedStatic ||= body.collider.isStatic;
      this.staticWorld.markNavigationDirty(body);
      if (this.rapierWorld && this.rapierModule) this.addRapierBody(body);
      added += 1;
    }
    if (added > 0) this.contacts = [];
    if (addedStatic) this.invalidateStaticCaches();
    else if (added > 0) this.cameraIgnoredCache = null;
    return added;
  }

  setEntityTransform(entityId: EntityId, transform: TransformComponent): void {
    const body = this.bodiesById.get(entityId);
    if (!body) return;
    this.staticWorld.markNavigationDirty(body);
    body.transform = cloneTransform(transform);
    this.staticWorld.markNavigationDirty(body);
    if (body.collider.isStatic) {
      const record = this.staticWorld.staticRecords.get(entityId);
      if (record) this.staticWorld.indexStaticRecord(record, false);
      this.staticWorld.recordStaticBody(body, record?.order);
      this.invalidateStaticCaches();
    }
    const rapier = this.rapierBodies.get(entityId);
    if (!rapier) return;
    // A teleport must not render as a one-step slide from the old pose.
    this.previousPoses.delete(entityId);
    const translation = vectorFromTransform(transform);
    const rotation = quaternionFromEulerDegrees(transform.rotation);
    if (rapier.body.isKinematic()) {
      rapier.body.setNextKinematicTranslation(translation);
      rapier.body.setNextKinematicRotation(rotation);
    } else {
      rapier.body.setTranslation(translation, true);
      rapier.body.setRotation(rotation, true);
    }
  }

  /**
   * Removes a single entity's body from the world (runtime DestroyActor, A1),
   * incrementally so a destroy doesn't pay a full `setEntities` rebuild. Drops it
   * from the placeholder body list, clears any contact that referenced it (so the
   * very next query already reads empty), invalidates the static caches when a
   * static body left, and — when Rapier is live — frees the rigid body (its
   * colliders go with it) and forgets its collider→entity handles.
   */
  removeEntity(entityId: EntityId): void {
    this.removeEntities([entityId]);
  }

  /** Removes a batch with one body-list pass and one legacy-cache invalidation. */
  removeEntities(entityIds: readonly EntityId[]): void {
    const ids = new Set(entityIds);
    let removedStatic = false;
    for (const entityId of ids) {
      const removed = this.bodiesById.get(entityId);
      removedStatic ||= removed?.collider.isStatic === true;
      if (removed) this.staticWorld.markNavigationDirty(removed);
      this.bodiesById.delete(entityId);
      this.staticWorld.dropStaticRecord(entityId);
      this.collisionDisabled.delete(entityId);
      this.suspendedDynamicBodies.delete(entityId);
      this.previousPoses.delete(entityId);
      this.vehiclePhysics.removeVehicle(entityId);
      const record = this.rapierBodies.get(entityId);
      if (record) {
        for (const collider of record.colliders) this.rapierColliderToEntity.delete(collider.handle);
        this.rapierWorld?.removeRigidBody(record.body);
        this.rapierBodies.delete(entityId);
      }
    }
    this.bodies = this.bodies.filter((body) => !ids.has(body.id));
    this.contacts = this.contacts.filter((contact) => !ids.has(contact.a) && !ids.has(contact.b));
    if (removedStatic) this.invalidateStaticCaches();
    else this.cameraIgnoredCache = null;
  }

  /**
   * Runtime collision toggle (A6 `SetActorEnableCollision`). A disabled entity is
   * dropped from contact generation and from the movement blockers/surfaces (so a
   * possessed pawn walks through an opened door), and — when Rapier is live — its
   * colliders are `setEnabled(false)` so the dynamic simulation ignores them too.
   * The entity keeps its body record and transform, so re-enabling restores the
   * original collider without a rebuild. No-op when the state is unchanged.
   */
  setEntityCollisionEnabled(entityId: EntityId, enabled: boolean): void {
    const alreadyDisabled = this.collisionDisabled.has(entityId);
    if (enabled === !alreadyDisabled) return;
    if (enabled) this.collisionDisabled.delete(entityId);
    else this.collisionDisabled.add(entityId);
    const body = this.bodiesById.get(entityId);
    if (body) this.staticWorld.markNavigationDirty(body);
    if (body?.collider.isStatic) {
      const record = this.staticWorld.staticRecords.get(entityId);
      if (record) this.staticWorld.indexStaticRecord(record, enabled);
      this.invalidateStaticCaches();
    }
    // Clear any live contact for this entity so the next query already reads the
    // new state (mirrors removeEntity); the placeholder loop won't regenerate it.
    this.contacts = this.contacts.filter(
      (contact) => contact.a !== entityId && contact.b !== entityId,
    );
    const record = this.rapierBodies.get(entityId);
    if (record) {
      for (const collider of record.colliders) collider.setEnabled(enabled);
    }
  }

  /** False while {@link setEntityCollisionEnabled} has the entity switched off. */
  isEntityCollisionEnabled(entityId: EntityId): boolean {
    return !this.collisionDisabled.has(entityId);
  }

  contactsForEntity(entityId: EntityId): readonly PhysicsContact[] {
    return this.contacts.filter((contact) => contact.a === entityId || contact.b === entityId);
  }

  /**
   * Opts an entity's colliders into impact events (Faz 1 of
   * DEFORMABLE_FRACTURABLE_WORK_PLAN). A fixed slice whose contact impulse
   * against the entity exceeds `minImpulse` (N·s) is reported by
   * {@link impacts}; quieter contacts are filtered inside Rapier and cost
   * nothing. `null` opts out. The setting is runtime-only (fracture/deformable
   * modules call it), outlives the body (a re-added or rebuilt body picks it
   * up again) and is dropped by `clear()`. Kinematic ↔ fixed pairs never
   * produce events in Rapier; those break through `Damage.Apply` instead.
   *
   * Each `owner` holds its own threshold and the entity reports at the lowest
   * one, so an object that both breaks and dents keeps both opt-ins. Impacts
   * are shared: a consumer must compare `impulse` with its own threshold.
   */
  setImpactEventThreshold(entityId: EntityId, minImpulse: number | null, owner = "default"): void {
    const owners = this.impactThresholds.get(entityId);
    if (minImpulse === null || !Number.isFinite(minImpulse)) {
      owners?.delete(owner);
      if (owners?.size === 0) this.impactThresholds.delete(entityId);
    } else if (owners) {
      owners.set(owner, Math.max(0, minImpulse));
    } else {
      this.impactThresholds.set(entityId, new Map([[owner, Math.max(0, minImpulse)]]));
    }
    const record = this.rapierBodies.get(entityId);
    if (record) this.applyImpactEvents(record);
  }

  /**
   * Impacts of the latest `update()`, one per body pair with every fixed slice
   * of the frame merged (see `ImpactAccumulator`). Empty on a frame that took
   * no slice and on the placeholder (AABB) backend.
   */
  impacts(): readonly PhysicsImpact[] {
    return this.frameImpacts;
  }

  /** The latest frame's impacts that involve `entityId`. */
  impactsForEntity(entityId: EntityId): readonly PhysicsImpact[] {
    return this.frameImpacts.filter((impact) => impact.a === entityId || impact.b === entityId);
  }

  /** Pairs the per-frame impact budget left out of the latest {@link impacts}. */
  impactsOverBudget(): number {
    return this.frameImpactsOverBudget;
  }

  /**
   * Camera trace along `from → to` against the static world — Unreal's Camera
   * channel: fixed, non-sensor colliders whose profile does not ignore the
   * camera. Returns the fraction (0..1) of the segment at which the first one is
   * hit, or null when the view is clear. Moving bodies (dynamic, kinematic) never
   * block, so a car's own chassis or a passing crate does not yank the view;
   * neither does a collider switched off with `setEntityCollisionEnabled`.
   * Null without a Rapier world: the exact shapes live there, and the AABB
   * blockers would pull the camera in at every rotated ramp.
   */
  traceCamera(from: Vec3, to: Vec3): number | null {
    const RAPIER = this.rapierModule;
    const world = this.rapierWorld;
    if (!RAPIER || !world) return null;
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const dz = to[2] - from[2];
    const length = Math.hypot(dx, dy, dz);
    if (!(length > 1e-6)) return null;
    const ray = new RAPIER.Ray(
      { x: from[0], y: from[1], z: from[2] },
      { x: dx / length, y: dy / length, z: dz / length },
    );
    const ignored = this.cameraIgnoredEntities();
    const hit = world.castRay(
      ray,
      length,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC |
        RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC |
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      undefined,
      ignored.size === 0 && this.collisionDisabled.size === 0
        ? undefined
        : (collider) => {
            // A disabled collider still answers scene queries until the next step.
            const entityId = this.rapierColliderToEntity.get(collider.handle) ?? "";
            return !ignored.has(entityId) && !this.collisionDisabled.has(entityId);
          },
    );
    return hit ? Math.min(1, Math.max(0, hit.timeOfImpact / length)) : null;
  }

  /**
   * Whether a convex shape at a world pose touches a fixed, non-sensor collider
   * of any entity outside `exclude` — the fracture World Support probe (a chunk
   * resting on the floor or set into a wall holds). `points` are relative to
   * `position`, rotation is a quaternion [x, y, z, w]; they are inflated by
   * `margin` metres away from their centroid so a face lying exactly on the
   * ground still counts. False without a Rapier world or for a degenerate hull.
   */
  touchesStaticWorld(
    position: readonly [number, number, number],
    rotation: readonly [number, number, number, number],
    points: readonly (readonly [number, number, number])[],
    exclude: ReadonlySet<EntityId>,
    margin = 0.02,
  ): boolean {
    const RAPIER = this.rapierModule;
    const world = this.rapierWorld;
    if (!RAPIER || !world || points.length < 4) return false;
    const centroid = [0, 1, 2].map((axis) => points.reduce((sum, point) => sum + point[axis]!, 0) / points.length);
    const vertices = new Float32Array(points.length * 3);
    points.forEach((point, index) => {
      const offset = [point[0] - centroid[0]!, point[1] - centroid[1]!, point[2] - centroid[2]!];
      const length = Math.hypot(...offset);
      const grow = length > 1e-9 ? (length + margin) / length : 1;
      for (let axis = 0; axis < 3; axis += 1) vertices[index * 3 + axis] = centroid[axis]! + offset[axis]! * grow;
    });
    let shape: InstanceType<typeof RAPIER.ConvexPolyhedron>;
    try {
      shape = new RAPIER.ConvexPolyhedron(vertices, null);
    } catch {
      return false;
    }
    const hit = world.intersectionWithShape(
      { x: position[0], y: position[1], z: position[2] },
      { x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] },
      shape,
      RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC |
        RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC |
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      undefined,
      (collider) => {
        const entityId = this.rapierColliderToEntity.get(collider.handle) ?? "";
        return !exclude.has(entityId) && !this.collisionDisabled.has(entityId);
      },
    );
    return hit !== null;
  }

  private cameraIgnoredEntities(): Set<EntityId> {
    if (this.cameraIgnoredCache) return this.cameraIgnoredCache;
    const ignored = new Set<EntityId>();
    for (const body of this.bodies) if (body.collider.ignoreCameraTrace) ignored.add(body.id);
    this.cameraIgnoredCache = ignored;
    return ignored;
  }

  /**
   * Half-extents of an entity's collider, or null if it has none. The collider
   * `size` already has placement scale baked at scene-build, so this is just
   * `size / 2`.
   */
  /**
   * The entity collider's body-local center offset plus half-extents (the same
   * scale-baked `size`/`center` the physics body was built from), or null if it
   * has none. Backs the runtime's collider debug wireframe so the overlay traces
   * exactly what physics collides with, revealing whether placement scale was
   * baked into the collider.
   */
  colliderDebugBox(
    entityId: EntityId,
  ): { center: [number, number, number]; halfExtents: [number, number, number] } | null {
    const body = this.bodiesById.get(entityId);
    if (!body) return null;
    const center = body.collider.center ?? [0, 0, 0];
    return {
      center: [center[0] ?? 0, center[1] ?? 0, center[2] ?? 0],
      halfExtents: [
        (body.collider.size[0] ?? 0) / 2,
        (body.collider.size[1] ?? 0) / 2,
        (body.collider.size[2] ?? 0) / 2,
      ],
    };
  }

  colliderHalfExtents(entityId: EntityId): readonly [number, number, number] | null {
    const body = this.bodiesById.get(entityId);
    if (!body) return null;
    return [
      (body.collider.size[0] ?? 0) / 2,
      (body.collider.size[1] ?? 0) / 2,
      (body.collider.size[2] ?? 0) / 2,
    ];
  }

  /**
   * World-space linear velocity (units/s) of a simulated body, backing the
   * runtime `world.velocityOf` (A6). Only meaningful for a live Rapier dynamic
   * body; kinematic/placeholder bodies (whose motion is driven externally) return
   * null so the host can fall back to another velocity source (character movement).
   */
  velocityOf(entityId: EntityId): readonly [number, number, number] | null {
    const record = this.rapierBodies.get(entityId);
    if (!record) return null;
    const body = this.bodiesById.get(entityId);
    if (!body?.collider.simulatePhysics) return null;
    const v = record.body.linvel();
    return [v.x, v.y, v.z];
  }

  /**
   * World velocity of a point carried by a simulated body: its linear velocity
   * plus `ω × r` around the centre of mass. Null when the entity is not one.
   */
  pointVelocity(entityId: EntityId, point: readonly [number, number, number]): readonly [number, number, number] | null {
    const record = this.rapierBodies.get(entityId);
    if (!record || !this.bodiesById.get(entityId)?.collider.simulatePhysics) return null;
    const v = record.body.velocityAtPoint({ x: point[0], y: point[1], z: point[2] });
    return [v.x, v.y, v.z];
  }

  /** World angular velocity of a simulated body, rad/s; null when the entity is not one. */
  angularVelocityOf(entityId: EntityId): readonly [number, number, number] | null {
    const record = this.rapierBodies.get(entityId);
    if (!record || !this.bodiesById.get(entityId)?.collider.simulatePhysics) return null;
    const w = record.body.angvel();
    return [w.x, w.y, w.z];
  }

  /** Sets a simulated body's velocities directly, unlike an impulse; wakes it. No-op on anything else. */
  setBodyVelocity(
    entityId: EntityId,
    linear: readonly [number, number, number],
    angular: readonly [number, number, number],
  ): void {
    const record = this.rapierBodies.get(entityId);
    if (!record || !this.bodiesById.get(entityId)?.collider.simulatePhysics) return;
    record.body.setLinvel({ x: linear[0], y: linear[1], z: linear[2] }, true);
    record.body.setAngvel({ x: angular[0], y: angular[1], z: angular[2] }, true);
  }

  /**
   * Lets two overlapping bodies pass through each other until they are apart,
   * then they collide again. A piece torn off a car starts inside the car's
   * collider, and the solver would otherwise throw the two apart. Only this pair
   * is affected; `entityId` keeps colliding with everything else.
   */
  passThroughUntilApart(entityId: EntityId, other: EntityId): void {
    const record = this.rapierBodies.get(entityId);
    const RAPIER = this.rapierModule;
    if (!record || !RAPIER) return;
    for (const collider of record.colliders) collider.setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS);
    const others = this.passThrough.get(entityId) ?? new Set<EntityId>();
    others.add(other);
    this.passThrough.set(entityId, others);
  }

  /** Drops the pairs that have drifted apart, or whose bodies are gone. */
  private releasePassThrough(): void {
    for (const [entityId, others] of this.passThrough) {
      const record = this.rapierBodies.get(entityId);
      for (const other of others) {
        const colliders = this.rapierBodies.get(other)?.colliders;
        const touching = record && colliders?.some((collider) =>
          record.colliders.some((own) => own.contactCollider(collider, PASS_THROUGH_MARGIN) !== null));
        if (!touching) others.delete(other);
      }
      if (others.size > 0) continue;
      this.passThrough.delete(entityId);
      // A flagged collider on a step without hooks is a fatal Rapier error.
      const RAPIER = this.rapierModule;
      if (record && RAPIER) for (const collider of record.colliders) collider.setActiveHooks(RAPIER.ActiveHooks.NONE);
    }
  }

  /**
   * Applies an instantaneous linear impulse to a simulated (dynamic) body
   * (A6 AddImpulse / knockback). No-op unless Rapier is live and the entity is a
   * `simulatePhysics` body — static/kinematic bodies (including the character
   * capsule) are position-driven, so they use `launch` instead. Wakes the body so
   * a resting object reacts.
   */
  applyImpulse(entityId: EntityId, impulse: readonly [number, number, number]): void {
    const record = this.rapierBodies.get(entityId);
    if (!record) return;
    const body = this.bodiesById.get(entityId);
    if (!body?.collider.simulatePhysics) return;
    record.body.applyImpulse({ x: impulse[0], y: impulse[1], z: impulse[2] }, true);
  }

  update(_context: EngineUpdateContext): void {
    this.frameImpacts = [];
    this.frameImpactsOverBudget = 0;
    if (!this.enabled) {
      this.contacts = [];
      return;
    }
    if (this.rapierWorld) {
      // Fixed slices, not one frame-sized step: the result must not depend on
      // the frame rate. A frame shorter than a slice simulates nothing and only
      // advances the render blend below.
      const steps = this.stepClock.advance(_context.deltaSeconds);
      this.frameStepCount = steps;
      if (steps > 0) {
        this.updateDynamicActiveArea();
        for (let index = 0; index < steps; index += 1) {
          if (index === steps - 1) this.capturePreviousPoses();
          // Vehicles push velocity into their chassis right before each slice.
          this.vehiclePhysics.updateVehicles(this.stepClock.step);
          // The queue only goes in when someone opted in, so a level without
          // impact sources steps exactly as before. It is drained per slice:
          // a manifold only reflects the slice that just ran.
          // Rapier only reads hooks on a step that has an event queue.
          const hooks = this.passThrough.size > 0 ? this.passThroughHooks : undefined;
          const queue = this.impactThresholds.size > 0 || hooks ? this.rapierEventQueue : null;
          if (queue) {
            this.rapierWorld.step(queue, hooks);
            this.collectImpactSamples(queue);
          } else {
            this.rapierWorld.step();
          }
          this.vehiclePhysics.applyVehicleGroundResistance(this.stepClock.step);
          for (const listener of this.fixedStepListeners) listener(this.stepClock.step);
        }
        this.updateRapierContacts();
        this.releasePassThrough();
        const frame = this.impactAccumulator.takeFrame();
        this.frameImpacts = frame.impacts;
        this.frameImpactsOverBudget = frame.overBudget;
      }
      this.syncRapierDynamicTransforms();
      return;
    }
    this.frameStepCount = 0;
    const contacts: PhysicsContact[] = [];
    for (let i = 0; i < this.bodies.length; i += 1) {
      for (let j = i + 1; j < this.bodies.length; j += 1) {
        const a = this.bodies[i];
        const b = this.bodies[j];
        if (!a || !b) continue;
        if (a.collider.isStatic && b.collider.isStatic) continue;
        if (this.collisionDisabled.has(a.id) || this.collisionDisabled.has(b.id)) continue;
        if (!interactionGroupsInteract(a.collider.collisionGroups, b.collider.collisionGroups)) {
          continue;
        }
        if (!aabbOverlaps(bodyAabb(a), bodyAabb(b))) continue;
        contacts.push({
          a: a.id,
          b: b.id,
          isSensor: a.collider.isSensor || b.collider.isSensor,
        });
      }
    }
    this.contacts = this.reportableContacts(contacts);
  }

  /**
   * Drops contacts whose owners opted out of events: a sensor overlap needs a
   * sensor with `generateOverlapEvents !== false`, and a solid hit needs a body
   * with `simulationGeneratesHitEvents !== false`. Both flags default to on
   * (absent), so unannotated bodies keep reporting every contact.
   */
  private reportableContacts(contacts: PhysicsContact[]): PhysicsContact[] {
    return contacts.filter((contact) => {
      const a = this.bodies.find((body) => body.id === contact.a);
      const b = this.bodies.find((body) => body.id === contact.b);
      if (!a || !b) return true;
      if (contact.isSensor) {
        return (
          (a.collider.isSensor && a.collider.generateOverlapEvents !== false) ||
          (b.collider.isSensor && b.collider.generateOverlapEvents !== false)
        );
      }
      return (
        a.collider.simulationGeneratesHitEvents !== false ||
        b.collider.simulationGeneratesHitEvents !== false
      );
    });
  }

  clear(): void {
    this.bodiesById.clear();
    this.staticWorld.staticRecords.clear();
    this.staticWorld.heightfieldRecords.clear();
    this.staticWorld.staticBlockerIndex.clear();
    this.staticWorld.staticSurfaceIndex.clear();
    this.staticWorld.nextStaticOrder = 0;
    this.invalidateStaticCaches();
    this.staticWorld.navigationDirty = "all";
    this.bodies = [];
    this.contacts = [];
    this.collisionDisabled.clear();
    this.suspendedDynamicBodies.clear();
    this.passThrough.clear();
    this.impactThresholds.clear();
    this.impactAccumulator.clear();
    this.frameImpacts = [];
    this.frameImpactsOverBudget = 0;
  }

  dispose(): void {
    this.clear();
    this.rapierWorld?.free();
    this.rapierWorld = null;
    this.rapierEventQueue?.free();
    this.rapierEventQueue = null;
    this.rapierBodies.clear();
    this.suspendedDynamicBodies.clear();
    this.rapierColliderToEntity.clear();
    this.vehiclePhysics.vehicles.clear();
  }

  private rebuildRapierWorld(): void {
    const RAPIER = this.rapierModule;
    if (!RAPIER) return;
    // Controllers die with the old world; the records re-attach below.
    for (const vehicle of this.vehiclePhysics.vehicles.values()) vehicle.controller = null;
    this.rapierWorld?.free();
    this.rapierWorld = new RAPIER.World(vectorFromVec3(this.gravity));
    this.rapierWorld.timestep = this.stepClock.step;
    // Auto-drained before every step, so events nobody reads never pile up.
    this.rapierEventQueue ??= new RAPIER.EventQueue(true);
    this.impactAccumulator.clear();
    this.stepClock.reset();
    this.previousPoses.clear();
    this.rapierBodies.clear();
    this.suspendedDynamicBodies.clear();
    this.rapierColliderToEntity.clear();

    for (const body of this.bodies) this.addRapierBody(body);
    for (const [entityId, vehicle] of this.vehiclePhysics.vehicles) {
      if (vehicle.controller) continue; // a component vehicle addRapierBody just built
      if (!this.vehiclePhysics.attachVehicleController(vehicle)) this.vehiclePhysics.vehicles.delete(entityId);
    }
  }

  private addRapierBody(body: PhysicsBody): void {
    const RAPIER = this.rapierModule;
    if (!RAPIER || !this.rapierWorld || this.rapierBodies.has(body.id)) return;
    const desc = rigidBodyDescForBody(RAPIER, body);
    desc.setTranslation(
      body.transform.position[0],
      body.transform.position[1],
      body.transform.position[2],
    );
    desc.setRotation(quaternionFromEulerDegrees(body.transform.rotation));
    const rigidBody = this.rapierWorld.createRigidBody(desc);
    const colliders = colliderDescsForBody(RAPIER, body).map((colliderDesc) =>
      this.rapierWorld!.createCollider(
        colliderDesc.setSensor(body.collider.isSensor),
        rigidBody,
      ),
    );
    this.rapierBodies.set(body.id, {
      id: body.id,
      body: rigidBody,
      colliders,
      isSensor: body.collider.isSensor,
    });
    for (const collider of colliders) this.rapierColliderToEntity.set(collider.handle, body.id);
    const record = this.rapierBodies.get(body.id);
    if (record && this.impactThresholds.has(body.id)) this.applyImpactEvents(record);
    if (body.vehicle && !this.vehiclePhysics.vehicles.has(body.id)) {
      const record: VehicleRecord = {
        entityId: body.id,
        definition: body.vehicle,
        source: "component",
        controller: null,
        input: NEUTRAL_VEHICLE_INPUT,
        steer: 0,
        drivetrain: initialVehicleDrivetrainState(body.vehicle),
        engineLoad: 0,
        sink: [],
        sinkLimits: [],
        tractionSlip: [],
        wheelSpinSpeed: [],
        wheelSpinRotation: [],
      };
      if (this.vehiclePhysics.attachVehicleController(record)) this.vehiclePhysics.vehicles.set(body.id, record);
    }
  }

  private updateRapierContacts(): void {
    if (!this.rapierWorld) return;
    const contacts: PhysicsContact[] = [];
    const seen = new Set<string>();
    for (const record of this.rapierBodies.values()) {
      if (this.suspendedDynamicBodies.has(record.id)) continue;
      // Rapier never pairs two fixed bodies, so a static solid's contacts are
      // all found from its moving partner; asking from the static crowd too cost
      // two WASM calls per collider per frame.
      if (!record.isSensor && this.bodiesById.get(record.id)?.collider.isStatic === true) continue;
      for (const collider of record.colliders) {
        this.rapierWorld.contactPairsWith(collider, (other) => {
          this.addRapierContact(contacts, seen, record, other);
        });
        this.rapierWorld.intersectionPairsWith(collider, (other) => {
          this.addRapierContact(contacts, seen, record, other);
        });
      }
    }
    this.addAabbSensorContacts(contacts, seen);
    this.contacts = this.reportableContacts(contacts);
  }

  /** Pushes the entity's impact opt-in onto its live colliders. */
  private applyImpactEvents(record: RapierBodyRecord): void {
    const RAPIER = this.rapierModule;
    if (!RAPIER) return;
    const owners = this.impactThresholds.get(record.id);
    const minImpulse = owners ? Math.min(...owners.values()) : undefined;
    for (const collider of record.colliders) {
      if (minImpulse === undefined) {
        collider.setActiveEvents(RAPIER.ActiveEvents.NONE);
        continue;
      }
      collider.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
      collider.setContactForceEventThreshold(impulseToForceThreshold(minImpulse, this.stepClock.step));
    }
  }

  /**
   * Turns the slice's contact-force events into impact samples. Rapier only
   * queued pairs above an opted-in collider's threshold; for each one the
   * manifolds give the point and normal (Faz 0, K-03 hybrid).
   */
  private collectImpactSamples(queue: RapierEventQueue): void {
    const world = this.rapierWorld;
    if (!world) return;
    const step = this.stepClock.step;
    queue.drainContactForceEvents((event) => {
      const handle1 = event.collider1();
      const handle2 = event.collider2();
      const a = this.rapierColliderToEntity.get(handle1);
      const b = this.rapierColliderToEntity.get(handle2);
      if (!a || !b || a === b) return;
      const collider1 = world.getCollider(handle1);
      const collider2 = world.getCollider(handle2);
      if (!collider1 || !collider2) return;
      const force = event.totalForce();
      const impulse = Math.hypot(force.x, force.y, force.z) * step;
      const points: ImpactContactPoint[] = [];
      const normalSum: [number, number, number] = [0, 0, 0];
      world.contactPair(collider1, collider2, (manifold, flipped) => {
        const solverCount = manifold.numSolverContacts();
        if (solverCount === 0) return;
        // Solver points are world-space but carry no impulse in the JS API, so
        // each manifold contributes its centroid weighted by its contacts' impulse.
        let weight = 0;
        for (let index = 0; index < manifold.numContacts(); index += 1) weight += manifold.contactImpulse(index);
        let x = 0;
        let y = 0;
        let z = 0;
        for (let index = 0; index < solverCount; index += 1) {
          const point = manifold.solverContactPoint(index);
          x += point.x;
          y += point.y;
          z += point.z;
        }
        points.push({ point: [x / solverCount, y / solverCount, z / solverCount], weight });
        const raw = manifold.normal();
        const normal = manifoldNormal([raw.x, raw.y, raw.z], flipped);
        const share = weight > 0 ? weight : 1e-6;
        normalSum[0] += normal[0] * share;
        normalSum[1] += normal[1] * share;
        normalSum[2] += normal[2] * share;
      });
      const normal = impactNormal(normalSum, force, impulse);
      this.impactAccumulator.add({
        a,
        b,
        impulse,
        normal,
        points,
        relativeSpeed: this.closingSpeedBeforeSlice(a, b, normal, impulse),
      });
    });
  }

  /**
   * Closing speed along `normal` (out of `a`) before the slice: the post-slice
   * relative velocity plus the velocity change the impulse caused, J·(1/mₐ + 1/m_b).
   * Linear only; an estimate for gameplay ("how fast did it hit"), not a solver value.
   */
  private closingSpeedBeforeSlice(a: EntityId, b: EntityId, normal: ImpactVec3, impulse: number): number {
    const bodyA = this.rapierBodies.get(a)?.body;
    const bodyB = this.rapierBodies.get(b)?.body;
    const velocityA = bodyA?.linvel() ?? { x: 0, y: 0, z: 0 };
    const velocityB = bodyB?.linvel() ?? { x: 0, y: 0, z: 0 };
    const after = (velocityA.x - velocityB.x) * normal[0]
      + (velocityA.y - velocityB.y) * normal[1]
      + (velocityA.z - velocityB.z) * normal[2];
    const inverseMass = (body: RapierRigidBody | undefined): number =>
      body?.isDynamic() && body.mass() > 0 ? 1 / body.mass() : 0;
    return Math.max(0, after + impulse * (inverseMass(bodyA) + inverseMass(bodyB)));
  }

  private hasDynamicActiveArea(): boolean {
    const { activeDistance, focusPosition } = this.dynamicActiveArea;
    return (
      typeof activeDistance === "number" &&
      Number.isFinite(activeDistance) &&
      activeDistance > 0 &&
      focusPosition !== undefined
    );
  }

  private updateDynamicActiveArea(): void {
    if (!this.hasDynamicActiveArea()) {
      this.resumeSuspendedDynamicBodies();
      return;
    }

    const focus = this.dynamicActiveArea.focusPosition?.() ?? null;
    if (!focus) {
      this.resumeSuspendedDynamicBodies();
      return;
    }

    const activeDistance = this.dynamicActiveArea.activeDistance;
    if (activeDistance === undefined) return;

    for (const [entityId, rapier] of this.rapierBodies) {
      const body = this.bodiesById.get(entityId);
      if (!body?.collider.simulatePhysics) continue;

      const translation = rapier.body.translation();
      const outsideActiveArea = isOutsideDynamicActiveArea(
        [translation.x, translation.y, translation.z],
        focus,
        activeDistance,
      );
      const suspended = this.suspendedDynamicBodies.get(entityId);

      if (outsideActiveArea && !suspended) {
        const linearVelocity = rapier.body.linvel();
        const angularVelocity = rapier.body.angvel();
        this.suspendedDynamicBodies.set(entityId, {
          linearVelocity: [linearVelocity.x, linearVelocity.y, linearVelocity.z],
          angularVelocity: [angularVelocity.x, angularVelocity.y, angularVelocity.z],
        });
        rapier.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
        rapier.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
        rapier.body.sleep();
        this.previousPoses.delete(entityId);
      } else if (!outsideActiveArea && suspended) {
        rapier.body.setLinvel(
          {
            x: suspended.linearVelocity[0],
            y: suspended.linearVelocity[1],
            z: suspended.linearVelocity[2],
          },
          true,
        );
        rapier.body.setAngvel(
          {
            x: suspended.angularVelocity[0],
            y: suspended.angularVelocity[1],
            z: suspended.angularVelocity[2],
          },
          true,
        );
        rapier.body.wakeUp();
        this.suspendedDynamicBodies.delete(entityId);
      }
    }
  }

  private resumeSuspendedDynamicBodies(): void {
    for (const [entityId, suspended] of this.suspendedDynamicBodies) {
      const rapier = this.rapierBodies.get(entityId);
      if (!rapier) continue;
      rapier.body.setLinvel(
        {
          x: suspended.linearVelocity[0],
          y: suspended.linearVelocity[1],
          z: suspended.linearVelocity[2],
        },
        true,
      );
      rapier.body.setAngvel(
        {
          x: suspended.angularVelocity[0],
          y: suspended.angularVelocity[1],
          z: suspended.angularVelocity[2],
        },
        true,
      );
      rapier.body.wakeUp();
    }
    this.suspendedDynamicBodies.clear();
  }

  private addAabbSensorContacts(contacts: PhysicsContact[], seen: Set<string>): void {
    const sensors: number[] = [];
    for (let index = 0; index < this.bodies.length; index += 1) {
      if (this.bodies[index]?.collider.isSensor) sensors.push(index);
    }
    if (sensors.length === 0) return;
    // Only pairs with a sensor report, so visit sensors × bodies rather than all
    // pairs (O(N²) per frame with a level's static crowd), then restore the
    // all-pairs (i, j) order so contact orientation and order are unchanged.
    const isSensor = new Set(sensors);
    const pairs: [number, number][] = [];
    for (const sensor of sensors) {
      for (let other = 0; other < this.bodies.length; other += 1) {
        // A sensor-sensor pair is visited once, from its lower sensor.
        if (other === sensor || (other < sensor && isSensor.has(other))) continue;
        const i = Math.min(sensor, other);
        const j = Math.max(sensor, other);
        const a = this.bodies[i];
        const b = this.bodies[j];
        if (!a || !b) continue;
        if (a.collider.isStatic && b.collider.isStatic) continue;
        if (this.collisionDisabled.has(a.id) || this.collisionDisabled.has(b.id)) continue;
        if (this.suspendedDynamicBodies.has(a.id) || this.suspendedDynamicBodies.has(b.id)) continue;
        if (!interactionGroupsInteract(a.collider.collisionGroups, b.collider.collisionGroups)) {
          continue;
        }
        if (!aabbOverlaps(bodyAabb(a), bodyAabb(b))) continue;
        pairs.push([i, j]);
      }
    }
    pairs.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
    for (const [i, j] of pairs) {
      const a = this.bodies[i]!;
      const b = this.bodies[j]!;
      const key = contactKey(a.id, b.id);
      if (seen.has(key)) continue;
      seen.add(key);
      contacts.push({
        a: a.id,
        b: b.id,
        isSensor: true,
      });
    }
  }

  /** Records every live dynamic body's pose right before the frame's last slice. */
  private capturePreviousPoses(): void {
    if (!this.transformSink) return;
    for (const [entityId, rapier] of this.rapierBodies.entries()) {
      if (this.suspendedDynamicBodies.has(entityId)) continue;
      const body = this.bodiesById.get(entityId);
      if (!body?.collider.simulatePhysics) continue;
      const translation = rapier.body.translation();
      const rotation = rapier.body.rotation();
      this.previousPoses.set(entityId, {
        position: [translation.x, translation.y, translation.z],
        rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
      });
    }
  }

  /**
   * Sends each dynamic body's render pose to the sink, blended between the
   * previous and latest slice by the step clock's leftover. The sink only feeds
   * rendering, so the blend never leaks into the simulation; `body.transform`
   * (sensor AABBs) keeps the true simulated pose.
   */
  private syncRapierDynamicTransforms(): void {
    if (!this.transformSink) return;
    const alpha = this.stepClock.alpha;
    for (const [entityId, rapier] of this.rapierBodies.entries()) {
      const body = this.bodiesById.get(entityId);
      if (!body?.collider.simulatePhysics) continue;
      if (this.suspendedDynamicBodies.has(entityId)) continue;
      const translation = rapier.body.translation();
      const rotation = rapier.body.rotation();
      const position: Vec3 = [translation.x, translation.y, translation.z];
      body.transform = {
        position,
        rotation: eulerDegreesFromQuaternion(rotation),
        scale: [...body.transform.scale],
      };
      const previous = this.previousPoses.get(entityId);
      const transform: TransformComponent = previous
        ? {
            position: lerpPosition(previous.position, position, alpha),
            rotation: eulerDegreesFromQuaternion(nlerpQuaternion(previous.rotation, rotation, alpha)),
            scale: [...body.transform.scale],
          }
        : cloneTransform(body.transform);
      this.transformSink(entityId, transform);
    }
  }

  private addRapierContact(
    contacts: PhysicsContact[],
    seen: Set<string>,
    a: RapierBodyRecord,
    bCollider: RapierCollider,
  ): void {
    const bId = this.rapierColliderToEntity.get(bCollider.handle);
    if (!bId || bId === a.id) return;
    const b = this.rapierBodies.get(bId);
    if (!b) return;
    if (this.suspendedDynamicBodies.has(a.id) || this.suspendedDynamicBodies.has(b.id)) return;
    const [left, right] = a.id < b.id ? [a, b] : [b, a];
    const key = contactKey(left.id, right.id);
    if (seen.has(key)) return;
    seen.add(key);
    contacts.push({
      a: left.id,
      b: right.id,
      isSensor: left.isSensor || right.isSensor,
    });
  }
  /** See {@link StaticWorld.staticBlockerAabbs}. */
  staticBlockerAabbs(): readonly PhysicsAabb[] {
    return this.staticWorld.staticBlockerAabbs();
  }

  /** See {@link StaticWorld.staticSurfaceTriangles}. */
  staticSurfaceTriangles(): readonly PhysicsSurfaceTriangle[] {
    return this.staticWorld.staticSurfaceTriangles();
  }

  /** See {@link StaticWorld.staticSurfaceTrianglesNear}. */
  staticSurfaceTrianglesNear(x: number, z: number): readonly PhysicsSurfaceTriangle[] {
    return this.staticWorld.staticSurfaceTrianglesNear(x, z);
  }

  /** See {@link StaticWorld.staticBlockerAabbsNear}. */
  staticBlockerAabbsNear(x: number, z: number, radius: number): readonly PhysicsAabb[] {
    return this.staticWorld.staticBlockerAabbsNear(x, z, radius);
  }

  /** See {@link StaticWorld.hasStaticGround}. */
  hasStaticGround(): boolean {
    return this.staticWorld.hasStaticGround();
  }

  /** See {@link StaticWorld.staticQueryDebug}. */
  staticQueryDebug(): { invalidations: number; recordBuilds: number; blockerCandidatesInspected: number } {
    return this.staticWorld.staticQueryDebug();
  }

  /** See {@link StaticWorld.staticNavigationBlockerAabbs}. */
  staticNavigationBlockerAabbs(): readonly PhysicsAabb[] {
    return this.staticWorld.staticNavigationBlockerAabbs();
  }

  /** See {@link StaticWorld.staticNavigationSurfaceTriangles}. */
  staticNavigationSurfaceTriangles(includeHeightfields = true): readonly PhysicsSurfaceTriangle[] {
    return this.staticWorld.staticNavigationSurfaceTriangles(includeHeightfields);
  }

  /** See {@link StaticWorld.forEachNavigationTriangleInRect}. */
  forEachNavigationTriangleInRect(minX: number, minZ: number, maxX: number, maxZ: number, visit: NavigationTriangleVisitor): void {
    return this.staticWorld.forEachNavigationTriangleInRect(minX, minZ, maxX, maxZ, visit);
  }

  /** See {@link StaticWorld.takeNavigationDirtyRegions}. */
  takeNavigationDirtyRegions(): readonly NavigationRect[] | "all" {
    return this.staticWorld.takeNavigationDirtyRegions();
  }

  /** See {@link StaticWorld.forEachNavigationObstacleInRect}. */
  forEachNavigationObstacleInRect(minX: number, minZ: number, maxX: number, maxZ: number, visit: NavigationObstacleVisitor): void {
    return this.staticWorld.forEachNavigationObstacleInRect(minX, minZ, maxX, maxZ, visit);
  }

  /** See {@link StaticWorld.staticNavigationSurfaceSamplesAt}. */
  staticNavigationSurfaceSamplesAt(x: number, z: number): readonly GroundSurfaceSample[] {
    return this.staticWorld.staticNavigationSurfaceSamplesAt(x, z);
  }

  /** See {@link VehiclePhysics.setVehicleSurfaceProvider}. */
  setVehicleSurfaceProvider(provider: VehicleSurfaceProvider | null): void {
    return this.vehiclePhysics.setVehicleSurfaceProvider(provider);
  }

  /** See {@link VehiclePhysics.setVehicleGroundSinkProvider}. */
  setVehicleGroundSinkProvider(provider: VehicleGroundSinkProvider | null): void {
    return this.vehiclePhysics.setVehicleGroundSinkProvider(provider);
  }

  /** See {@link VehiclePhysics.createVehicle}. */
  createVehicle(entityId: EntityId, definition: VehicleDefinition): boolean {
    return this.vehiclePhysics.createVehicle(entityId, definition);
  }

  /** See {@link VehiclePhysics.removeVehicle}. */
  removeVehicle(entityId: EntityId): void {
    return this.vehiclePhysics.removeVehicle(entityId);
  }

  /** See {@link VehiclePhysics.hasVehicle}. */
  hasVehicle(entityId: EntityId): boolean {
    return this.vehiclePhysics.hasVehicle(entityId);
  }

  /** See {@link VehiclePhysics.resetVehicle}. */
  resetVehicle(entityId: EntityId, transform: TransformComponent): void {
    return this.vehiclePhysics.resetVehicle(entityId, transform);
  }

  /** See {@link VehiclePhysics.vehicleDefinition}. */
  vehicleDefinition(entityId: EntityId): VehicleDefinition | null {
    return this.vehiclePhysics.vehicleDefinition(entityId);
  }

  /** See {@link VehiclePhysics.vehicleMotion}. */
  vehicleMotion(entityId: EntityId): VehicleMotionState | null {
    return this.vehiclePhysics.vehicleMotion(entityId);
  }

  /** See {@link VehiclePhysics.restoreVehicle}. */
  restoreVehicle(entityId: EntityId, transform: TransformComponent, motion: VehicleMotionState): boolean {
    return this.vehiclePhysics.restoreVehicle(entityId, transform, motion);
  }

  /** See {@link VehiclePhysics.vehicleEntityIds}. */
  vehicleEntityIds(): EntityId[] {
    return this.vehiclePhysics.vehicleEntityIds();
  }

  /** See {@link VehiclePhysics.setVehicleInput}. */
  setVehicleInput(entityId: EntityId, input: VehicleInput): void {
    return this.vehiclePhysics.setVehicleInput(entityId, input);
  }

  /** See {@link VehiclePhysics.vehicleState}. */
  vehicleState(entityId: EntityId): VehicleState | null {
    return this.vehiclePhysics.vehicleState(entityId);
  }
}

// Public names Forge exported from this file, now defined beside it.
export { PHYSICS_SUBSYSTEM_ID, type PhysicsBackend, type PhysicsTransformSink, type PhysicsSubsystemOptions, type DynamicPhysicsActiveAreaSettings } from "./physicsTypes.ts";
export { isOutsideDynamicActiveArea } from "./physicsBodies.ts";
