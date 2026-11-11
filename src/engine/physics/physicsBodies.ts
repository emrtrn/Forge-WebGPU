// Ported from Forge WebGL engine/physics/physicsSubsystem.ts (body, collider and math helpers) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// Forge's PhysicsSubsystem was one 2,817-line file; this repo's budget stops at
// 1,500, so it is split into physicsSubsystem / staticWorld / vehiclePhysics /
// physicsBodies / physicsTypes with method bodies unchanged. The ragdoll is not
// ported (plan K12).
import { classifyStaticTriangle } from "./staticTriangles.ts";
import { readColliderComponent, readTransformComponent, VEHICLE_COMPONENT, type ColliderComponent, type ColliderPrimitive, type TransformComponent } from "../legacy/components.ts";
import { type NavigationRole } from "./collision.ts";
import { rotatePointAboutOrigin, rotatedBoxAabb, rotatedBoxFootprintXZ } from "./rotatedBox.ts";
import { type ImpactVec3 } from "./impactEvents.ts";
import { vehicleDefinitionFromComponent, type VehicleVec3 } from "./vehicle/vehicleTypes.ts";
import type { Entity, EntityId } from "../legacy/entity.ts";
import type { PhysicsSurfaceTriangle } from "./physicsQuery.ts";
import type { Vec3 } from "../legacy/layout.ts";
import { DEFAULT_FRICTION, DEFAULT_RESTITUTION, type PhysicsBody, type Aabb, type RapierModule, type RapierRigidBody } from "./physicsTypes.ts";

/**
 * The slice's impact normal out of collider1: the manifolds' weighted normal,
 * or — when the pair separated within the slice and left no manifold — the
 * contact force direction, which Rapier applies to collider2 along the normal.
 */
export function impactNormal(
  normalSum: readonly [number, number, number],
  force: { x: number; y: number; z: number },
  impulse: number,
): ImpactVec3 {
  const length = Math.hypot(normalSum[0], normalSum[1], normalSum[2]);
  if (length > 1e-9) return [normalSum[0] / length, normalSum[1] / length, normalSum[2] / length];
  if (impulse > 0) {
    const forceLength = Math.hypot(force.x, force.y, force.z);
    if (forceLength > 0) return [force.x / forceLength, force.y / forceLength, force.z / forceLength];
  }
  return [0, 1, 0];
}

/** Inverse point mass n·M⁻¹n + (r×n)·I⁻¹(r×n), including locked axes. */
export function pointInverseMass(body: RapierRigidBody, point: { x: number; y: number; z: number }, n: { x: number; y: number; z: number }): number {
  if (!body.isDynamic()) return 0;
  const centre = body.worldCom();
  const r = { x: point.x - centre.x, y: point.y - centre.y, z: point.z - centre.z };
  const c = { x: r.y * n.z - r.z * n.y, y: r.z * n.x - r.x * n.z, z: r.x * n.y - r.y * n.x };
  const m = body.effectiveInvMass();
  const i = body.effectiveWorldInvInertia();
  return n.x * n.x * m.x + n.y * n.y * m.y + n.z * n.z * m.z
    + c.x * (i.m11 * c.x + i.m12 * c.y + i.m13 * c.z)
    + c.y * (i.m21 * c.x + i.m22 * c.y + i.m23 * c.z)
    + c.z * (i.m31 * c.x + i.m32 * c.y + i.m33 * c.z);
}

/** Signed linear speed along the body's local +Z (Forge's model forward). */
export function chassisForwardSpeed(body: RapierRigidBody): number {
  const q = body.rotation();
  // Local +Z rotated into world space (third column of the rotation matrix).
  const forward: VehicleVec3 = [
    2 * (q.x * q.z + q.w * q.y),
    2 * (q.y * q.z - q.w * q.x),
    1 - 2 * (q.x * q.x + q.y * q.y),
  ];
  const v = body.linvel();
  return v.x * forward[0] + v.y * forward[1] + v.z * forward[2];
}

export function contactKey(a: EntityId, b: EntityId): string {
  return a < b ? `${a}\n${b}` : `${b}\n${a}`;
}

