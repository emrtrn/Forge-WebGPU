import { defineSubsystem, isJsonObject, parseComponentTypeTag, type ActorId, type ComponentRecord, type Vec3, type WorldActor } from "../../core/index.ts";
import { parentWorldMatrix } from "../../engine/gizmo/dragSession.ts";
import { composeMat4, decomposeMat4, invertMat4, multiplyMat4, type Mat4 } from "../../engine/math/affine.ts";
import { CheckpointKey } from "../../engine/persistence/checkpointService.ts";
import type { ColliderComponent, ColliderPrimitive } from "../../engine/physics/colliderTypes.ts";
import { eulerDegreesFromQuaternion, quaternionFromEulerDegrees } from "../../engine/physics/physicsBodies.ts";
import {
  PhysicsRuntimeKey, PhysicsServiceKey, PreparedPhysicsKey, StaticCollisionSourceKey, WORLD_PHYSICS_ID,
  type CollisionTriangleMesh, type ModelCollisionSource, type PhysicsCastFilter, type PhysicsHit,
} from "../../engine/physics/physicsService.ts";
import { PhysicsSubsystem } from "../../engine/physics/physicsSubsystem.ts";
import type { PhysicsBody } from "../../engine/physics/physicsTypes.ts";
import { collisionInteractionGroups, isCollisionPresetId, resolveCollisionProfile, resolvePhysicalMaterial, type CollisionProfile } from "../../engine/physics/collision.ts";
import { triangleMeshPrimitive } from "../../engine/physics/triangleMeshCollider.ts";
import { SHAPE_PLANE_SIZE, SHAPE_SOLID_SIZE } from "../../engine/procgen/shapePrimitives.ts";
import { ActorMotionKey } from "../../engine/world/actorMotion.ts";
import { actorMatrix, componentMatrix } from "../../engine/world/worldMatrices.ts";
import type { ShapeData } from "../shape/schema.ts";
import type { StaticMeshData } from "../static-mesh/schema.ts";
import type { ModelCollisionSettings } from "../model/schema.ts";
import { CollisionState, type BlockingVolumeData, type ColliderData } from "./schema.ts";

interface Owner {
  readonly actor: ActorId;
  readonly component: string;
  readonly profile: CollisionProfile;
  readonly sensor: boolean;
}

type ResolvedCollider = ColliderComponent & { readonly profile: CollisionProfile };

const staticProfile = resolveCollisionProfile("blockAll");
const dynamicProfile = resolveCollisionProfile("blockAllDynamic");

function profileFor(configured: Partial<ModelCollisionSettings["profile"]> | undefined, isStatic: boolean): CollisionProfile {
  if (isCollisionPresetId(configured?.preset)) return resolveCollisionProfile(configured.preset, configured);
  return isStatic ? staticProfile : dynamicProfile;
}

function collisionFields(profile: CollisionProfile, sensor = false) {
  return { profile, isSensor: sensor || profile.collisionEnabled === "query", collisionGroups: collisionInteractionGroups(profile) };
}

function scaledSize(size: Readonly<Vec3>, scale: Readonly<Vec3>): Vec3 {
  return [
    Math.max(0.001, Math.abs(size[0] * scale[0])),
    Math.max(0.001, Math.abs(size[1] * scale[1])),
    Math.max(0.001, Math.abs(size[2] * scale[2])),
  ];
}

function scaledPoint(point: Readonly<Vec3>, scale: Readonly<Vec3>): Vec3 {
  return [point[0] * scale[0], point[1] * scale[1], point[2] * scale[2]];
}

function boxSize(min: Readonly<Vec3>, max: Readonly<Vec3>): { size: Vec3; center: Vec3 } {
  return {
    size: [Math.max(0.001, max[0] - min[0]), Math.max(0.001, max[1] - min[1]), Math.max(0.001, max[2] - min[2])],
    center: [(max[0] + min[0]) * 0.5, (max[1] + min[1]) * 0.5, (max[2] + min[2]) * 0.5],
  };
}

