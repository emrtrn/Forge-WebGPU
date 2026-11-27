import { createServiceKey, type ActorId, type Vec3 } from "../../core/index.ts";
import type { ColliderPrimitive } from "./colliderTypes.ts";
import type { CastFilter, CastHit, RayCast, ShapeCast } from "./physicsCasts.ts";
import type { PhysicsSubsystem } from "./physicsSubsystem.ts";
import type { RapierModule } from "./physicsTypes.ts";
import type { PhysicsContact } from "./physicsQuery.ts";
import type { PhysicsImpact } from "./impactEvents.ts";
import type { CollisionObjectChannel, CollisionTraceChannel } from "./collision.ts";

export interface PhysicsHit extends CastHit {
  readonly actor: ActorId;
  readonly component: string;
  readonly physicalMaterial: string | null;
}

export interface PhysicsCastFilter extends CastFilter {
  readonly ignore?: readonly ActorId[];
  readonly channel?: CollisionTraceChannel;
  /** Only solid bodies that block this object channel, including physics-only bodies. */
  readonly physicalChannel?: CollisionObjectChannel;
}

export interface PhysicsService {
  castRay(query: RayCast, filter?: PhysicsCastFilter): PhysicsHit | null;
  castShape(query: ShapeCast, filter?: PhysicsCastFilter): PhysicsHit | null;
  applyImpulse(actor: ActorId, impulse: Readonly<Vec3>): void;
  /** Switches an actor's live collision. A persistent toggle is included in checkpoints. */
  setCollisionEnabled(actor: ActorId, enabled: boolean, options?: { readonly persist?: boolean }): boolean;
}

export const PhysicsServiceKey = createServiceKey<PhysicsService>("forge.physics");
export const WORLD_PHYSICS_ID = "forge.physics";

interface ModelCollision {
  readonly bounds: { readonly min: Readonly<Vec3>; readonly max: Readonly<Vec3> } | null;
  readonly settings: unknown;
}

export type ModelCollisionSource = (asset: string) => ModelCollision | null;

export interface CollisionTriangleMesh {
  readonly positions: ArrayLike<number>;
  readonly indices: ArrayLike<number>;
}

export type ModelCollisionGeometry = (asset: string) => Promise<readonly CollisionTriangleMesh[]>;

/** Boot inputs, installed before feature creation. */
export const PreparedPhysicsKey = createServiceKey<{
  readonly rapier: RapierModule;
  readonly model?: ModelCollisionSource;
  readonly triangles?: ModelCollisionGeometry;
}>("forge.physics.prepared");

/** Geometry from other features, registered and removed on the owning World. */
export interface StaticCollisionSource {
  add(id: string, actor: ActorId, component: string, position: Vec3, primitive: ColliderPrimitive, physicalMaterial?: string): void;
  remove(ids: readonly string[]): void;
  ray(query: RayCast, accept: (id: string) => boolean): CastHit | null;
}

export const StaticCollisionSourceKey = createServiceKey<StaticCollisionSource>("forge.physics.static");
export const PhysicsRuntimeKey = createServiceKey<{
  readonly physics: PhysicsSubsystem;
  owner(body: string): ActorId | undefined;
  ids(actor: ActorId): Iterable<string>;
  contacts(): readonly PhysicsContact[];
  impacts(): readonly PhysicsImpact[];
  ready(): Promise<void>;
}>("forge.physics.runtime");