/** Pure distance check used by the optional dynamic-physics active-area policy. */
export function isOutsideDynamicActiveArea(
  position: readonly [number, number, number],
  focus: readonly [number, number, number],
  activeDistance: number,
): boolean {
  if (
    !Number.isFinite(activeDistance) ||
    activeDistance <= 0 ||
    !position.every(Number.isFinite) ||
    !focus.every(Number.isFinite)
  ) {
    return false;
  }
  const dx = position[0] - focus[0];
  const dy = position[1] - focus[1];
  const dz = position[2] - focus[2];
  return dx * dx + dy * dy + dz * dz > activeDistance * activeDistance;
}

/** Lowest body-local Y of a chassis collider (its primitives' AABBs when compound). */
/** Below this forward speed (m/s) a wheel is standing for rut steering: no ground "ahead" to read. */
export const RUT_STEERING_MIN_SPEED = 0.3;

export function chassisBottomY(collider: PhysicsBody["collider"]): number {
  const boxes = collider.primitives && collider.primitives.length > 0 ? collider.primitives : [collider];
  return Math.min(...boxes.map((box) => (box.center?.[1] ?? 0) - (box.size[1] ?? 0) / 2));
}

export function bodyAabb(body: PhysicsBody): Aabb {
  // `size`/`center` are body-local (placement scale baked at scene-build); the
  // body's Euler rotation is applied here so a rotated collider's world AABB
  // tracks the rendered mesh / Rapier collider instead of staying axis-aligned.
  const half: Vec3 = [
    (body.collider.size[0] ?? 0) / 2,
    (body.collider.size[1] ?? 0) / 2,
    (body.collider.size[2] ?? 0) / 2,
  ];
  const center = body.collider.center ?? [0, 0, 0];
  const origin = body.transform.position as Vec3;
  const rotation = body.transform.rotation as Vec3;
  const aabb = rotatedBoxAabb(origin, center as Vec3, half, rotation);
  const role = body.collider.navigationRole;
  const base: Aabb = role ? { ...aabb, navigationRole: role } : aabb;
  // The auto/box collider is a box, so its oriented ground silhouette is exact —
  // give navigation the tight footprint instead of the bloated enclosing AABB.
  const footprint = rotatedBoxFootprintXZ(origin, center as Vec3, half, rotation);
  return footprint ? { ...base, footprint } : base;
}

/**
 * Appends one or more movement-blocker AABBs for a static body. Plain colliders
 * yield their single body AABB; compound colliders yield one per primitive; a
 * `trimesh` primitive yields one per triangle. The body's placement rotation (and
 * a primitive's own local rotation) is baked into the world AABB via
 * `rotatedBoxAabb`, so a rotated corner-pivoted wall lands where it is drawn.
 */
export function appendBlockerAabbs(out: Aabb[], body: PhysicsBody): void {
  const primitives = body.collider.primitives;
  const rotation = body.transform.rotation as Vec3;
  if (!primitives || primitives.length === 0) {
    out.push(bodyAabb(body));
    return;
  }
  const origin = body.transform.position as Vec3;
  for (const primitive of primitives) {
    if (
      primitive.shape === "trimesh" &&
      primitive.vertices &&
      primitive.vertices.length >= 3 &&
      primitive.indices &&
      primitive.indices.length >= 3
    ) {
      appendTriangleAabbs(
        out,
        origin,
        rotation,
        primitive.vertices,
        primitive.indices,
        body.collider.navigationRole,
      );
    } else if (primitive.shape === "heightfield" && primitive.heightfield) {
      // Its triangles are added by `recordStaticBody`, after the other primitives.
      continue;
    } else {
      out.push(primitiveAabb(origin, rotation, primitive, body.collider.navigationRole));
    }
  }
}

