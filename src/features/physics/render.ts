import { Matrix4, Mesh, MeshBasicNodeMaterial } from "three/webgpu";
import { parseComponentTypeTag, type ActorId, type WorldActor } from "../../core/index.ts";
import { createShapeGeometry, SHAPE_SOLID_SIZE } from "../../render/resources/shapes.ts";
import { defineRenderBinding } from "../../render/sync/renderBinding.ts";
import { componentWorldMatrix } from "../../render/sync/transforms.ts";
import { BlockingVolume, type BlockingVolumeData } from "./schema.ts";

export default defineRenderBinding({
  feature: "forge.physics",
  create(ctx) {
    const placed = new Map<ActorId, Mesh[]>();
    const material = new MeshBasicNodeMaterial({ color: "#e69b4e", wireframe: true });
    const scale = new Matrix4();
    const add = (actors: readonly WorldActor[]) => {
      for (const actor of actors) for (const [key, component] of Object.entries(actor.components)) {
        if (parseComponentTypeTag(component.type)?.name !== BlockingVolume.name) continue;
        const data = component as unknown as BlockingVolumeData;
        if (!data.visibleInGame) continue;
        const geometry = createShapeGeometry(data.shape === "box" ? "cube" : data.shape);
        const mesh = new Mesh(geometry, material);
        mesh.name = `${actor.name}/${key}`;
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(componentWorldMatrix(ctx.world, actor, key)).multiply(scale.makeScale(
          data.size[0] / SHAPE_SOLID_SIZE, data.size[1] / SHAPE_SOLID_SIZE, data.size[2] / SHAPE_SOLID_SIZE,
        ));
        let volumes = placed.get(actor.id);
        if (!volumes) placed.set(actor.id, volumes = []);
        volumes.push(mesh);
        ctx.root.add(mesh);
      }
    };
    const remove = (id: ActorId) => {
      for (const mesh of placed.get(id) ?? []) {
        mesh.removeFromParent();
        mesh.geometry.dispose();
      }
      placed.delete(id);
    };
    return {
      actorsAdded: add,
      actorsRemoved: (actors) => { for (const { id } of actors) remove(id); },
      dispose() {
        for (const id of placed.keys()) remove(id);
        material.dispose();
      },
    };
  },
});