function convexPrimitive(flat: readonly number[], scale: Vec3): ColliderPrimitive[] {
  if (flat.length < 12 || flat.length % 3 !== 0) return [];
  const points: Vec3[] = [];
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < flat.length; i += 3) {
    const point = scaledPoint([flat[i]!, flat[i + 1]!, flat[i + 2]!], scale);
    if (!point.every(Number.isFinite)) return [];
    points.push(point);
    for (const axis of [0, 1, 2] as const) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  return [{ shape: "convex", points, ...boxSize(min, max) }];
}

function modelCollider(
  data: StaticMeshData, scale: Vec3, model: ModelCollisionSource | undefined, meshes: readonly CollisionTriangleMesh[] | undefined,
): ResolvedCollider | null {
  if (!data.collision || !data.mesh) return null;
  const asset = model?.(data.mesh);
  if (!asset) return null;
  const settings = isJsonObject(asset.settings) ? asset.settings as Partial<ModelCollisionSettings> : {};
  if (settings.enabled === false) return null;
  const profile = profileFor(settings.profile, true);
  if (profile.collisionEnabled === "none") return null;
  let primitives: ColliderPrimitive[] = (settings.primitives ?? []).map((primitive) => ({
    shape: primitive.shape, size: scaledSize(primitive.size, scale),
    center: scaledPoint(primitive.center, scale), rotation: primitive.rotation,
  }));
  for (const { points } of settings.convex ?? []) primitives.push(...convexPrimitive(points, scale));
  if (meshes?.length && settings.complexity === "complexAsSimple") {
    const matrix = composeMat4([0, 0, 0], [0, 0, 0, 1], scale);
    primitives = meshes.map(({ positions, indices }) => triangleMeshPrimitive(positions, indices, matrix));
  }
  const bounds = asset.bounds;
  if (!bounds && primitives.length === 0) return null;
  const box = bounds ? boxSize(bounds.min, bounds.max) : null;
  const material = settings.physicalMaterial;
  const { friction, restitution } = resolvePhysicalMaterial(material);
  return {
    shape: "box", size: box ? scaledSize(box.size, scale) : primitives[0]!.size,
    center: box ? scaledPoint(box.center, scale) : primitives[0]!.center ?? [0, 0, 0],
    isStatic: true, ...collisionFields(profile, settings.sensor),
    ...(primitives.length ? { primitives } : {}),
    ...(material ? { physicalMaterialId: material, friction, restitution } : {}),
  };
}

export function resolveCollider(
  type: string, component: ComponentRecord, scale: Vec3, model: ModelCollisionSource | undefined,
  meshes?: readonly CollisionTriangleMesh[],
): ResolvedCollider | null {
  if (type === "forge.collider") {
    const data = component as unknown as ColliderData;
    if (!data.enabled) return null;
    const isStatic = data.motion !== "dynamic";
    const profile = profileFor(data.profile, isStatic);
    if (profile.collisionEnabled === "none") return null;
    return {
      shape: data.shape, size: scaledSize(data.size, scale), isStatic, ...collisionFields(profile, data.sensor),
      friction: data.friction, restitution: data.restitution,
      ...(data.physicalMaterial ? { physicalMaterialId: data.physicalMaterial } : {}),
    };
  }
  if (type === "forge.blockingVolume") {
    const data = component as unknown as BlockingVolumeData;
    const profile = profileFor(data.profile, true);
    if (profile.collisionEnabled === "none") return null;
    return { shape: data.shape, size: scaledSize(data.size, scale), isStatic: true, ...collisionFields(profile) };
  }
  if (type === "forge.staticMesh") return modelCollider(component as unknown as StaticMeshData, scale, model, meshes);
  const data = component as unknown as ShapeData;
  if (!data.collision) return null;
  const shape = data.primitive === "cube" || data.primitive === "plane" ? "box" : data.primitive;
  const width = data.primitive === "plane" ? SHAPE_PLANE_SIZE : SHAPE_SOLID_SIZE;
  const y = data.primitive === "plane" ? 0.01 : SHAPE_SOLID_SIZE;
  return {
    shape, size: scaledSize([width, y, width], scale), isStatic: true, ...collisionFields(staticProfile),
  };
}