/** World AABB of a single non-trimesh primitive, honouring body + primitive rotation. */
export function primitiveAabb(
  origin: Vec3,
  bodyRotation: Vec3,
  primitive: ColliderPrimitive,
  navigationRole: NavigationRole | undefined,
): Aabb {
  const center = (primitive.center ?? [0, 0, 0]) as Vec3;
  const half: Vec3 = [primitive.size[0] / 2, primitive.size[1] / 2, primitive.size[2] / 2];
  const aabb = rotatedBoxAabb(origin, center, half, bodyRotation, primitive.rotation);
  const base: Aabb = navigationRole ? { ...aabb, navigationRole } : aabb;
  // Only a box primitive's oriented footprint equals its projected corners; other
  // authored shapes (sphere/capsule/cylinder/cone) keep the AABB, matching how
  // this function already models them as boxes for the enclosing AABB.
  if (primitive.shape !== "box") return base;
  const footprint = rotatedBoxFootprintXZ(origin, center, half, bodyRotation, primitive.rotation);
  return footprint ? { ...base, footprint } : base;
}

/** Invokes `visit` with each trimesh triangle's world-space vertices (rotation baked). */
export function forEachWorldTriangle(
  origin: Vec3,
  bodyRotation: Vec3,
  vertices: readonly Vec3[],
  indices: readonly number[],
  visit: (wa: Vec3, wb: Vec3, wc: Vec3) => void,
): void {
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = vertices[indices[t]!];
    const b = vertices[indices[t + 1]!];
    const c = vertices[indices[t + 2]!];
    if (!a || !b || !c) continue;
    visit(
      rotatePointAboutOrigin(origin, a, bodyRotation),
      rotatePointAboutOrigin(origin, b, bodyRotation),
      rotatePointAboutOrigin(origin, c, bodyRotation),
    );
  }
}

/** One AABB per *wall* triangle of a trimesh (flat/walkable triangles are surfaces, not blockers). */
export function appendTriangleAabbs(
  out: Aabb[],
  origin: Vec3,
  bodyRotation: Vec3,
  vertices: readonly Vec3[],
  indices: readonly number[],
  navigationRole: NavigationRole | undefined,
): void {
  forEachWorldTriangle(origin, bodyRotation, vertices, indices, (wa, wb, wc) => {
    const classified = classifyStaticTriangle(wa, wb, wc, navigationRole);
    if ("blocker" in classified) out.push(classified.blocker as Aabb);
  });
}

/** Appends walkable surface triangles for a body's trimesh primitives (world-space + normalY). */
export function appendSurfaceTriangles(out: PhysicsSurfaceTriangle[], body: PhysicsBody): void {
  const primitives = body.collider.primitives;
  if (!primitives || primitives.length === 0) return;
  const origin = body.transform.position as Vec3;
  const rotation = body.transform.rotation as Vec3;
  for (const primitive of primitives) {
    if (
      primitive.shape !== "trimesh" ||
      !primitive.vertices ||
      primitive.vertices.length < 3 ||
      !primitive.indices ||
      primitive.indices.length < 3
    ) {
      continue;
    }
    forEachWorldTriangle(origin, rotation, primitive.vertices, primitive.indices, (wa, wb, wc) => {
      const classified = classifyStaticTriangle(wa, wb, wc, undefined);
      if ("surface" in classified) out.push(classified.surface);
    });
  }
}

export function aabbOverlaps(a: Aabb, b: Aabb): boolean {
  return (
    a.min[0] <= b.max[0] &&
    a.max[0] >= b.min[0] &&
    a.min[1] <= b.max[1] &&
    a.max[1] >= b.min[1] &&
    a.min[2] <= b.max[2] &&
    a.max[2] >= b.min[2]
  );
}

export function cloneTransform(transform: TransformComponent): TransformComponent {
  return {
    position: [...transform.position],
    rotation: [...transform.rotation],
    scale: [...transform.scale],
  };
}

export function bodyFromEntity(entity: Entity): PhysicsBody | null {
  const transform = readTransformComponent(entity);
  const collider = readColliderComponent(entity);
  if (!transform || !collider) return null;
  const body: PhysicsBody = {
    id: entity.id,
    transform: cloneTransform(transform),
    collider: cloneCollider(collider),
  };
  const vehicle = vehicleDefinitionFromComponent(entity.components[VEHICLE_COMPONENT]);
  if (vehicle) body.vehicle = vehicle;
  return body;
}

