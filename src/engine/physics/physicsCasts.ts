import type { Vec3, Vec4 } from "../../core/index.ts";
import { add, normalize, rotate, scale } from "../math/affine.ts";
import type { RapierCollider, RapierModule, RapierWorld } from "./physicsTypes.ts";

export interface CastFilter {
  readonly includeSensors?: boolean;
  readonly groups?: number;
}

export interface RayCast {
  readonly origin: Readonly<Vec3>;
  readonly direction: Readonly<Vec3>;
  readonly distance: number;
}

export type CastShape =
  | { readonly kind: "sphere"; readonly radius: number }
  | { readonly kind: "capsule"; readonly radius: number; readonly halfHeight: number }
  | { readonly kind: "box"; readonly halfExtents: Readonly<Vec3> };

export interface ShapeCast extends RayCast {
  readonly shape: CastShape;
  readonly rotation?: Readonly<Vec4>;
}

export interface CastHit {
  readonly distance: number;
  readonly point: Readonly<Vec3>;
  readonly normal: Readonly<Vec3>;
}

interface BodyHit extends CastHit {
  readonly body: string;
}

const zero = { x: 0, y: 0, z: 0 };
const identity = { ...zero, w: 1 };
const vector = ([x, y, z]: Readonly<Vec3>) => ({ x, y, z });
const tuple = ({ x, y, z }: { x: number; y: number; z: number }): Vec3 => [x, y, z];

function castDirection(query: RayCast): Vec3 | null {
  if (!Number.isFinite(query.distance) || query.distance < 0 ||
      !query.origin.every(Number.isFinite) || !query.direction.every(Number.isFinite)) return null;
  const direction = normalize(query.direction);
  return direction.some((value) => value !== 0) ? direction : null;
}

function shapeFor(rapier: RapierModule, shape: CastShape) {
  if (shape.kind === "box") {
    return shape.halfExtents.every((value) => Number.isFinite(value) && value > 0)
      ? new rapier.Cuboid(...shape.halfExtents)
      : null;
  }
  if (!Number.isFinite(shape.radius) || shape.radius <= 0) return null;
  if (shape.kind === "sphere") return new rapier.Ball(shape.radius);
  return Number.isFinite(shape.halfHeight) && shape.halfHeight >= 0
    ? new rapier.Capsule(shape.halfHeight, shape.radius)
    : null;
}

function allows(collider: RapierCollider, filter: CastFilter): boolean {
  if (!collider.isEnabled() || (!filter.includeSensors && collider.isSensor())) return false;
  if (filter.groups === undefined) return true;
  const groups = collider.collisionGroups();
  return ((groups >>> 16) & filter.groups) !== 0 && ((filter.groups >>> 16) & groups) !== 0;
}

/** Rapier's broad phase sees changes at the next physics slice. Check recently
 * added and moved colliders directly so spawn, cell activation and teleports
 * are queryable on the same World hook without stepping the simulation. */
export class PhysicsCasts {
  private source: { rapier: RapierModule; world: RapierWorld; bodyFor(handle: number): string | undefined } | null = null;
  private readonly changedColliders = new Map<number, RapierCollider>();

  attach(rapier: RapierModule, world: RapierWorld, bodyFor: (handle: number) => string | undefined): void {
    this.detach();
    this.source = { rapier, world, bodyFor };
  }

  detach(): void {
    this.changedColliders.clear();
    this.source = null;
  }

  changed(collider: RapierCollider): void { this.changedColliders.set(collider.handle, collider); }
  removed(collider: RapierCollider): void { this.changedColliders.delete(collider.handle); }
  stepped(): void { this.changedColliders.clear(); }

  ray(query: RayCast, filter: CastFilter, accept: (body: string) => boolean): BodyHit | null {
    const source = this.source;
    const direction = castDirection(query);
    if (!source || !direction) return null;
    const ray = new source.rapier.Ray(vector(query.origin), vector(direction));
    const indexed = source.world.castRayAndGetNormal(ray, query.distance, true, undefined, filter.groups,
      undefined, undefined, (collider) => !this.changedColliders.has(collider.handle) && this.eligible(collider, filter, accept));
    let handle = indexed?.collider.handle;
    let distance = indexed?.timeOfImpact ?? query.distance;
    let normal = indexed?.normal;
    for (const collider of this.changedColliders.values()) {
      if (!this.eligible(collider, filter, accept)) continue;
      const hit = collider.castRayAndGetNormal(ray, distance, true);
      if (!hit || hit.timeOfImpact > distance) continue;
      handle = collider.handle;
      distance = hit.timeOfImpact;
      normal = hit.normal;
    }
    const body = handle === undefined ? undefined : source.bodyFor(handle);
    return body === undefined || !normal ? null : {
      body, distance, point: add(query.origin, scale(direction, distance)), normal: tuple(normal),
    };
  }

  shape(query: ShapeCast, filter: CastFilter, accept: (body: string) => boolean): BodyHit | null {
    const source = this.source;
    const direction = castDirection(query);
    if (!source || !direction) return null;
    const shape = shapeFor(source.rapier, query.shape);
    if (!shape) return null;
    const origin = vector(query.origin);
    const velocity = vector(direction);
    const [x, y, z, w] = query.rotation ?? [0, 0, 0, 1];
    const norm = Math.hypot(x, y, z, w);
    if (!Number.isFinite(norm) || norm === 0) return null;
    const rotation = query.rotation ? { x: x / norm, y: y / norm, z: z / norm, w: w / norm } : identity;
    const indexed = source.world.castShape(origin, rotation, velocity, shape, 0, query.distance, true, undefined, filter.groups,
      undefined, undefined, (collider) => !this.changedColliders.has(collider.handle) && this.eligible(collider, filter, accept));
    let handle = indexed?.collider.handle;
    let distance = indexed?.time_of_impact ?? query.distance;
    let point = indexed && tuple(indexed.witness1);
    let normal = indexed && tuple(indexed.normal1);
    for (const collider of this.changedColliders.values()) {
      if (!this.eligible(collider, filter, accept)) continue;
      const hit = collider.castShape(zero, shape, origin, rotation, velocity, 0, distance, true);
      if (!hit || hit.time_of_impact > distance) continue;
      const pose = collider.rotation();
      const quaternion: Vec4 = [pose.x, pose.y, pose.z, pose.w];
      handle = collider.handle;
      distance = hit.time_of_impact;
      point = add(tuple(collider.translation()), rotate(quaternion, tuple(hit.witness1)));
      normal = rotate(quaternion, tuple(hit.normal1));
    }
    const body = handle === undefined ? undefined : source.bodyFor(handle);
    return body === undefined || !point || !normal ? null : { body, distance, point, normal };
  }

  private eligible(collider: RapierCollider, filter: CastFilter, accept: (body: string) => boolean): boolean {
    const body = this.source?.bodyFor(collider.handle);
    return body !== undefined && allows(collider, filter) && accept(body);
  }
}
