// Shape: render binding. One mesh per `forge.shape` component, its geometry
// procedural (`shape:<primitive>`) and its lit material by colour, both from
// the host's resource cache. Instancing comes with the level viewer (plan
// phase 3, step 8); edits reach the binding with the editor (phase 4).

import { Mesh } from "three/webgpu";
import { parseComponentTypeTag, type WorldActor } from "../../core/index.ts";
import { resourceKey } from "../../render/resources/resourceCache.ts";
import { shapeMaterialKey } from "../../render/resources/worldResources.ts";
import { defineRenderBinding } from "../../render/sync/renderBinding.ts";
import { componentWorldMatrix } from "../../render/sync/transforms.ts";
import { Shape, type ShapeData } from "./schema.ts";

interface Placed {
  mesh: Mesh | null;
  removed: boolean;
  readonly keys: readonly string[];
}

export default defineRenderBinding({
  feature: "forge.shape",
  create(ctx) {
    const placed = new Map<string, Placed>();
    const shapesOf = (actor: WorldActor) =>
      Object.entries(actor.components).filter(([, component]) => parseComponentTypeTag(component.type)?.name === Shape.name);

    const add = (actor: WorldActor, key: string, data: ShapeData): void => {
      const doubleSided = data.primitive === "plane";
      const entry: Placed = {
        mesh: null,
        removed: false,
        keys: [resourceKey.shape(data.primitive), shapeMaterialKey(data.color, doubleSided)],
      };
      placed.set(`${actor.id}/${key}`, entry);
      void Promise.all([ctx.resources.shapeGeometry(data.primitive), ctx.resources.shapeMaterial(data.color, doubleSided)]).then(
        ([geometry, material]) => {
          if (entry.removed) return;
          const mesh = new Mesh(geometry, material);
          mesh.name = `${actor.name}/${key}`;
          mesh.matrixAutoUpdate = false;
          // Every shape casts and receives until forge.shape gains castShadow (plan phase 3 step 4).
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          componentWorldMatrix(ctx.world, actor, key, mesh.matrix);
          mesh.matrixWorldNeedsUpdate = true;
          entry.mesh = mesh;
          ctx.root.add(mesh);
        },
      );
    };

    const remove = (id: string): void => {
      const entry = placed.get(id);
      if (!entry) return;
      placed.delete(id);
      entry.removed = true;
      entry.mesh?.removeFromParent();
      for (const key of entry.keys) ctx.resources.release(key);
    };

    return {
      actorsAdded(actors) {
        for (const actor of actors) {
          for (const [key, component] of shapesOf(actor)) add(actor, key, component as unknown as ShapeData);
        }
      },
      actorsRemoved(actors) {
        for (const actor of actors) for (const [key] of shapesOf(actor)) remove(`${actor.id}/${key}`);
      },
      dispose() {
        for (const id of [...placed.keys()]) remove(id);
      },
    };
  },
});