export function cloneCollider(collider: ColliderComponent): ColliderComponent {
  const clone: ColliderComponent = {
    shape: collider.shape,
    size: [...collider.size],
    isStatic: collider.isStatic,
    isSensor: collider.isSensor,
  };
  if (collider.center) clone.center = [...collider.center];
  if (collider.primitives) clone.primitives = collider.primitives.map(clonePrimitive);
  if (collider.friction !== undefined) clone.friction = collider.friction;
  if (collider.physicalMaterialId !== undefined) clone.physicalMaterialId = collider.physicalMaterialId;
  if (collider.restitution !== undefined) clone.restitution = collider.restitution;
  if (collider.navigationRole !== undefined) clone.navigationRole = collider.navigationRole;
  if (collider.generateOverlapEvents !== undefined) {
    clone.generateOverlapEvents = collider.generateOverlapEvents;
  }
  if (collider.simulationGeneratesHitEvents !== undefined) {
    clone.simulationGeneratesHitEvents = collider.simulationGeneratesHitEvents;
  }
  if (collider.collisionGroups !== undefined) clone.collisionGroups = collider.collisionGroups;
  if (collider.ignoreCameraTrace !== undefined) clone.ignoreCameraTrace = collider.ignoreCameraTrace;
  if (collider.simulatePhysics !== undefined) clone.simulatePhysics = collider.simulatePhysics;
  if (collider.massKg !== undefined) clone.massKg = collider.massKg;
  if (collider.linearDamping !== undefined) clone.linearDamping = collider.linearDamping;
  if (collider.angularDamping !== undefined) clone.angularDamping = collider.angularDamping;
  if (collider.enableGravity !== undefined) clone.enableGravity = collider.enableGravity;
  if (collider.lockPosition !== undefined) clone.lockPosition = [...collider.lockPosition];
  if (collider.lockRotation !== undefined) clone.lockRotation = [...collider.lockRotation];
  return clone;
}

export function clonePrimitive(primitive: ColliderPrimitive): ColliderPrimitive {
  const copy: ColliderPrimitive = { shape: primitive.shape, size: [...primitive.size] };
  if (primitive.center) copy.center = [...primitive.center];
  if (primitive.rotation) copy.rotation = [...primitive.rotation];
  if (primitive.points) copy.points = primitive.points.map((point) => [...point] as typeof point);
  // Trimesh (complexAsSimple) data — must be carried through, or the Rapier
  // collider and the movement blockers both fall back to a box.
  if (primitive.vertices) copy.vertices = primitive.vertices.map((point) => [...point] as typeof point);
  if (primitive.indices) copy.indices = [...primitive.indices];
  // Shared, never copied: a terrain tile's grid is large and immutable while the body lives.
  if (primitive.heightfield) copy.heightfield = primitive.heightfield;
  return copy;
}

/**
 * Collider descriptors for a body: one per authored primitive (a compound
 * collider) when present, otherwise the single box derived from the collider's
 * size/center. Each primitive carries its own local translation + rotation.
 */
export function colliderDescsForBody(RAPIER: RapierModule, body: PhysicsBody) {
  const primitives = body.collider.primitives;
  if (!primitives || primitives.length === 0) return [colliderDescForBody(RAPIER, body)];
  const friction = body.collider.friction ?? DEFAULT_FRICTION;
  const restitution = body.collider.restitution ?? DEFAULT_RESTITUTION;
  const groups = body.collider.collisionGroups;
  // A simulated body's authored mass is split evenly over its primitives;
  // without it Rapier would weigh each one by volume at density 1.
  const massKg = body.collider.simulatePhysics ? body.collider.massKg : undefined;
  return primitives.map((primitive) => {
    const desc = primitiveColliderDesc(RAPIER, primitive).setFriction(friction).setRestitution(restitution);
    if (groups !== undefined) desc.setCollisionGroups(groups);
    if (massKg !== undefined) desc.setMass(massKg / primitives.length);
    return desc;
  });
}