const colliderTypes: ReadonlySet<string> = new Set(["forge.collider", "forge.blockingVolume", "forge.staticMesh", "forge.shape"]);

function worldPose(matrix: Mat4): PhysicsBody["transform"] {
  const { p, r: [x, y, z, w] } = decomposeMat4(matrix);
  return { position: p, rotation: eulerDegreesFromQuaternion({ x, y, z, w }), scale: [1, 1, 1] };
}

export const WorldPhysicsSubsystem = defineSubsystem({
  id: WORLD_PHYSICS_ID,
  tickGroups: ["physics"],
  create(world) {
    const prepared = world.services.require(PreparedPhysicsKey);
    const physics = new PhysicsSubsystem({ backend: "rapier" });
    physics.startRapier(prepared.rapier);
    const actorMotion = world.services.require(ActorMotionKey);
    const checkpoint = world.services.get(CheckpointKey);
    const savedDisabled = new Set<ActorId>(checkpoint?.state(CollisionState).disabled.filter((id) => id !== null));
    const disabled = new Set(savedDisabled);
    const owners = new Map<string, Owner>();
    const byActor = new Map<ActorId, Set<string>>();
    const dynamic = new Map<ActorId, { id: string; scale: Vec3 }>();
    const moved = new Map<ActorId, Mat4>();
    const geometry = new Map<string, readonly CollisionTriangleMesh[]>();
    const pending = new Map<string, Promise<void>>();
    let disposed = false;
    physics.setTransformSink((body, pose) => {
      const owner = owners.get(body);
      if (!owner) return;
      const entry = dynamic.get(owner.actor);
      if (entry?.id !== body) return;
      const { x, y, z, w } = quaternionFromEulerDegrees(pose.rotation);
      moved.set(owner.actor, composeMat4(pose.position, [x, y, z, w], entry.scale));
    });
    const register = (id: string, actor: ActorId, component: string, collider: ResolvedCollider) => {
      owners.set(id, { actor, component, profile: collider.profile, sensor: collider.isSensor });
      let ids = byActor.get(actor);
      if (!ids) byActor.set(actor, ids = new Set());
      ids.add(id);
    };
    const addBodies = (bodies: readonly PhysicsBody[]) => {
      physics.addBodies(bodies);
      for (const { id } of bodies) {
        const actor = owners.get(id)?.actor;
        if (actor !== undefined && disabled.has(actor)) physics.setEntityCollisionEnabled(id, false);
      }
    };
    const remove = (ids: readonly string[]) => {
      if (ids.length === 0) return;
      physics.removeEntities(ids);
      for (const id of ids) {
        const owner = owners.get(id);
        if (!owner) continue;
        owners.delete(id);
        if (dynamic.get(owner.actor)?.id === id) dynamic.delete(owner.actor);
        const siblings = byActor.get(owner.actor);
        siblings?.delete(id);
        if (siblings?.size === 0) byActor.delete(owner.actor);
      }
    };
    const requestGeometry = (asset: string): void => {
      const settings = prepared.model?.(asset)?.settings;
      if (!prepared.triangles || geometry.has(asset) || pending.has(asset) || !isJsonObject(settings) ||
          settings.enabled === false || settings.complexity !== "complexAsSimple") return;
      const done = prepared.triangles(asset).then((meshes) => {
        if (disposed) return;
        geometry.set(asset, meshes);
        for (const { actor, key, component } of world.componentsOf("forge.staticMesh")) {
          if (component.mesh !== asset || dynamic.has(actor.id)) continue;
          const placement = componentMatrix(actor, key, actorMatrix(actor, world.actor));
          const collider = modelCollider(component as unknown as StaticMeshData, decomposeMat4(placement).s, prepared.model, meshes);
          if (!collider) continue;
          const id = `${actor.id}/${key}`;
          remove([id]);
          register(id, actor.id, key, collider);
          addBodies([{ id, transform: worldPose(placement), collider }]);
        }
      }).catch((error: unknown) => {
        if (disposed) return;
        geometry.set(asset, []);
        console.warn(`forge physics: model collision geometry ${asset} failed; using simple collision`, error);
      }).finally(() => pending.delete(asset));
      pending.set(asset, done);
    };
    const addActors = (actors: readonly WorldActor[]) => {
      const bodies: PhysicsBody[] = [];
      for (const actor of actors) {
        const components = Object.entries(actor.components).flatMap(([key, component]) => {
          const type = parseComponentTypeTag(component.type)?.name;
          return type && colliderTypes.has(type) ? [{ key, component, type }] : [];
        });
        if (components.length === 0) continue;
        const matrix = actorMatrix(actor, world.actor);
        const driver = components.find(({ component, type }) => type === "forge.collider" && component.enabled === true &&
          component.motion === "dynamic" && profileFor((component as unknown as ColliderData).profile, false).collisionEnabled !== "none");
        if (driver) {
          const data = driver.component as unknown as ColliderData;
          const { p, r, s } = decomposeMat4(matrix);
          const inverse = invertMat4(composeMat4(p, r, [1, 1, 1]))!;
          const primitives = components.flatMap(({ key, component, type }): ColliderPrimitive[] => {
            if (type !== "forge.collider" || component.enabled !== true) return [];
            const { p: center, r: [x, y, z, w], s: partScale } = decomposeMat4(multiplyMat4(inverse, componentMatrix(actor, key, matrix)));
            const shape = component as unknown as ColliderData;
            if (profileFor(shape.profile, false).collisionEnabled === "none") return [];
            return [{ shape: shape.shape, size: scaledSize(shape.size, partScale), center, rotation: eulerDegreesFromQuaternion({ x, y, z, w }) }];
          });
          const id = `${actor.id}/${driver.key}`;
          // A dynamic compound shares the driving component's profile and material.
          const collider: ResolvedCollider = {
            shape: data.shape, size: primitives[0]!.size, primitives,
            isStatic: false, simulatePhysics: true, ...collisionFields(profileFor(data.profile, false), data.sensor),
            friction: data.friction, restitution: data.restitution, massKg: data.mass, enableGravity: data.gravity,
            ...(data.physicalMaterial ? { physicalMaterialId: data.physicalMaterial } : {}),
          };
          bodies.push({ id, transform: worldPose(matrix), collider });
          register(id, actor.id, driver.key, collider);
          dynamic.set(actor.id, { id, scale: s });
          continue;
        }
        for (const { key, component, type } of components) {
          const placement = componentMatrix(actor, key, matrix);
          const { s } = decomposeMat4(placement);
          const asset = type === "forge.staticMesh" && component.collision && typeof component.mesh === "string" ? component.mesh : null;
          if (asset !== null) requestGeometry(asset);
          const collider = resolveCollider(type, component, s, prepared.model, asset === null ? undefined : geometry.get(asset));
          if (!collider) continue;
          const id = `${actor.id}/${key}`;
          bodies.push({ id, transform: worldPose(placement), collider });
          register(id, actor.id, key, collider);
        }
      }
      addBodies(bodies);
    };
    const removeActors = (actors: readonly WorldActor[]) => {
      remove(actors.flatMap((actor) => Array.from(byActor.get(actor.id) ?? [])));
      for (const { id } of actors) {
        if (savedDisabled.has(id)) disabled.add(id);
        else disabled.delete(id);
      }
    };
    function hit(result: ReturnType<typeof physics.casts.ray>): PhysicsHit | null {
      if (!result) return null;
      const owner = owners.get(result.body);
      if (!owner) return null;
      return {
        actor: owner.actor, component: owner.component, distance: result.distance, point: result.point, normal: result.normal,
        physicalMaterial: physics.colliderPhysicalMaterialId(result.body) ?? null,
      };
    }
    const accepts = (filter: PhysicsCastFilter) => (body: string) => {
      const owner = owners.get(body);
      if (!owner || filter.ignore?.includes(owner.actor)) return false;
      if (filter.physicalChannel) return !owner.sensor && owner.profile.responses[filter.physicalChannel] === "block";
      if (!filter.channel) return !owner.sensor || filter.includeSensors === true;
      if (owner.profile.collisionEnabled === "physics") return false;
      const response = owner.profile.responses[filter.channel];
      if (response === "ignore") return false;
      if (filter.includeSensors) return true;
      return response === "block" && (!owner.sensor || owner.profile.collisionEnabled === "query");
    };
    world.services.provide(PhysicsRuntimeKey, {
      physics,
      owner: (body) => owners.get(body)?.actor,
      ids: (actor) => byActor.get(actor) ?? [],
      contacts: () => [...physics.currentContacts()].sort((left, right) =>
        left.a.localeCompare(right.a) || left.b.localeCompare(right.b)),
      impacts: () => physics.impacts(),
      async ready() { await Promise.all(pending.values()); },
    });
    world.services.provide(PhysicsServiceKey, {
      castRay: (query, filter = {}) => hit(physics.casts.ray(query, { ...filter, includeSensors: true }, accepts({ channel: "visibility", ...filter }))),
      castShape: (query, filter = {}) => hit(physics.casts.shape(query, { ...filter, includeSensors: true }, accepts(filter))),
      applyImpulse(actor, impulse) {
        const entry = dynamic.get(actor);
        if (entry && impulse.every(Number.isFinite)) physics.applyImpulse(entry.id, impulse);
      },
      setCollisionEnabled(actor, enabled, options) {
        if (!world.actor(actor)) return false;
        if (enabled) disabled.delete(actor);
        else disabled.add(actor);
        for (const id of byActor.get(actor) ?? []) physics.setEntityCollisionEnabled(id, enabled);
        if (options?.persist) {
          if (enabled) savedDisabled.delete(actor);
          else savedDisabled.add(actor);
          checkpoint?.setState(CollisionState, { disabled: [...savedDisabled].sort() });
        }
        return true;
      },
    });
    world.services.provide(StaticCollisionSourceKey, {
      add(id, actor, component, position, primitive: ColliderPrimitive, physicalMaterial) {
        const collider: ResolvedCollider = {
          shape: primitive.shape, size: primitive.size, primitives: [primitive], isStatic: true, ...collisionFields(staticProfile),
          ...(primitive.shape === "heightfield" ? { navigationRole: "walkable" } : {}),
          ...(physicalMaterial ? { physicalMaterialId: physicalMaterial } : {}),
        };
        register(id, actor, component, collider);
        addBodies([{
          id, transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] },
          collider,
        }]);
      },
      remove,
      ray: (query, accept) => physics.casts.ray(query, {}, accept),
    });
    return {
      actorsAdded: addActors,
      actorsRemoved: removeActors,
      actorsChanged(changes) {
        const actors = changes.filter(({ actor, source }) => source !== WORLD_PHYSICS_ID || !dynamic.has(actor.id))
          .map(({ actor }) => actor);
        remove(actors.flatMap(({ id }) => [...(byActor.get(id) ?? [])].filter((body) => body.startsWith(`${id}/`))));
        addActors(actors);
      },
      tick(_group, dt) {
        moved.clear();
        physics.step(dt);
        if (dt === 0 || moved.size === 0) return;
        const updates = [...moved].flatMap(([id, matrix]) => {
          const actor = world.actor(id);
          if (!actor) return [];
          const parent = actor.parent === null
            ? parentWorldMatrix(world.actor, null)
            : moved.get(actor.parent) ?? parentWorldMatrix(world.actor, actor.parent);
          const inverse = invertMat4(parent);
          return inverse ? [{ actor: id, transform: decomposeMat4(multiplyMat4(inverse, matrix)) }] : [];
        });
        actorMotion.setTransforms(updates, WORLD_PHYSICS_ID);
      },
      dispose() {
        disposed = true;
        physics.dispose();
        owners.clear();
        byActor.clear();
      },
    };
  },
});
