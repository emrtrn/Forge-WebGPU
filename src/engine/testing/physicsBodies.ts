// Fixtures for ported physics checks that still author Forge WebGL entities.
import { readColliderComponent, readTransformComponent, VEHICLE_COMPONENT } from "../legacy/components.ts";
import type { Entity } from "../legacy/entity.ts";
import type { ColliderComponent, ColliderPrimitive } from "../physics/colliderTypes.ts";
import { cloneTransform } from "../physics/physicsBodies.ts";
import type { PhysicsBody } from "../physics/physicsTypes.ts";
import { vehicleDefinitionFromComponent } from "../physics/vehicle/vehicleTypes.ts";

export function resolvePhysicsBodies(entities: readonly Entity[]): PhysicsBody[] {
  return entities.flatMap((entity) => {
    const body = bodyFromEntity(entity);
    return body ? [body] : [];
  });
}

function bodyFromEntity(entity: Entity): PhysicsBody | null {
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

function cloneCollider(collider: ColliderComponent): ColliderComponent {
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
  if (collider.profile) clone.profile = collider.profile;
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

function clonePrimitive(primitive: ColliderPrimitive): ColliderPrimitive {
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