/**
 * A collider descriptor for one primitive. A convex primitive builds a Rapier
 * convex hull from its (already body-local) points; everything else is a
 * translated/rotated box/sphere/capsule. A degenerate hull falls back to the
 * primitive's bounding box.
 */
export function primitiveColliderDesc(RAPIER: RapierModule, primitive: ColliderPrimitive) {
  if (primitive.shape === "heightfield" && primitive.heightfield) {
    const { quadsX, quadsZ, spacing, heights } = primitive.heightfield;
    // Rapier's matrix is column-major (Z fastest within a column of constant X),
    // with rows along Z and columns along X; it splits each cell along the same
    // diagonal as the grid's triangles (OPEN_WORLD_PLAN K3a).
    const columnMajor = new Float32Array(heights.length);
    for (let x = 0; x <= quadsX; x += 1) {
      for (let z = 0; z <= quadsZ; z += 1) columnMajor[x * (quadsZ + 1) + z] = heights[z * (quadsX + 1) + x]!;
    }
    // Same reason as the trimesh flag: no catching on internal edges (S4).
    return RAPIER.ColliderDesc.heightfield(quadsZ, quadsX, columnMajor, { x: quadsX * spacing, y: 1, z: quadsZ * spacing },
      RAPIER.HeightFieldFlags.FIX_INTERNAL_EDGES);
  }
  if (
    primitive.shape === "trimesh" &&
    primitive.vertices &&
    primitive.vertices.length >= 3 &&
    primitive.indices &&
    primitive.indices.length >= 3
  ) {
    const vertices = new Float32Array(primitive.vertices.length * 3);
    primitive.vertices.forEach((point, index) => {
      vertices[index * 3] = point[0];
      vertices[index * 3 + 1] = point[1];
      vertices[index * 3 + 2] = point[2];
    });
    const indices = new Uint32Array(primitive.indices);
    // Without it, bodies rolling or sliding across the mesh catch on the shared
    // edges of neighbouring triangles and get kicked upward. It also merges
    // duplicate vertices (UV-seam splits) so those edges are recognised.
    return RAPIER.ColliderDesc.trimesh(vertices, indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES);
  }
  if (primitive.shape === "convex" && primitive.points && primitive.points.length >= 4) {
    const flat = new Float32Array(primitive.points.length * 3);
    primitive.points.forEach((point, index) => {
      flat[index * 3] = point[0];
      flat[index * 3 + 1] = point[1];
      flat[index * 3 + 2] = point[2];
    });
    const hull = RAPIER.ColliderDesc.convexHull(flat);
    if (hull) return hull; // points are absolute (body-local) — no extra translation
  }
  const center = primitive.center ?? [0, 0, 0];
  const shape = primitive.shape === "convex" || primitive.shape === "trimesh" ? "box" : primitive.shape;
  const desc = colliderShapeDesc(RAPIER, shape, primitive.size).setTranslation(
    center[0] ?? 0,
    center[1] ?? 0,
    center[2] ?? 0,
  );
  if (primitive.rotation) desc.setRotation(quaternionFromEulerDegrees(primitive.rotation));
  return desc;
}

export function colliderDescForBody(RAPIER: RapierModule, body: PhysicsBody) {
  // `size` is world-space (placement scale already baked); the `center` offset
  // is applied as the collider's translation relative to the body position.
  const size = body.collider.size;
  const center = body.collider.center ?? [0, 0, 0];
  const desc = colliderShapeDesc(RAPIER, body.collider.shape, size);
  const colliderDesc = desc
    .setTranslation(center[0] ?? 0, center[1] ?? 0, center[2] ?? 0)
    .setFriction(body.collider.friction ?? DEFAULT_FRICTION)
    .setRestitution(body.collider.restitution ?? DEFAULT_RESTITUTION);
  if (body.collider.collisionGroups !== undefined) {
    colliderDesc.setCollisionGroups(body.collider.collisionGroups);
  }
  if (body.collider.simulatePhysics && body.collider.massKg !== undefined) {
    return colliderDesc.setMass(body.collider.massKg);
  }
  return colliderDesc;
}

