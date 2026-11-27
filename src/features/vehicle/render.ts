import { CylinderGeometry, Group, Matrix4, Mesh, MeshStandardNodeMaterial, Object3D, Quaternion, Vector3 } from "three/webgpu";
import { parseComponentTypeTag, type ActorId, type WorldActor } from "../../core/index.ts";
import { VehicleServiceKey } from "../../engine/physics/vehicle/worldVehicle.ts";
import { resourceKey } from "../../render/resources/resourceCache.ts";
import { defineRenderBinding } from "../../render/sync/renderBinding.ts";
import { componentWorldMatrix } from "../../render/sync/transforms.ts";
import { Vehicle } from "./schema.ts";

interface WheelView {
  readonly object: Object3D;
  readonly base: Quaternion;
  readonly basePosition: Vector3;
  readonly geometry?: CylinderGeometry;
}

interface VehicleView {
  readonly actor: ActorId;
  readonly component: string;
  readonly group: Group;
  readonly wheels: WheelView[];
  readonly modelId: string | null;
  model: Object3D | null;
}

export default defineRenderBinding({
  feature: "forge.vehicle",
  create(ctx) {
    const vehicles = new Map<ActorId, VehicleView>();
    const tire = new MeshStandardNodeMaterial({ color: "#202226", roughness: 0.93 });
    const matrix = new Matrix4();
    const steer = new Quaternion(), spin = new Quaternion();
    const up = new Vector3(0, 1, 0), axle = new Vector3(1, 0, 0);
    const clearWheels = (entry: VehicleView) => {
      for (const wheel of entry.wheels.splice(0)) if (wheel.geometry) {
        wheel.object.removeFromParent();
        wheel.geometry.dispose();
      }
    };
    const add = (actors: readonly WorldActor[]) => {
      for (const actor of actors) {
        const match = Object.entries(actor.components).find(([, c]) => parseComponentTypeTag(c.type)?.name === Vehicle.name);
        if (!match) continue;
        const [component, data] = match;
        const group = new Group();
        group.name = `${actor.name}/vehicle visual`;
        group.matrixAutoUpdate = false;
        const modelId = typeof data.model === "string" ? data.model : null;
        const entry: VehicleView = { actor: actor.id, component, group, wheels: [], modelId, model: null };
        vehicles.set(actor.id, entry);
        ctx.root.add(group);
        if (modelId) void ctx.resources.model(modelId).then(({ scene }) => {
          if (vehicles.get(actor.id) !== entry) return;
          clearWheels(entry);
          entry.model = scene.clone(true);
          group.add(entry.model);
        }, () => {});
      }
    };
    const remove = (id: ActorId) => {
      const entry = vehicles.get(id);
      if (!entry) return;
      vehicles.delete(id);
      clearWheels(entry);
      entry.group.removeFromParent();
      if (entry.modelId) ctx.resources.release(resourceKey.model(entry.modelId));
    };
    return {
      actorsAdded: add,
      actorsRemoved(actors) { for (const actor of actors) remove(actor.id); },
      actorsChanged(changes) {
        for (const { actor, transformOnly } of changes) if (!transformOnly) { remove(actor.id); add([actor]); }
      },
      sync() {
        const service = ctx.world.services.get(VehicleServiceKey);
        if (!service) return;
        for (const entry of vehicles.values()) {
          const actor = ctx.world.actor(entry.actor);
          if (!actor) continue;
          entry.group.matrix.copy(componentWorldMatrix(ctx.world, actor, entry.component, matrix));
          entry.group.matrixWorldNeedsUpdate = true;
          const state = service.state(entry.actor);
          const definition = service.definition(entry.actor);
          if (!state || !definition) continue;
          state.wheels.forEach((wheel, index) => {
            const spec = definition.wheels[index]!;
            let current = entry.wheels[index];
            if (!current) {
              const named = spec.visualNode ? entry.model?.getObjectByName(spec.visualNode) : null;
              if (named) current = { object: named, base: named.quaternion.clone(), basePosition: named.position.clone() };
              else {
                const geometry = new CylinderGeometry(spec.radius, spec.radius, spec.width ?? spec.radius * 0.7, 18);
                geometry.rotateZ(Math.PI / 2);
                const mesh = new Mesh(geometry, tire);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                entry.group.add(mesh);
                current = {
                  object: mesh, base: new Quaternion(), geometry,
                  basePosition: new Vector3(spec.position[0], spec.position[1] - spec.suspensionRestLength, spec.position[2]),
                };
              }
              entry.wheels[index] = current;
            }
            current.object.position.copy(current.basePosition);
            current.object.position.y += spec.suspensionRestLength - wheel.suspensionLength - (wheel.sinkDepth ?? 0);
            current.object.quaternion.copy(steer.setFromAxisAngle(up, wheel.steering)).multiply(current.base)
              .multiply(spin.setFromAxisAngle(axle, wheel.rotation));
          });
        }
      },
      dispose() { for (const id of vehicles.keys()) remove(id); tire.dispose(); },
    };
  },
});
