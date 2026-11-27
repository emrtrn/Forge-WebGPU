import {
  BoxGeometry, CapsuleGeometry, ConeGeometry, CylinderGeometry, Euler, Group, Mesh, MeshBasicNodeMaterial,
  SphereGeometry, type BufferGeometry, Vector3, Quaternion,
} from "three/webgpu";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { parseComponentTypeTag, type ActorId, type WorldActor } from "../../core/index.ts";
import { decomposeMat4 } from "../../engine/math/affine.ts";
import type { ColliderPrimitive } from "../../engine/physics/colliderTypes.ts";
import { actorMatrix, componentMatrix } from "../../engine/world/worldMatrices.ts";
import { defineEditorRenderBinding } from "../../render/editor/editorBinding.ts";
import { resolveCollider } from "./runtime.ts";

const types = ["forge.collider", "forge.blockingVolume", "forge.shape", "forge.staticMesh"];

function geometryFor(primitive: ColliderPrimitive): BufferGeometry {
  const [x, y, z] = primitive.size;
  const radius = Math.max(x, z) / 2;
  switch (primitive.shape) {
    case "sphere": return new SphereGeometry(Math.max(radius, y / 2), 12, 8);
    case "capsule": return new CapsuleGeometry(radius, Math.max(0, y - radius * 2), 4, 12);
    case "cylinder": return new CylinderGeometry(radius, radius, y, 12);
    case "cone": return new ConeGeometry(radius, y, 12);
    case "convex":
      if (primitive.points && primitive.points.length >= 4) {
        const points = primitive.points.map((point) => new Vector3(...point));
        try { return new ConvexGeometry(points); }
        catch { return new BoxGeometry(x, y, z); }
      }
      return new BoxGeometry(x, y, z);
    default: return new BoxGeometry(x, y, z);
  }
}

export default defineEditorRenderBinding({
  feature: "forge.physics",
  create(ctx) {
    const root = new Group(), views = new Map<ActorId, Group>();
    const solid = new MeshBasicNodeMaterial({ color: "#69e1aa", wireframe: true, transparent: true, depthWrite: false });
    const sensor = new MeshBasicNodeMaterial({ color: "#f5bb68", wireframe: true, transparent: true, depthWrite: false });
    solid.opacityNode = ctx.sceneVisibility.mul(0.76);
    sensor.opacityNode = ctx.sceneVisibility.mul(0.76);
    ctx.root.add(root);
    const dirty = new Set<ActorId>();
    let built = false;
    const remove = (id: ActorId) => {
      const group = views.get(id);
      if (!group) return;
      group.traverse((object) => { if (object instanceof Mesh) object.geometry.dispose(); });
      group.removeFromParent();
      views.delete(id);
    };
    const create = (actor: WorldActor) => {
      const group = new Group();
      const transform = actorMatrix(actor, ctx.world.actor);
      for (const [key, component] of Object.entries(actor.components)) {
        const type = parseComponentTypeTag(component.type)?.name;
        if (!type || !types.includes(type)) continue;
        const { p, r, s } = decomposeMat4(componentMatrix(actor, key, transform));
        const collider = resolveCollider(type, component, s, ctx.modelCollision);
        if (!collider) continue;
        const body = new Group();
        body.position.fromArray(p);
        body.quaternion.copy(new Quaternion(...r));
        const primitives: readonly ColliderPrimitive[] = collider.primitives ?? [collider];
        for (const primitive of primitives) {
          const wire = new Mesh(geometryFor(primitive), collider.isSensor ? sensor : solid);
          if (primitive.center && primitive.shape !== "convex") wire.position.fromArray(primitive.center);
          const [x, y, z] = primitive.rotation ?? [0, 0, 0];
          wire.rotation.copy(new Euler(x * Math.PI / 180, y * Math.PI / 180, z * Math.PI / 180));
          body.add(wire);
        }
        group.add(body);
      }
      if (group.children.length) {
        root.add(group);
        views.set(actor.id, group);
      }
    };
    return {
      actorsAdded(actors) { if (built) for (const { id } of actors) dirty.add(id); },
      actorsRemoved(actors) { for (const { id } of actors) { dirty.delete(id); remove(id); } },
      actorsChanged(changes) { if (built) for (const { actor } of changes) dirty.add(actor.id); },
      sync() {
        root.visible = ctx.show?.("collision") === true;
        if (!root.visible) return;
        if (!built) {
          for (const type of types) for (const { actor } of ctx.world.componentsOf(type)) dirty.add(actor.id);
          built = true;
        }
        for (const id of dirty) {
          remove(id);
          const actor = ctx.world.actor(id);
          if (actor) create(actor);
        }
        dirty.clear();
      },
      dispose() { for (const id of views.keys()) remove(id); root.removeFromParent(); solid.dispose(); sensor.dispose(); },
    };
  },
});