export function rigidBodyDescForBody(RAPIER: RapierModule, body: PhysicsBody) {
  if (body.collider.isStatic) return RAPIER.RigidBodyDesc.fixed();
  if (body.collider.simulatePhysics) {
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setCcdEnabled(true)
      .setLinearDamping(body.collider.linearDamping ?? 0.12)
      .setAngularDamping(body.collider.angularDamping ?? 0.45)
      .setGravityScale(body.collider.enableGravity === false ? 0 : 1);
    const lockPosition = body.collider.lockPosition;
    if (lockPosition) {
      desc.restrictTranslations(!lockPosition[0], !lockPosition[1], !lockPosition[2]);
    }
    const lockRotation = body.collider.lockRotation;
    if (lockRotation) {
      desc.restrictRotations(!lockRotation[0], !lockRotation[1], !lockRotation[2]);
    }
    return desc;
  }
  return RAPIER.RigidBodyDesc.kinematicPositionBased();
}

export function colliderShapeDesc(
  RAPIER: RapierModule,
  shape: ColliderComponent["shape"],
  size: readonly number[],
) {
  if (shape === "sphere") {
    return RAPIER.ColliderDesc.ball(Math.max(size[0] ?? 1, size[1] ?? 1, size[2] ?? 1) / 2);
  }
  if (shape === "capsule") {
    const radius = Math.max(size[0] ?? 1, size[2] ?? 1) / 2;
    const halfHeight = Math.max(0, ((size[1] ?? 1) / 2) - radius);
    return RAPIER.ColliderDesc.capsule(halfHeight, radius);
  }
  if (shape === "cylinder") {
    const radius = Math.max(size[0] ?? 1, size[2] ?? 1) / 2;
    return RAPIER.ColliderDesc.cylinder((size[1] ?? 1) / 2, radius);
  }
  if (shape === "cone") {
    const radius = Math.max(size[0] ?? 1, size[2] ?? 1) / 2;
    return RAPIER.ColliderDesc.cone((size[1] ?? 1) / 2, radius);
  }
  return RAPIER.ColliderDesc.cuboid(
    (size[0] ?? 1) / 2,
    (size[1] ?? 1) / 2,
    (size[2] ?? 1) / 2,
  );
}

export function vectorFromTransform(transform: TransformComponent): { x: number; y: number; z: number } {
  return {
    x: transform.position[0],
    y: transform.position[1],
    z: transform.position[2],
  };
}

export function vectorFromVec3(vec: Vec3): { x: number; y: number; z: number } {
  return {
    x: vec[0],
    y: vec[1],
    z: vec[2],
  };
}

export function quaternionFromEulerDegrees(rotation: Vec3): { x: number; y: number; z: number; w: number } {
  const x = degreesToRadians(rotation[0]) / 2;
  const y = degreesToRadians(rotation[1]) / 2;
  const z = degreesToRadians(rotation[2]) / 2;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  return {
    x: sx * cy * cz + cx * sy * sz,
    y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz,
    w: cx * cy * cz - sx * sy * sz,
  };
}

export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function eulerDegreesFromQuaternion(rotation: {
  x: number;
  y: number;
  z: number;
  w: number;
}): Vec3 {
  const x = rotation.x;
  const y = rotation.y;
  const z = rotation.z;
  const w = rotation.w;
  const m11 = 1 - 2 * (y * y + z * z);
  const m12 = 2 * (x * y - z * w);
  const m13 = 2 * (x * z + y * w);
  const m22 = 1 - 2 * (x * x + z * z);
  const m23 = 2 * (y * z - x * w);
  const m32 = 2 * (y * z + x * w);
  const m33 = 1 - 2 * (x * x + y * y);

  const ry = Math.asin(clamp(m13, -1, 1));
  let rx: number;
  let rz: number;
  if (Math.abs(m13) < 0.9999999) {
    rx = Math.atan2(-m23, m33);
    rz = Math.atan2(-m12, m11);
  } else {
    rx = Math.atan2(m32, m22);
    rz = 0;
  }
  return [radiansToDegrees(rx), radiansToDegrees(ry), radiansToDegrees(rz)];
}

export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}